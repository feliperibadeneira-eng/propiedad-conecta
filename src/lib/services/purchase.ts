import { prisma, type Db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import type {
  ContactMethod,
  ContactRevealDirection,
  ContactRevealPath,
  LeadPurchaseStatus,
  RefundRequestCategory,
} from "@/generated/prisma/enums";
import { notify } from "@/lib/services/notifications";
import { logEvent } from "@/lib/services/analytics";
import { logAudit } from "@/lib/services/audit";
import { getUnlockCost } from "@/lib/services/credits";
import {
  recomputeRequestStatus,
  recordStatusChange,
} from "@/lib/services/requests";
import {
  refundReasonSchema,
  refundEvidenceSchema,
  decisionReasonSchema,
} from "@/lib/validators/refund";
import {
  OCCUPYING_STATUSES,
  MODIFIABLE_BY_LEGACY_ACTIONS,
  REACTIVATION_ELIGIBLE_STATUSES,
} from "@/lib/services/constants";
import {
  getReactivationHours,
  getRefundEligibleHours,
  getContactProtectionHours,
} from "@/lib/settings";

export class PurchaseError extends Error {}

// ---------- Protección de contacto (ventana tras la compra) ----------
//
// Reglas fundamentales únicamente: este módulo todavía no las usa para
// bloquear nada (eso es el PR que implementa el control de acceso real).
// Aquí solo se calcula y persiste protectedUntil al momento de comprar, y
// se deja lista la función que una capa de lectura futura usará para
// decidir si el teléfono/WhatsApp/email del comprador se puede mostrar.

// protectedUntil se calcula una sola vez, con el valor de configuración
// vigente en el momento de la compra — nunca se recalcula después, para
// que cambiar la configuración no altere compras ya hechas.
export function computeContactProtectionDeadline(
  revealedAt: Date,
  protectionHours: number,
): Date {
  return new Date(revealedAt.getTime() + protectionHours * 60 * 60 * 1000);
}

// consentReleasedAt no tiene columna todavía (no existe ninguna acción que
// lo pueda establecer en este PR) — el parámetro ya está en la firma para
// que ese PR futuro solo necesite agregar la columna y empezar a pasarla,
// sin tocar esta función.
export function isContactAccessible(
  exchange: { protectedUntil: Date | null; consentReleasedAt?: Date | null },
  now: Date = new Date(),
): boolean {
  if (exchange.protectedUntil === null) return true; // compra anterior a esta función, o protección desactivada
  if (exchange.consentReleasedAt) return true;
  return now >= exchange.protectedUntil;
}

// ---------- Protección bilateral de contacto: revelación (Camino A/B) ----------
//
// Protocolo de concurrencia uniforme para las 8 funciones nuevas: la
// primera operación de cada transacción es un SELECT ... FOR UPDATE sobre
// LeadPurchase (nunca sobre ninguna otra fila primero) — así todas
// comparten el mismo orden de bloqueo y no pueden deadlockear entre sí.
// Las condiciones de autorización/estado se reevalúan sobre lo que ese
// SELECT devuelve, nunca sobre una lectura previa fuera de la transacción.

type LockedLeadPurchase = {
  id: string;
  requestId: string;
  agentId: string;
  status: LeadPurchaseStatus;
  contactedAt: Date | null;
  externalContactRevealedAt: Date | null;
};

async function lockLeadPurchaseForAgent(
  tx: Prisma.TransactionClient,
  leadPurchaseId: string,
  agentProfileId: string,
): Promise<LockedLeadPurchase> {
  const rows = await tx.$queryRaw<LockedLeadPurchase[]>`
    SELECT id, "requestId", "agentId", status, "contactedAt", "externalContactRevealedAt"
    FROM "LeadPurchase" WHERE id = ${leadPurchaseId} FOR UPDATE
  `;
  const lp = rows[0];
  if (!lp || lp.agentId !== agentProfileId) {
    throw new PurchaseError("No autorizado.");
  }
  return lp;
}

type LockedLeadPurchaseForBuyer = LockedLeadPurchase & { buyerId: string };

async function lockLeadPurchaseForBuyer(
  tx: Prisma.TransactionClient,
  leadPurchaseId: string,
  buyerProfileId: string,
): Promise<LockedLeadPurchaseForBuyer> {
  const rows = await tx.$queryRaw<LockedLeadPurchaseForBuyer[]>`
    SELECT lp.id, lp."requestId", lp."agentId", lp.status, lp."contactedAt",
           lp."externalContactRevealedAt", pr."buyerId"
    FROM "LeadPurchase" lp JOIN "PropertyRequest" pr ON pr.id = lp."requestId"
    WHERE lp.id = ${leadPurchaseId} FOR UPDATE OF lp
  `;
  const lp = rows[0];
  if (!lp || lp.buyerId !== buyerProfileId) {
    throw new PurchaseError("No autorizado.");
  }
  return lp;
}

// Idempotente frente a doble clic / varias pestañas: el índice único
// [leadPurchaseId, direction, method] es la garantía real. Usa `createMany`
// con `skipDuplicates: true` (ON CONFLICT DO NOTHING) en vez de `create` +
// catch de P2002 (Etapa 2.1): un error de unicidad capturado dentro de una
// transacción, sin SAVEPOINT, deja esa transacción "abortada" en Postgres
// — cualquier statement posterior (incluidos logAudit/recordStatusChange
// con `tx`, o la siguiente fila de este mismo loop) fallaría con 25P02
// aunque el catch nunca lo deje ver. skipDuplicates nunca lanza, así que
// nunca aborta nada.
async function createRevealEvents(
  tx: Prisma.TransactionClient,
  data: {
    leadPurchaseId: string;
    direction: ContactRevealDirection;
    method: ContactMethod;
    path: ContactRevealPath;
    initiatedByUserId: string;
    authorizedByUserId: string;
    revealedByUserId: string;
    contactReleaseRequestId?: string | null;
    noticeVersion: string;
  }[],
): Promise<number> {
  if (data.length === 0) return 0;
  const result = await tx.contactRevealEvent.createMany({ data, skipDuplicates: true });
  return result.count;
}

// Camino A: el agente revela uno o más de sus propios métodos, en
// cualquier momento, sin plazo ni mensaje previo — la única condición es
// que no haya una devolución pendiente (ver especificación, decisión 2).
export async function revealOwnContact(params: {
  agentProfileId: string;
  agentUserId: string;
  leadPurchaseId: string;
  methods: ContactMethod[];
  noticeVersion: string;
}) {
  if (params.methods.length === 0) {
    throw new PurchaseError("Elegí al menos un método para revelar.");
  }
  return prisma.$transaction(async (tx) => {
    const lp = await lockLeadPurchaseForAgent(tx, params.leadPurchaseId, params.agentProfileId);
    if (lp.status === "REFUND_REQUESTED") {
      throw new PurchaseError("No se puede revelar contacto mientras hay una devolución pendiente.");
    }

    const agentUser = await tx.user.findUniqueOrThrow({
      where: { id: params.agentUserId },
      select: { phone: true },
    });
    const agentProfile = await tx.agentProfile.findUniqueOrThrow({
      where: { id: params.agentProfileId },
      select: { whatsapp: true },
    });
    for (const method of params.methods) {
      if (method === "PHONE" && !agentUser.phone) {
        throw new PurchaseError("No tenés un teléfono registrado para revelar.");
      }
      if (method === "WHATSAPP" && !agentProfile.whatsapp) {
        throw new PurchaseError("No tenés un WhatsApp registrado para revelar.");
      }
    }

    const createdCount = await createRevealEvents(
      tx,
      params.methods.map((method) => ({
        leadPurchaseId: params.leadPurchaseId,
        direction: "AGENT_TO_BUYER" as const,
        method,
        path: "AGENT_INITIATED" as const,
        initiatedByUserId: params.agentUserId,
        authorizedByUserId: params.agentUserId,
        revealedByUserId: params.agentUserId,
        noticeVersion: params.noticeVersion,
      })),
    );
    const anyCreated = createdCount > 0;
    if (anyCreated && lp.externalContactRevealedAt === null) {
      await tx.leadPurchase.update({
        where: { id: params.leadPurchaseId },
        data: { externalContactRevealedAt: new Date() },
      });
    }

    // logAudit ahora acepta `tx` (Etapa 2.1): queda DENTRO de la misma
    // transacción que el reveal, reutilizando su conexión — nunca compite
    // por una segunda conexión del pool mientras `tx` sostiene el FOR
    // UPDATE (esa competencia, con el cliente prisma global, era la causa
    // del autobloqueo encontrado en la Etapa 2). Esto además restaura la
    // atomicidad: si logAudit falla, el reveal también hace rollback.
    await logAudit(
      {
        userId: params.agentUserId,
        action: "CONTACT_REVEALED_AGENT_INITIATED",
        entityType: "LeadPurchase",
        entityId: params.leadPurchaseId,
        metadata: { methods: params.methods },
      },
      tx,
    );
  });
}

// Camino B, paso 1: el comprador pide compartir contacto externo. Al
// pedirlo ya autoriza compartir todo lo que puso en su solicitud (ver
// texto de aviso aprobado) — no revela nada todavía, solo crea la
// solicitud pendiente. Máximo una PENDING por lead, garantizado por el
// índice único parcial además de este lock.
export async function requestContactRelease(params: {
  buyerProfileId: string;
  buyerUserId: string;
  leadPurchaseId: string;
  noticeVersion: string;
}) {
  return prisma.$transaction(async (tx) => {
    await lockLeadPurchaseForBuyer(tx, params.leadPurchaseId, params.buyerProfileId);

    const existingPending = await tx.contactReleaseRequest.findFirst({
      where: { leadPurchaseId: params.leadPurchaseId, status: "PENDING" },
      select: { id: true },
    });
    if (existingPending) {
      throw new PurchaseError("Ya hay una solicitud de contacto pendiente para este lead.");
    }

    try {
      return await tx.contactReleaseRequest.create({
        data: {
          leadPurchaseId: params.leadPurchaseId,
          requestedByUserId: params.buyerUserId,
          noticeVersion: params.noticeVersion,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new PurchaseError("Ya hay una solicitud de contacto pendiente para este lead.");
      }
      throw e;
    }
  });
}

// Camino B, paso 2a: el agente aprueba — elige cuáles de sus PROPIOS
// métodos revela (mismo criterio de autodeterminación que el Camino A); los
// del comprador se revelan todos los que haya puesto en su solicitud, sin
// selección adicional, porque pedir el intercambio ya fue su autorización.
export async function approveContactReleaseRequest(params: {
  agentProfileId: string;
  agentUserId: string;
  contactReleaseRequestId: string;
  methods: ContactMethod[];
  approvalNoticeVersion: string;
}) {
  if (params.methods.length === 0) {
    throw new PurchaseError("Elegí al menos un método propio para revelar.");
  }
  await prisma.$transaction(async (tx) => {
    const request = await tx.contactReleaseRequest.findUnique({
      where: { id: params.contactReleaseRequestId },
      select: { id: true, leadPurchaseId: true, requestedByUserId: true },
    });
    if (!request) throw new PurchaseError("Solicitud no encontrada.");

    const lp = await lockLeadPurchaseForAgent(tx, request.leadPurchaseId, params.agentProfileId);
    if (lp.status === "REFUND_REQUESTED") {
      throw new PurchaseError("No se puede aprobar mientras hay una devolución pendiente.");
    }

    const agentUser = await tx.user.findUniqueOrThrow({
      where: { id: params.agentUserId },
      select: { phone: true },
    });
    const agentProfile = await tx.agentProfile.findUniqueOrThrow({
      where: { id: params.agentProfileId },
      select: { whatsapp: true },
    });
    for (const method of params.methods) {
      if (method === "PHONE" && !agentUser.phone) {
        throw new PurchaseError("No tenés un teléfono registrado para revelar.");
      }
      if (method === "WHATSAPP" && !agentProfile.whatsapp) {
        throw new PurchaseError("No tenés un WhatsApp registrado para revelar.");
      }
    }

    const cas = await tx.contactReleaseRequest.updateMany({
      where: { id: params.contactReleaseRequestId, status: "PENDING" },
      data: {
        status: "APPROVED",
        decidedByUserId: params.agentUserId,
        decidedAt: new Date(),
        approvalNoticeVersion: params.approvalNoticeVersion,
      },
    });
    if (cas.count === 0) throw new PurchaseError("Esta solicitud ya fue procesada.");

    // El comprador ya autorizó compartir todo lo que puso en su solicitud
    // al pedir el intercambio (ver texto de aviso de Camino B) — no hay un
    // WhatsApp distinto del teléfono para el comprador en PropertyRequest.
    const buyerData = await tx.leadPurchase.findUniqueOrThrow({
      where: { id: request.leadPurchaseId },
      select: { request: { select: { contactEmail: true } } },
    });
    const buyerMethods: ContactMethod[] = ["PHONE"];
    if (buyerData.request.contactEmail) buyerMethods.push("EMAIL");

    // Un solo createMany (skipDuplicates) para ambas direcciones — ver el
    // comentario de createRevealEvents: evita que un duplicado en la
    // primera fila aborte la transacción antes de llegar a las demás.
    const createdCount = await createRevealEvents(tx, [
      ...params.methods.map((method) => ({
        leadPurchaseId: request.leadPurchaseId,
        direction: "AGENT_TO_BUYER" as const,
        method,
        path: "BUYER_REQUEST_APPROVED" as const,
        initiatedByUserId: request.requestedByUserId,
        authorizedByUserId: params.agentUserId,
        revealedByUserId: params.agentUserId,
        contactReleaseRequestId: request.id,
        noticeVersion: params.approvalNoticeVersion,
      })),
      ...buyerMethods.map((method) => ({
        leadPurchaseId: request.leadPurchaseId,
        direction: "BUYER_TO_AGENT" as const,
        method,
        path: "BUYER_REQUEST_APPROVED" as const,
        initiatedByUserId: request.requestedByUserId,
        authorizedByUserId: params.agentUserId,
        revealedByUserId: params.agentUserId,
        contactReleaseRequestId: request.id,
        noticeVersion: params.approvalNoticeVersion,
      })),
    ]);
    const anyCreated = createdCount > 0;

    if (anyCreated && lp.externalContactRevealedAt === null) {
      await tx.leadPurchase.update({
        where: { id: request.leadPurchaseId },
        data: { externalContactRevealedAt: new Date() },
      });
    }

    // Ver el comentario equivalente en revealOwnContact: logAudit queda
    // DENTRO de tx (acepta tx desde la Etapa 2.1), nunca después del commit.
    await logAudit(
      {
        userId: params.agentUserId,
        action: "CONTACT_RELEASE_APPROVED",
        entityType: "ContactReleaseRequest",
        entityId: request.id,
        metadata: { leadPurchaseId: request.leadPurchaseId },
      },
      tx,
    );
  });
}

export async function rejectContactReleaseRequest(params: {
  agentProfileId: string;
  agentUserId: string;
  contactReleaseRequestId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.contactReleaseRequest.findUnique({
      where: { id: params.contactReleaseRequestId },
      select: { leadPurchaseId: true },
    });
    if (!request) throw new PurchaseError("Solicitud no encontrada.");
    await lockLeadPurchaseForAgent(tx, request.leadPurchaseId, params.agentProfileId);

    const cas = await tx.contactReleaseRequest.updateMany({
      where: { id: params.contactReleaseRequestId, status: "PENDING" },
      data: { status: "REJECTED", decidedByUserId: params.agentUserId, decidedAt: new Date() },
    });
    if (cas.count === 0) throw new PurchaseError("Esta solicitud ya fue procesada.");
  });
}

export async function cancelContactReleaseRequest(params: {
  buyerProfileId: string;
  buyerUserId: string;
  contactReleaseRequestId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.contactReleaseRequest.findUnique({
      where: { id: params.contactReleaseRequestId },
      select: { leadPurchaseId: true, requestedByUserId: true },
    });
    if (!request || request.requestedByUserId !== params.buyerUserId) {
      throw new PurchaseError("No autorizado.");
    }
    await lockLeadPurchaseForBuyer(tx, request.leadPurchaseId, params.buyerProfileId);

    const cas = await tx.contactReleaseRequest.updateMany({
      where: {
        id: params.contactReleaseRequestId,
        status: "PENDING",
        requestedByUserId: params.buyerUserId,
      },
      data: { status: "CANCELLED", decidedAt: new Date() },
    });
    if (cas.count === 0) throw new PurchaseError("Esta solicitud ya fue procesada.");
  });
}

// Lectura de solo lectura: el conjunto de métodos efectivamente
// autorizados en una dirección — nunca se infiere de qué campos tiene
// no-nulos el perfil, solo de los eventos ya persistidos. La capa de
// presentación (fuera de esta etapa) debe usar esto para decidir qué
// mostrar, campo por campo, nunca serializando el perfil completo.
export async function getRevealedContactMethods(
  leadPurchaseId: string,
  direction: ContactRevealDirection,
): Promise<ContactMethod[]> {
  const events = await prisma.contactRevealEvent.findMany({
    where: { leadPurchaseId, direction },
    select: { method: true },
  });
  return events.map((e) => e.method);
}

// Reglas 2,3,4,5,8: valida que este agente puede comprar este lead. Acepta
// un cliente de transacción opcional para poder re-validar en frío dentro
// de la misma transacción atómica que hace el cobro (defensa en
// profundidad: nada de esto se confía desde el cliente).
async function assertPurchasable(
  db: Db,
  requestId: string,
  agentProfileId: string,
) {
  const request = await db.propertyRequest.findUnique({
    where: { id: requestId },
    include: { purchases: true, buyer: true },
  });
  if (!request) throw new PurchaseError("La solicitud no existe.");
  if (request.status === "CERRADA") {
    throw new PurchaseError("Esta solicitud ya está cerrada.");
  }
  if (request.status === "PAUSADA") {
    throw new PurchaseError("Esta solicitud está pausada.");
  }

  // Regla 3: un agente no puede comprar su propia solicitud (mismo User
  // detrás de ambos perfiles, si alguna vez usa la plataforma con los dos
  // roles y el mismo email).
  const agentProfile = await db.agentProfile.findUnique({
    where: { id: agentProfileId },
    select: { userId: true },
  });
  if (!agentProfile) throw new PurchaseError("Perfil de agente no encontrado.");
  if (request.buyer.userId === agentProfile.userId) {
    throw new PurchaseError("No puedes comprar el contacto de tu propia solicitud.");
  }

  const alreadyBought = request.purchases.some(
    (p) => p.agentId === agentProfileId,
  );
  if (alreadyBought) {
    throw new PurchaseError("Ya compraste el contacto de esta solicitud.");
  }
  const occupied = request.purchases.filter((p) =>
    OCCUPYING_STATUSES.includes(p.status),
  ).length;
  if (occupied >= request.maxAgents) {
    throw new PurchaseError(
      "Esta solicitud ya alcanzó el máximo de agentes permitido.",
    );
  }
  return request;
}

// Si se pasa un propertyId, debe existir y pertenecer a este agente — sin
// importar su status (DISPONIBLE/PAUSADA/CERRADA): la atribución es un
// hecho histórico de "con qué propiedad se iba a contactar en este
// momento", no una referencia que deba seguir vigente (ver el informe de
// PR #14). A propósito NO se filtra por status acá.
//
// Si el propertyId es inválido o pertenece a otro agente, se rechaza TODO
// el desbloqueo (nunca se degrada a null en silencio) — un valor inválido
// representa un problema de autorización, navegación o manipulación del
// parámetro, y la atribución debe ser confiable o no existir.
async function assertPropertyOwnership(
  db: Db,
  propertyId: string,
  agentProfileId: string,
) {
  const property = await db.property.findFirst({
    where: { id: propertyId, agentId: agentProfileId },
    select: { id: true },
  });
  if (!property) {
    throw new PurchaseError("La propiedad de origen no existe o no te pertenece.");
  }
}

// El backend es la única fuente de verdad sobre si un pago se confirmó
// (regla 6/7 y sección 17): esta función solo se llama desde el webhook de
// Stripe (o, en modo demo, desde el simulador de pago del propio backend).
// Es idempotente: si el LeadPurchase ya existe, no hace nada más.
export async function confirmPaymentById(paymentId: string) {
  // Fuera de la transacción a propósito: es una lectura async a la base de
  // datos, igual que getReactivationHours/getRefundEligibleHours en el resto
  // de este archivo — nunca se llama a prisma.* dentro de un $transaction.
  const protectionHours = await getContactProtectionHours();
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      include: { leadPurchase: true, request: { include: { buyer: { include: { user: true } } } }, agent: { include: { user: true } } },
    });
    if (!payment) throw new PurchaseError("Pago no encontrado.");
    if (payment.leadPurchase) return payment.leadPurchase; // ya procesado

    // Re-chequear cupos dentro de la transacción (dos agentes podrían haber
    // iniciado el checkout casi al mismo tiempo). Si ya no hay cupo, se
    // lanza un error y se rompe fuera de la transacción (más abajo) para
    // marcar el pago como REFUNDED — un throw aquí adentro haría rollback
    // de cualquier update que intentemos en esta misma transacción.
    const activePurchases = await tx.leadPurchase.findMany({
      where: { requestId: payment.requestId },
    });
    const occupied = activePurchases.filter((p) =>
      OCCUPYING_STATUSES.includes(p.status),
    ).length;
    if (occupied >= payment.request.maxAgents) {
      throw new PurchaseError(
        "El lead alcanzó su máximo de agentes justo antes de confirmarse este pago; debe reembolsarse.",
      );
    }

    if (payment.status !== "SUCCEEDED") {
      await tx.payment.update({
        where: { id: paymentId },
        data: { status: "SUCCEEDED", confirmedAt: new Date() },
      });
    }

    const leadPurchase = await tx.leadPurchase.create({
      data: {
        requestId: payment.requestId,
        agentId: payment.agentId,
        paymentId: payment.id,
        pricePaid: payment.amount,
        creditsUsed: 1,
        status: "PURCHASED",
      },
    });

    await tx.contactExchange.create({
      data: {
        requestId: payment.requestId,
        leadPurchaseId: leadPurchase.id,
        buyerId: payment.request.buyer.userId,
        agentId: payment.agent.userId,
        protectedUntil: computeContactProtectionDeadline(
          new Date(),
          protectionHours,
        ),
      },
    });

    await tx.leadStatusHistory.create({
      data: {
        requestId: payment.requestId,
        leadPurchaseId: leadPurchase.id,
        fromStatus: "AVAILABLE",
        toStatus: "PURCHASED",
      },
    });

    return leadPurchase;
  }).catch(async (err) => {
    if (err instanceof PurchaseError) {
      // La transacción hizo rollback: el pago sigue como estaba antes
      // (PENDING). Lo marcamos REFUNDED por fuera para que quede visible
      // en /admin/pagos que este cobro debe devolverse manualmente.
      await prisma.payment
        .update({ where: { id: paymentId }, data: { status: "REFUNDED" } })
        .catch(() => {});
    }
    throw err;
  }).then(async (leadPurchase) => {
    // Efectos secundarios fuera de la transacción principal.
    const full = await prisma.leadPurchase.findUniqueOrThrow({
      where: { id: leadPurchase.id },
      include: {
        request: { include: { buyer: { include: { user: true } } } },
        agent: { include: { user: true } },
      },
    });

    await recomputeRequestStatus(full.requestId);

    await notify(
      full.request.buyer.userId,
      "lead_purchased_buyer",
      "Un agente desbloqueó tu solicitud",
      `${full.agent.user.name} desbloqueó tu solicitud y ahora tienes sus datos de contacto.`,
    );
    await notify(
      full.agent.userId,
      "lead_purchased_agent",
      "Compraste un lead",
      `Ya tienes los datos de contacto de ${full.request.buyer.user.name}.`,
    );
    await logEvent("lead_purchased", {
      requestId: full.requestId,
      agentId: full.agentId,
    });
    await logEvent("contact_revealed", {
      requestId: full.requestId,
      agentId: full.agentId,
    });
    await logAudit({
      userId: full.agent.userId,
      action: "LEAD_PURCHASED",
      entityType: "LeadPurchase",
      entityId: full.id,
    });

    return full;
  });
}

