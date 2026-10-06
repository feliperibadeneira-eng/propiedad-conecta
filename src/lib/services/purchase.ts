import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { notify } from "@/lib/services/notifications";
import { logEvent } from "@/lib/services/analytics";
import { logAudit } from "@/lib/services/audit";
import { getUnlockCost } from "@/lib/services/credits";
import {
  recomputeRequestStatus,
  recordStatusChange,
} from "@/lib/services/requests";
import {
  OCCUPYING_STATUSES,
  REACTIVATION_ELIGIBLE_STATUSES,
  REFUND_ELIGIBLE_STATUSES,
} from "@/lib/services/constants";
import { getReactivationHours, getRefundEligibleHours } from "@/lib/settings";

export class PurchaseError extends Error {}

type Db = typeof prisma | Prisma.TransactionClient;

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
      },
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
  if (!OCCUPYING_STATUSES.includes(purchase.status)) {
    throw new PurchaseError("Este lead ya no está activo.");
  }
  await recordStatusChange(purchase.requestId, purchase.status, "RELEASED", {
    reason,
    leadPurchaseId,
  });
  await prisma.leadPurchase.update({
    where: { id: leadPurchaseId },
    data: { status: "RELEASED", releasedAt: new Date(), releaseReason: reason },
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
  await recordStatusChange(purchase.requestId, purchase.status, "CONTACTED", {
    leadPurchaseId,
  });
  await prisma.leadPurchase.update({
    where: { id: leadPurchaseId },
    data: { status: "CONTACTED", contactedAt: new Date() },
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
  if (!OCCUPYING_STATUSES.includes(purchase.status)) {
    throw new PurchaseError("Este lead ya no está activo.");
  }
  await recordStatusChange(
    purchase.requestId,
    purchase.status,
    "APPOINTMENT_SCHEDULED",
    { leadPurchaseId },
  );
  await prisma.leadPurchase.update({
    where: { id: leadPurchaseId },
    data: { status: "APPOINTMENT_SCHEDULED" },
  });
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
  await recordStatusChange(purchase.requestId, purchase.status, newStatus, {
    leadPurchaseId,
  });
  await prisma.leadPurchase.update({
    where: { id: leadPurchaseId },
    data: { status: newStatus },
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
  await recordStatusChange(purchase.requestId, purchase.status, "REACTIVATED", {
    leadPurchaseId,
    changedByUserId: adminUserId,
  });
  await prisma.leadPurchase.update({
    where: { id: leadPurchaseId },
    data: { status: "REACTIVATED" },
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

export function isEligibleForRefundRequest(
  purchase: { status: string; contactedAt: Date | null },
  refundEligibleHours: number,
): boolean {
  if (!REFUND_ELIGIBLE_STATUSES.includes(purchase.status as never)) {
    return false;
  }
  if (!purchase.contactedAt) return false;
  const elapsedHours =
    (Date.now() - purchase.contactedAt.getTime()) / (1000 * 60 * 60);
  return elapsedHours >= refundEligibleHours;
}

// El agente pide la devolución de su crédito (sección 8): solo queda
// pendiente de revisión, no se devuelve nada todavía.
export async function requestRefund(
  agentProfileId: string,
  leadPurchaseId: string,
) {
  const purchase = await prisma.leadPurchase.findUnique({
    where: { id: leadPurchaseId },
  });
  if (!purchase || purchase.agentId !== agentProfileId) {
    throw new PurchaseError("No autorizado.");
  }
  const refundEligibleHours = await getRefundEligibleHours();
  if (!isEligibleForRefundRequest(purchase, refundEligibleHours)) {
    throw new PurchaseError(
      `Todavía no pasaron las ${refundEligibleHours}h desde que marcaste "Contacté al lead", o este lead no está en un estado que permita pedir devolución.`,
    );
  }
  await recordStatusChange(
    purchase.requestId,
    purchase.status,
    "REFUND_REQUESTED",
    { leadPurchaseId },
  );
  await prisma.leadPurchase.update({
    where: { id: leadPurchaseId },
    data: { status: "REFUND_REQUESTED", refundRequestedAt: new Date() },
  });
}

// El administrador aprueba o rechaza (sección 9). Ambas usan un update
// condicionado al estado actual (compare-and-swap): si dos admins aprueban
// el mismo lead casi al mismo tiempo, solo el primero surte efecto — el
// segundo ve count === 0 y no vuelve a acreditar el crédito.
export async function approveRefund(adminUserId: string, leadPurchaseId: string) {
  const result = await prisma.leadPurchase.updateMany({
    where: { id: leadPurchaseId, status: "REFUND_REQUESTED" },
    data: { status: "REFUNDED", refundedAt: new Date() },
  });
  if (result.count === 0) {
    throw new PurchaseError(
      "Esta solicitud de devolución ya fue procesada o no existe.",
    );
  }
  const purchase = await prisma.leadPurchase.findUniqueOrThrow({
    where: { id: leadPurchaseId },
  });
  const agentAfter = await prisma.agentProfile.update({
    where: { id: purchase.agentId },
    data: { creditsBalance: { increment: purchase.creditsUsed } },
  });
  await prisma.creditLedgerEntry.create({
    data: {
      agentId: purchase.agentId,
      amount: purchase.creditsUsed,
      balanceAfter: agentAfter.creditsBalance,
      reason: "REFUND_APPROVED",
      description: "Devolución de crédito aprobada",
      leadPurchaseId,
    },
  });
  await recomputeRequestStatus(purchase.requestId);
  await recordStatusChange(purchase.requestId, "REFUND_REQUESTED", "REFUNDED", {
    leadPurchaseId,
    changedByUserId: adminUserId,
  });
  await logAudit({
    userId: adminUserId,
    action: "REFUND_APPROVED",
    entityType: "LeadPurchase",
    entityId: leadPurchaseId,
  });
}

export async function rejectRefund(adminUserId: string, leadPurchaseId: string) {
  const result = await prisma.leadPurchase.updateMany({
    where: { id: leadPurchaseId, status: "REFUND_REQUESTED" },
    data: { status: "CLOSED" },
  });
  if (result.count === 0) {
    throw new PurchaseError(
      "Esta solicitud de devolución ya fue procesada o no existe.",
    );
  }
  const purchase = await prisma.leadPurchase.findUniqueOrThrow({
    where: { id: leadPurchaseId },
  });
  await recomputeRequestStatus(purchase.requestId);
  await recordStatusChange(purchase.requestId, "REFUND_REQUESTED", "CLOSED", {
    leadPurchaseId,
    changedByUserId: adminUserId,
  });
  await logAudit({
    userId: adminUserId,
    action: "REFUND_REJECTED",
    entityType: "LeadPurchase",
    entityId: leadPurchaseId,
  });
}