// Sistema de créditos (sección 6): reemplaza el pago con Stripe como forma
// de desbloquear un lead. El costo depende del tipo de operación (10
// créditos comprar / 2 alquilar). Todo el flujo — validar disponibilidad,
// validar y descontar créditos, crear el desbloqueo, registrar el
// movimiento en el ledger — ocurre dentro de UNA sola transacción atómica,
// para que no puedan existir cobros dobles ni desbloqueos a medias.
export async function purchaseWithCredits(params: {
  agentUserId: string;
  agentProfileId: string;
  requestId: string;
  // Propiedad desde la que se originó este desbloqueo (opcional — ver
  // assertPropertyOwnership). Nunca participa en el costo del unlock.
  propertyId?: string;
}) {
  // Fuera de la transacción a propósito, igual que getReactivationHours en
  // reactivateLeadPurchase: nunca se llama a prisma.* (fuera de tx.*) con
  // una transacción interactiva abierta.
  const protectionHours = await getContactProtectionHours();
  const leadPurchase = await prisma.$transaction(async (tx) => {
    // 1-3: la solicitud sigue disponible, el agente no la compró antes,
    // hay cupo. Se revalida aquí adentro (no se reutiliza ningún dato leído
    // antes de abrir la transacción) para que sea la fuente de verdad.
    const request = await assertPurchasable(
      tx,
      params.requestId,
      params.agentProfileId,
    );
    // Si se pasó una propiedad de origen, debe ser válida ANTES de cobrar
    // ningún crédito — si falla, no se descuenta balance ni se crea nada.
    if (params.propertyId) {
      await assertPropertyOwnership(tx, params.propertyId, params.agentProfileId);
    }
    const cost = getUnlockCost(request.operationType);

    // Verificar y descontar créditos de forma atómica: el update solo
    // aplica si el saldo alcanza, así que dos clics simultáneos no pueden
    // dejar el balance en negativo ni desbloquear sin cobrar.
    const debited = await tx.agentProfile.updateMany({
      where: { id: params.agentProfileId, creditsBalance: { gte: cost } },
      data: { creditsBalance: { decrement: cost } },
    });
    if (debited.count === 0) {
      throw new PurchaseError(
        `No tienes créditos suficientes para desbloquear este lead (cuesta ${cost} créditos).`,
      );
    }
    const agentAfter = await tx.agentProfile.findUniqueOrThrow({
      where: { id: params.agentProfileId },
      select: { creditsBalance: true },
    });

    // 4: crear el registro del desbloqueo. Payment se mantiene como
    // registro de la "transacción" (reutilizando el modelo existente en
    // vez de duplicarlo), ya confirmado porque el cobro en créditos es
    // síncrono — no hay nada async que esperar como con Stripe.
    const payment = await tx.payment.create({
      data: {
        agentId: params.agentProfileId,
        requestId: request.id,
        amount: cost,
        currency: "credit",
        status: "SUCCEEDED",
        confirmedAt: new Date(),
      },
    });
    const created = await tx.leadPurchase.create({
      data: {
        requestId: request.id,
        agentId: params.agentProfileId,
        paymentId: payment.id,
        propertyId: params.propertyId ?? null,
        pricePaid: cost,
        creditsUsed: cost,
        status: "PURCHASED",
      },
    });

    await tx.contactExchange.create({
      data: {
        requestId: request.id,
        leadPurchaseId: created.id,
        buyerId: request.buyer.userId,
        agentId: params.agentUserId,
        protectedUntil: computeContactProtectionDeadline(
          new Date(),
          protectionHours,
        ),
      },
    });

    // PR #16: el hilo de conversación nace junto con el LeadPurchase y el
    // ContactExchange, en la misma transacción — nunca de forma perezosa
    // en el primer mensaje. Sin backfill: los LeadPurchase anteriores a
    // este cambio quedan sin Conversation.
    await tx.conversation.create({
      data: { leadPurchaseId: created.id },
    });

    // 5: registrar la transacción negativa en el ledger de créditos.
    await tx.creditLedgerEntry.create({
      data: {
        agentId: params.agentProfileId,
        amount: -cost,
        balanceAfter: agentAfter.creditsBalance,
        reason: "LEAD_UNLOCK",
        description: `Desbloqueo de solicitud de ${request.operationType === "COMPRAR" ? "compra" : "alquiler"}`,
        leadPurchaseId: created.id,
      },
    });

    await tx.leadStatusHistory.create({
      data: {
        requestId: request.id,
        leadPurchaseId: created.id,
        fromStatus: "AVAILABLE",
        toStatus: "PURCHASED",
      },
    });

    // 6: solo llegar hasta acá (transacción confirmada) permite acceder al
    // contacto — las páginas que lo muestran solo consultan LeadPurchase
    // filas que ya existen y confirmaron, nunca un estado intermedio.
    return created;
  });

  // Efectos secundarios fuera de la transacción principal (no deben poder
  // hacer rollback del cobro si fallan).
  const full = await prisma.leadPurchase.findUniqueOrThrow({
    where: { id: leadPurchase.id },
    include: {
      request: { include: { buyer: { include: { user: true } } } },
      agent: { include: { user: true } },
    },
  });

  await recomputeRequestStatus(full.requestId);
  await notify(
    full.request.buyer.userId,
    "lead_purchased_buyer",
    "Un agente desbloqueó tu solicitud",
    `${full.agent.user.name} desbloqueó tu solicitud y ahora tienes sus datos de contacto.`,
  );
  await notify(
    full.agent.userId,
    "lead_purchased_agent",
    "Compraste un lead",
    `Ya tienes los datos de contacto de ${full.request.buyer.user.name}.`,
  );
  await logEvent("lead_purchased", {
    requestId: full.requestId,
    agentId: full.agentId,
  });
  await logEvent("contact_revealed", {
    requestId: full.requestId,
    agentId: full.agentId,
  });
  await logAudit({
    userId: full.agent.userId,
    action: "LEAD_PURCHASED",
    entityType: "LeadPurchase",
    entityId: full.id,
  });

  return full;
}

// Nota sobre la sección 27: el contacto nunca se filtra desde aquí — las
// páginas de agente/buyer ya consultan getPurchasedLeadDetail /
// getBuyerRequestDetail, que solo devuelven filas donde agentId/buyerId
// coincide con el perfil autenticado. No hay otro camino para leerlo.

// ---------- Liberar / feedback / reactivación (secciones 20-23) ----------

export async function releaseLead(
  agentProfileId: string,
  leadPurchaseId: string,
  reason: string,
) {
  const purchase = await prisma.leadPurchase.findUnique({
    where: { id: leadPurchaseId },
  });
  if (!purchase || purchase.agentId !== agentProfileId) {
    throw new PurchaseError("No autorizado.");
  }
  // CAS: la condición de estado (y la propiedad, repetida acá) viaja en el
  // WHERE de la misma escritura — si una devolución se puso PENDING justo
  // antes, este update no afecta ninguna fila y falla limpio, en vez de
  // pisar un estado reservado para approveRefund/rejectRefund.
  const cas = await prisma.leadPurchase.updateMany({
    where: {
      id: leadPurchaseId,
      agentId: agentProfileId,
      status: { in: MODIFIABLE_BY_LEGACY_ACTIONS },
    },
    data: { status: "RELEASED", releasedAt: new Date(), releaseReason: reason },
  });
  if (cas.count === 0) {
    throw new PurchaseError("Este lead ya no está activo.");
  }
  await recordStatusChange(purchase.requestId, purchase.status, "RELEASED", {
    reason,
    leadPurchaseId,
  });
  await recomputeRequestStatus(purchase.requestId);
  await logEvent("lead_released", {
    requestId: purchase.requestId,
    agentId: agentProfileId,
  });
}

export async function markAgentContacted(
  agentProfileId: string,
  leadPurchaseId: string,
) {
  const purchase = await prisma.leadPurchase.findUnique({
    where: { id: leadPurchaseId },
  });
  if (!purchase || purchase.agentId !== agentProfileId) {
    throw new PurchaseError("No autorizado.");
  }
  // Guarda nueva (ver auditoría de la Etapa 1): antes se podía marcar
  // "contactado" sin ninguna condición de estado, incluido sobre un lead
  // REFUND_REQUESTED/REFUNDED/CLOSED/RELEASED.
  const cas = await prisma.leadPurchase.updateMany({
    where: {
      id: leadPurchaseId,
      agentId: agentProfileId,
      status: { in: MODIFIABLE_BY_LEGACY_ACTIONS },
    },
    data: { status: "CONTACTED", contactedAt: new Date() },
  });
  if (cas.count === 0) {
    throw new PurchaseError("Este lead ya no está activo.");
  }
  await recordStatusChange(purchase.requestId, purchase.status, "CONTACTED", {
    leadPurchaseId,
  });
  await logEvent("lead_contacted", {
    requestId: purchase.requestId,
    agentId: agentProfileId,
  });
}

// Sección 7: el agente marca que agendó una cita/visita con el interesado.
export async function markAppointmentScheduled(
  agentProfileId: string,
  leadPurchaseId: string,
) {
  const purchase = await prisma.leadPurchase.findUnique({
    where: { id: leadPurchaseId },
  });
  if (!purchase || purchase.agentId !== agentProfileId) {
    throw new PurchaseError("No autorizado.");
  }
  const cas = await prisma.leadPurchase.updateMany({
    where: {
      id: leadPurchaseId,
      agentId: agentProfileId,
      status: { in: MODIFIABLE_BY_LEGACY_ACTIONS },
    },
    data: { status: "APPOINTMENT_SCHEDULED" },
  });
  if (cas.count === 0) {
    throw new PurchaseError("Este lead ya no está activo.");
  }
  await recordStatusChange(
    purchase.requestId,
    purchase.status,
    "APPOINTMENT_SCHEDULED",
    { leadPurchaseId },
  );
  await logEvent("lead_contacted", {
    requestId: purchase.requestId,
    agentId: agentProfileId,
    metadata: { appointmentScheduled: true },
  });
}

// El buyer confirmando "el agente me contactó" cuenta como que el lead
// "respondió" (RESPONDED): es la confirmación positiva que hace que la
// garantía de devolución ya no aplique sobre este lead.
const OUTCOME_TO_STATUS = {
  CONTACTED: "RESPONDED",
  NO_CONTACT: "NO_CONTACT",
  NO_MATCH: "NO_MATCH",
} as const;

// El buyer marca "qué ocurrió" con un agente puntual (sección 20). Las
// opciones que no son sobre un agente puntual (ya encontré propiedad / quiero
// seguir buscando) actúan sobre la solicitud completa, no sobre la compra.
export async function markBuyerOutcome(
  buyerProfileId: string,
  leadPurchaseId: string,
  outcome: "CONTACTED" | "NO_CONTACT" | "NO_MATCH" | "BUYER_CLOSED_FOUND" | "KEEP_SEARCHING",
) {
  const purchase = await prisma.leadPurchase.findUnique({
    where: { id: leadPurchaseId },
    include: { request: true },
  });
  if (!purchase || purchase.request.buyerId !== buyerProfileId) {
    throw new PurchaseError("No autorizado.");
  }

  if (outcome === "BUYER_CLOSED_FOUND") {
    await recordStatusChange(purchase.requestId, purchase.request.status, "CERRADA");
    await prisma.propertyRequest.update({
      where: { id: purchase.requestId },
      data: { status: "CERRADA" },
    });
    await logEvent("request_closed", { requestId: purchase.requestId });
    return;
  }
  if (outcome === "KEEP_SEARCHING") {
    // No cambia el estado del lead; solo alimenta la señal de confianza
    // "ha confirmado que sigue buscando" (sección 3).
    await prisma.buyerProfile.update({
      where: { id: buyerProfileId },
      data: { lastConfirmedSearchingAt: new Date() },
    });
    return;
  }

  const newStatus = OUTCOME_TO_STATUS[outcome];
  // Guarda nueva (ver auditoría de la Etapa 1): antes no había ninguna
  // condición de estado para estas tres ramas tampoco.
  const cas = await prisma.leadPurchase.updateMany({
    where: {
      id: leadPurchaseId,
      status: { in: MODIFIABLE_BY_LEGACY_ACTIONS },
      request: { buyerId: buyerProfileId },
    },
    data: { status: newStatus },
  });
  if (cas.count === 0) {
    throw new PurchaseError("Este lead ya no está activo.");
  }
  await recordStatusChange(purchase.requestId, purchase.status, newStatus, {
    leadPurchaseId,
  });
  await recomputeRequestStatus(purchase.requestId);
}

export function isEligibleForReactivation(
  purchase: { status: string; purchasedAt: Date },
  reactivationHours: number,
): boolean {
  if (!REACTIVATION_ELIGIBLE_STATUSES.includes(purchase.status as never)) {
    return false;
  }
  const elapsedHours =
    (Date.now() - purchase.purchasedAt.getTime()) / (1000 * 60 * 60);
  return elapsedHours >= reactivationHours;
}

// Función administrativa/manual de reactivación (sección 20): no hay cron,
// un admin la dispara desde /admin cuando ya pasaron las horas configuradas.
export async function reactivateLeadPurchase(
  adminUserId: string,
  leadPurchaseId: string,
) {
  const purchase = await prisma.leadPurchase.findUniqueOrThrow({
    where: { id: leadPurchaseId },
  });
  const reactivationHours = await getReactivationHours();
  if (!isEligibleForReactivation(purchase, reactivationHours)) {
    throw new PurchaseError(
      `Este lead todavía no cumple las ${reactivationHours}h mínimas o no está en un estado reactivable.`,
    );
  }
  // CAS: mismo conjunto de elegibilidad de siempre (NO_CONTACT/NO_MATCH,
  // ya excluye REFUND_REQUESTED/REFUNDED por diseño) — solo se vuelve
  // atómico frente a una devolución que se solicite en el instante entre
  // la validación de arriba y esta escritura. La autorización de admin
  // (requireAdmin) ocurre en la capa de Server Action, no es una condición
  // de esta fila.
  const cas = await prisma.leadPurchase.updateMany({
    where: { id: leadPurchaseId, status: { in: REACTIVATION_ELIGIBLE_STATUSES } },
    data: { status: "REACTIVATED" },
  });
  if (cas.count === 0) {
    throw new PurchaseError(
      `Este lead todavía no cumple las ${reactivationHours}h mínimas o no está en un estado reactivable.`,
    );
  }
  await recordStatusChange(purchase.requestId, purchase.status, "REACTIVATED", {
    leadPurchaseId,
    changedByUserId: adminUserId,
  });
  await recomputeRequestStatus(purchase.requestId);
  await logAudit({
    userId: adminUserId,
    action: "LEAD_REACTIVATED",
    entityType: "LeadPurchase",
    entityId: leadPurchaseId,
  });
  const full = await prisma.leadPurchase.findUniqueOrThrow({
    where: { id: leadPurchaseId },
    include: { agent: true },
  });
  await logEvent("lead_reactivated", {
    requestId: full.requestId,
    agentId: full.agentId,
  });
}

// ---------- Garantía del lead: devolución de crédito (secciones 7-9) ----------
//
// Historial completo por intento (RefundRequest), nunca sobrescrito. Tres
// categorías con reglas de elegibilidad distintas; NO_RESPONSE/LEAD_QUALITY
// quedan bloqueadas en cuanto externalContactRevealedAt se fija;
// PLATFORM_ERROR sigue siendo reclamable siempre. category es inmutable
// tras crear — ninguna función de este archivo la modifica.

export function isEligibleForRefundCategory(
  category: RefundRequestCategory,
  purchase: {
    status: LeadPurchaseStatus;
    contactedAt: Date | null;
    externalContactRevealedAt: Date | null;
  },
  refundEligibleHours: number,
): boolean {
  if (category !== "PLATFORM_ERROR" && purchase.externalContactRevealedAt !== null) {
    return false;
  }
  if (category === "NO_RESPONSE") {
    if (purchase.status !== "CONTACTED") return false;
    if (!purchase.contactedAt) return false;
    const elapsedHours =
      (Date.now() - purchase.contactedAt.getTime()) / (1000 * 60 * 60);
    return elapsedHours >= refundEligibleHours;
  }
  // LEAD_QUALITY / PLATFORM_ERROR: cualquier estado activo, sin ventana de horas.
  return MODIFIABLE_BY_LEGACY_ACTIONS.includes(purchase.status);
}

// El agente pide la devolución de su crédito (sección 8): solo queda
// pendiente de revisión manual, nunca se aprueba sola. Máximo una PENDING
// por lead (índice único parcial + este chequeo bajo el lock). El lock
// FOR UPDATE sobre LeadPurchase es la primera operación de la transacción
// (protocolo uniforme de las 8 funciones nuevas) — las condiciones de
// elegibilidad se reevalúan sobre esa misma fila bloqueada, nunca sobre
// una lectura previa.
export async function requestRefund(params: {
  agentProfileId: string;
  agentUserId: string;
  leadPurchaseId: string;
  category: RefundRequestCategory;
  reason: string;
  evidence?: string;
}) {
  // Zod es la fuente única de verdad de estas reglas (también las valida
  // requestRefundSchema en el límite del Server Action) — el servicio las
  // re-valida acá como defensa en profundidad, mismo patrón que
  // parseTextBody/sendTextMessageSchema en conversation.ts.
  const parsedReason = refundReasonSchema.safeParse(params.reason);
  if (!parsedReason.success) {
    throw new PurchaseError(parsedReason.error.issues[0]?.message ?? "Motivo inválido.");
  }
  const parsedEvidence = refundEvidenceSchema.safeParse(params.evidence);
  if (!parsedEvidence.success) {
    throw new PurchaseError(parsedEvidence.error.issues[0]?.message ?? "Evidencia inválida.");
  }
  const reason = parsedReason.data;
  const evidence = parsedEvidence.data || null;

  const refundEligibleHours = await getRefundEligibleHours();
  const created = await prisma.$transaction(async (tx) => {
    const lp = await lockLeadPurchaseForAgent(tx, params.leadPurchaseId, params.agentProfileId);

    const existingPending = await tx.refundRequest.findFirst({
      where: { leadPurchaseId: params.leadPurchaseId, status: "PENDING" },
      select: { id: true },
    });
    if (existingPending) {
      throw new PurchaseError("Ya hay una solicitud de devolución pendiente para este lead.");
    }

    if (!isEligibleForRefundCategory(params.category, lp, refundEligibleHours)) {
      throw new PurchaseError(
        params.category === "NO_RESPONSE"
          ? `Todavía no pasaron las ${refundEligibleHours}h desde que marcaste "Contacté al lead", ya se reveló contacto externo, o este lead no está en un estado que permita pedir devolución.`
          : "Este lead no está en un estado que permita pedir devolución, o ya se reveló contacto externo.",
      );
    }

    const cas = await tx.leadPurchase.updateMany({
      where: { id: params.leadPurchaseId, status: lp.status },
      data: { status: "REFUND_REQUESTED", refundRequestedAt: new Date() },
    });
    if (cas.count === 0) {
      throw new PurchaseError("El estado del lead cambió, intentá de nuevo.");
    }

    let row;
    try {
      row = await tx.refundRequest.create({
        data: {
          leadPurchaseId: params.leadPurchaseId,
          requestedByUserId: params.agentUserId,
          category: params.category,
          reason,
          evidence,
          leadPurchaseStatusBefore: lp.status,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new PurchaseError("Ya hay una solicitud de devolución pendiente para este lead.");
      }
      throw e;
    }

    // recordStatusChange ahora acepta `tx` (Etapa 2.1): queda DENTRO de
    // esta misma transacción, reutilizando su conexión — ya no compite por
    // una segunda conexión del pool mientras `tx` sostiene el FOR UPDATE
    // (esa competencia, con el cliente prisma global, era la causa del
    // autobloqueo encontrado en la Etapa 2). El historial ahora es atómico
    // con el cambio de estado que describe.
    await recordStatusChange(
      lp.requestId,
      lp.status,
      "REFUND_REQUESTED",
      { leadPurchaseId: row.leadPurchaseId },
      tx,
    );

    return { row, requestId: lp.requestId };
  });

  // recomputeRequestStatus queda fuera a propósito: es una recomputación
  // derivada y autocurable (no forma parte del registro de
  // auditoría/historial que debe ser atómico), y meterla en esta
  // transacción ampliaría el bloqueo a PropertyRequest, que ninguna de las
  // 8 funciones nuevas bloquea hoy.
  await recomputeRequestStatus(created.requestId);
  return created.row;
}

// El administrador aprueba o rechaza (sección 9) — siempre manual, nunca
// automático. Ambas bloquean LeadPurchase primero (mismo protocolo), y
// condicionan tanto el RefundRequest como el LeadPurchase a su estado
// vigente dentro de la transacción: si dos admins deciden casi al mismo
// tiempo, solo el primero surte efecto.
export async function approveRefund(params: {
  adminUserId: string;
  refundRequestId: string;
  decisionReason: string;
}) {
  const parsedReason = decisionReasonSchema.safeParse(params.decisionReason);
  if (!parsedReason.success) {
    throw new PurchaseError(parsedReason.error.issues[0]?.message ?? "Motivo inválido.");
  }
  const decisionReason = parsedReason.data;

  const result = await prisma.$transaction(async (tx) => {
    const request = await tx.refundRequest.findUnique({
      where: { id: params.refundRequestId },
      select: { id: true, leadPurchaseId: true },
    });
    if (!request) throw new PurchaseError("Solicitud de devolución no encontrada.");

    const rows = await tx.$queryRaw<
      { id: string; requestId: string; agentId: string; status: LeadPurchaseStatus; creditsUsed: number }[]
    >`SELECT id, "requestId", "agentId", status, "creditsUsed" FROM "LeadPurchase" WHERE id = ${request.leadPurchaseId} FOR UPDATE`;
    const lp = rows[0];
    if (!lp || lp.status !== "REFUND_REQUESTED") {
      throw new PurchaseError("Esta solicitud de devolución ya fue procesada o no existe.");
    }

    // CAS: la condición status: "PENDING" es lo único que decide si esta
    // decisión surte efecto — decisionReason queda escrito acá dentro de
    // la misma escritura condicionada, nunca en una actualización
    // posterior, así que una RefundRequest ya decidida es estructuralmente
    // inmodificable (ninguna función de este archivo vuelve a tocar
    // decisionReason una vez puesto).
    const cas = await tx.refundRequest.updateMany({
      where: { id: params.refundRequestId, status: "PENDING" },
      data: {
        status: "APPROVED",
        decidedByUserId: params.adminUserId,
        decidedAt: new Date(),
        decisionReason,
      },
    });
    if (cas.count === 0) {
      throw new PurchaseError("Esta solicitud de devolución ya fue procesada o no existe.");
    }

    await tx.leadPurchase.update({
      where: { id: request.leadPurchaseId },
      data: { status: "REFUNDED", refundedAt: new Date() },
    });

    const agentAfter = await tx.agentProfile.update({
      where: { id: lp.agentId },
      data: { creditsBalance: { increment: lp.creditsUsed } },
    });
    await tx.creditLedgerEntry.create({
      data: {
        agentId: lp.agentId,
        amount: lp.creditsUsed,
        balanceAfter: agentAfter.creditsBalance,
        reason: "REFUND_APPROVED",
        description: "Devolución de crédito aprobada",
        leadPurchaseId: request.leadPurchaseId,
      },
    });

    // recordStatusChange y logAudit ahora aceptan `tx` (Etapa 2.1): quedan
    // DENTRO de esta misma transacción, reutilizando su conexión — ya no
    // compiten por una segunda conexión del pool mientras `tx` sostiene el
    // FOR UPDATE (esa competencia, con el cliente prisma global, era la
    // causa del autobloqueo encontrado en la Etapa 2). Historial y
    // auditoría ahora son atómicos con el cambio de estado y el crédito.
    await recordStatusChange(
      lp.requestId,
      "REFUND_REQUESTED",
      "REFUNDED",
      { leadPurchaseId: request.leadPurchaseId, changedByUserId: params.adminUserId },
      tx,
    );
    await logAudit(
      {
        userId: params.adminUserId,
        action: "REFUND_APPROVED",
        entityType: "RefundRequest",
        entityId: request.id,
        metadata: { decisionReason, leadPurchaseId: request.leadPurchaseId },
      },
      tx,
    );

    return { requestId: lp.requestId };
  });

  // recomputeRequestStatus queda fuera a propósito — ver el comentario
  // equivalente en requestRefund.
  await recomputeRequestStatus(result.requestId);
}

// Al rechazar, LeadPurchase.status vuelve exactamente a lo que tenía antes
// de esta solicitud (leadPurchaseStatusBefore) — no a CLOSED — para que el
// agente pueda presentar otra RefundRequest más adelante si corresponde,
// sujeta a las reglas de elegibilidad vigentes en ese momento.
export async function rejectRefund(params: {
  adminUserId: string;
  refundRequestId: string;
  decisionReason: string;
}) {
  const parsedReason = decisionReasonSchema.safeParse(params.decisionReason);
  if (!parsedReason.success) {
    throw new PurchaseError(parsedReason.error.issues[0]?.message ?? "Motivo inválido.");
  }
  const decisionReason = parsedReason.data;

  const result = await prisma.$transaction(async (tx) => {
    const request = await tx.refundRequest.findUnique({
      where: { id: params.refundRequestId },
      select: { id: true, leadPurchaseId: true, leadPurchaseStatusBefore: true },
    });
    if (!request) throw new PurchaseError("Solicitud de devolución no encontrada.");

    const rows = await tx.$queryRaw<
      { id: string; requestId: string; status: LeadPurchaseStatus }[]
    >`SELECT id, "requestId", status FROM "LeadPurchase" WHERE id = ${request.leadPurchaseId} FOR UPDATE`;
    const lp = rows[0];
    if (!lp || lp.status !== "REFUND_REQUESTED") {
      throw new PurchaseError("Esta solicitud de devolución ya fue procesada o no existe.");
    }

    // Mismo CAS/inmutabilidad que approveRefund: decisionReason se escribe
    // únicamente en esta actualización condicionada a status: "PENDING".
    const cas = await tx.refundRequest.updateMany({
      where: { id: params.refundRequestId, status: "PENDING" },
      data: {
        status: "REJECTED",
        decidedByUserId: params.adminUserId,
        decidedAt: new Date(),
        decisionReason,
      },
    });
    if (cas.count === 0) {
      throw new PurchaseError("Esta solicitud de devolución ya fue procesada o no existe.");
    }

    await tx.leadPurchase.update({
      where: { id: request.leadPurchaseId },
      data: { status: request.leadPurchaseStatusBefore },
    });

    // recordStatusChange y logAudit ahora aceptan `tx` (Etapa 2.1): ver el
    // comentario equivalente en approveRefund.
    await recordStatusChange(
      lp.requestId,
      "REFUND_REQUESTED",
      request.leadPurchaseStatusBefore,
      { leadPurchaseId: request.leadPurchaseId, changedByUserId: params.adminUserId },
      tx,
    );
    await logAudit(
      {
        userId: params.adminUserId,
        action: "REFUND_REJECTED",
        entityType: "RefundRequest",
        entityId: request.id,
        metadata: { decisionReason, leadPurchaseId: request.leadPurchaseId },
      },
      tx,
    );

    return { requestId: lp.requestId };
  });

  // recomputeRequestStatus queda fuera a propósito — ver el comentario
  // equivalente en requestRefund.
  await recomputeRequestStatus(result.requestId);
}
