import { prisma } from "@/lib/db";
import { shareProperty, SHARED_PROPERTY_SELECT } from "@/lib/services/propertyShares";
import {
  sendTextMessageSchema,
  sendPropertyShareMessageSchema,
} from "@/lib/validators/conversation";

export class ConversationError extends Error {}

const SENDER_SELECT = { id: true, name: true, role: true } as const;

// ---------- Autorización ----------
//
// Mismo patrón que propertyShares.ts (listSharedPropertiesForAgent/Buyer):
// la Conversation se busca SIEMPRE a través de la relación real hacia
// LeadPurchase (nunca con una columna denormalizada), y una conversación
// que no pertenece al perfil autenticado lanza error en vez de devolver
// null — porque leadPurchaseId es, en este punto, un dato que el caller
// afirma poseer, no un id de detalle que la página ya resolvió.

export async function getConversationForAgent(
  agentProfileId: string,
  leadPurchaseId: string,
) {
  const conversation = await prisma.conversation.findFirst({
    where: { leadPurchaseId, leadPurchase: { agentId: agentProfileId } },
  });
  if (!conversation) {
    throw new ConversationError("Conversación no encontrada o no te pertenece.");
  }
  return conversation;
}

export async function getConversationForBuyer(
  buyerProfileId: string,
  leadPurchaseId: string,
) {
  const conversation = await prisma.conversation.findFirst({
    where: {
      leadPurchaseId,
      leadPurchase: { request: { buyerId: buyerProfileId } },
    },
  });
  if (!conversation) {
    throw new ConversationError("Conversación no encontrada o no te pertenece.");
  }
  return conversation;
}

// ---------- Rate limiting (PR #17, decisión 3) ----------
//
// Sin Redis ni infraestructura nueva: un count() de Postgres sobre el
// índice ya existente ConversationMessage(conversationId, createdAt).
// Límite por conversación y remitente (no global por usuario).
//
// Limitación conocida ante concurrencia: este chequeo no es atómico entre
// requests simultáneos del mismo remitente — dos envíos a la vez podrían
// ambos contar por debajo del límite antes de que cualquiera de los dos
// se inserte, permitiendo superarlo por un mensaje. Evitarlo del todo
// requeriría SERIALIZABLE o un advisory lock de Postgres, que es más
// infraestructura de la que se aprobó para este PR — se documenta como
// limitación aceptada, no se implementa.
const RATE_LIMIT_MAX_MESSAGES = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

async function assertNotRateLimited(conversationId: string, senderUserId: string) {
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const recentCount = await prisma.conversationMessage.count({
    where: { conversationId, senderUserId, createdAt: { gte: since } },
  });
  if (recentCount >= RATE_LIMIT_MAX_MESSAGES) {
    throw new ConversationError(
      "Estás enviando mensajes demasiado rápido. Espera un momento e intenta de nuevo.",
    );
  }
}

// ---------- Paginación de mensajes (PR #17, decisión 4) ----------
//
// Keyset pagination estable por (createdAt, id) descendente — más
// recientes primero, con soporte para "cargar anteriores". Se usa un par
// (createdAt, id) y no solo un cursor de id porque el orden real es por
// fecha; el id solo desempata createdAt iguales. Usa el índice existente
// ConversationMessage(conversationId, createdAt) — no hace falta ninguno
// nuevo.
const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;

export type MessageCursor = { createdAt: Date; id: string };

async function listMessagesPage(
  conversationId: string,
  options: { cursor?: MessageCursor; limit?: number } = {},
) {
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const cursor = options.cursor;

  const rows = await prisma.conversationMessage.findMany({
    where: {
      conversationId,
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    include: {
      sender: { select: SENDER_SELECT },
      propertyShare: { include: { property: { select: SHARED_PROPERTY_SELECT } } },
    },
  });

  const hasMore = rows.length > limit;
  const messages = hasMore ? rows.slice(0, limit) : rows;
  const last = messages[messages.length - 1];
  const nextCursor: MessageCursor | null = hasMore && last ? { createdAt: last.createdAt, id: last.id } : null;

  return { messages, nextCursor };
}

export async function listMessagesForAgent(
  agentProfileId: string,
  leadPurchaseId: string,
  options: { cursor?: MessageCursor; limit?: number } = {},
) {
  const conversation = await getConversationForAgent(agentProfileId, leadPurchaseId);
  return listMessagesPage(conversation.id, options);
}

export async function listMessagesForBuyer(
  buyerProfileId: string,
  leadPurchaseId: string,
  options: { cursor?: MessageCursor; limit?: number } = {},
) {
  const conversation = await getConversationForBuyer(buyerProfileId, leadPurchaseId);
  return listMessagesPage(conversation.id, options);
}

// ---------- Tiempo real: Fase 1 (polling) ----------
//
// Fetch incremental para el polling del panel abierto: "todo lo que llegó
// después de lo que ya tengo", ascendente, listo para anexar al final del
// historial sin dar vuelta nada — a diferencia de listMessagesPage (que
// pagina hacia atrás, descendente, para "cargar anteriores"). Mismo índice
// ConversationMessage(conversationId, createdAt), ninguno nuevo.
const POLL_MAX_MESSAGES = 50;

async function listMessagesAfter(conversationId: string, after: MessageCursor | null) {
  if (!after) return [];
  return prisma.conversationMessage.findMany({
    where: {
      conversationId,
      OR: [
        { createdAt: { gt: after.createdAt } },
        { createdAt: after.createdAt, id: { gt: after.id } },
      ],
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: POLL_MAX_MESSAGES,
    include: {
      sender: { select: SENDER_SELECT },
      propertyShare: { include: { property: { select: SHARED_PROPERTY_SELECT } } },
    },
  });
}

// Marca como leído todo lo que el OTRO participante envió y sigue sin leer
// — nunca los mensajes propios (excluidos por senderUserId != viewerUserId).
// Se llama tanto al abrir la conversación como en cada tick de polling
// mientras sigue abierta; es idempotente (where: readAt: null), así que
// llamarla sin nada nuevo que marcar es barato.
async function markConversationRead(conversationId: string, viewerUserId: string) {
  const { count } = await prisma.conversationMessage.updateMany({
    where: { conversationId, senderUserId: { not: viewerUserId }, readAt: null },
    data: { readAt: new Date() },
  });
  return count;
}

export type PollResult = {
  messages: Awaited<ReturnType<typeof listMessagesAfter>>;
  markedReadCount: number;
};

export async function pollMessagesForAgent(
  agentProfileId: string,
  agentUserId: string,
  leadPurchaseId: string,
  after: MessageCursor | null,
): Promise<PollResult> {
  const conversation = await getConversationForAgent(agentProfileId, leadPurchaseId);
  const [messages, markedReadCount] = await Promise.all([
    listMessagesAfter(conversation.id, after),
    markConversationRead(conversation.id, agentUserId),
  ]);
  return { messages, markedReadCount };
}

export async function pollMessagesForBuyer(
  buyerProfileId: string,
  buyerUserId: string,
  leadPurchaseId: string,
  after: MessageCursor | null,
): Promise<PollResult> {
  const conversation = await getConversationForBuyer(buyerProfileId, leadPurchaseId);
  const [messages, markedReadCount] = await Promise.all([
    listMessagesAfter(conversation.id, after),
    markConversationRead(conversation.id, buyerUserId),
  ]);
  return { messages, markedReadCount };
}

// ---------- Contadores de no leídos ----------
//
// Cuentan filas, nunca cargan los mensajes completos (requisito de
// rendimiento de la fase 1). Usan el índice ConversationMessage(readAt)
// agregado en esta misma fase.

// Fase 1.1 — corte de mensajes históricos para badges/contadores.
//
// La columna readAt se agregó con ALTER TABLE ... ADD COLUMN, así que todo
// mensaje preexistente a la migración quedó en NULL ("no leído" según la
// semántica actual) sin que nadie lo haya dejado realmente sin leer. En vez
// de un UPDATE masivo sobre ConversationMessage (reescribiría historial real
// y violaría "no marcar automáticamente mensajes históricos como leídos"),
// se usa un corte de fecha: solo cuenta como "no leído" lo que además sea
// posterior a este instante.
//
// Alcance deliberadamente acotado: SOLO se usa acá y en
// getUnreadCountsByLeadPurchaseForAgent/Buyer (conteos/badges). NO se toca
// markConversationRead, listMessagesAfter ni listMessagesPage — el chat
// (historial completo, polling, marcado de lectura real) funciona exacto
// igual que antes; un mensaje histórico genuinamente sin leer se marca
// leído de forma normal (markConversationRead ya es idempotente) la primera
// vez que su destinatario reabre esa conversación — este corte solo evita
// que aparezca como pendiente en un badge ANTES de que eso pase.
//
// IMPORTANTE — actualizar antes de cada despliegue a un entorno nuevo
// (producción incluida): debe ser el instante UTC en que la migración que
// agrega readAt se aplica ahí. Un valor desactualizado (muy en el pasado)
// vuelve a mostrar mensajes históricos reales como no leídos; uno muy en el
// futuro ocultaría mensajes genuinamente nuevos del badge. Esta fase solo
// lo fijó para el sandbox local (ver informe de la fase 1.1).
export const UNREAD_TRACKING_SINCE = new Date("2026-10-30T19:31:19.000Z");

export async function countUnreadMessagesForAgent(agentProfileId: string, agentUserId: string) {
  return prisma.conversationMessage.count({
    where: {
      readAt: null,
      createdAt: { gte: UNREAD_TRACKING_SINCE },
      senderUserId: { not: agentUserId },
      conversation: { leadPurchase: { agentId: agentProfileId } },
    },
  });
}

export async function countUnreadMessagesForBuyer(buyerProfileId: string, buyerUserId: string) {
  return prisma.conversationMessage.count({
    where: {
      readAt: null,
      createdAt: { gte: UNREAD_TRACKING_SINCE },
      senderUserId: { not: buyerUserId },
      conversation: { leadPurchase: { request: { buyerId: buyerProfileId } } },
    },
  });
}

// Para las listas (Mis leads / Agentes conectados): un conteo por fila,
// calculado una sola vez en el servidor por carga de página — no es
// polling por fila, ver auditoría/plan de la fase 1. Dos consultas chicas
// (agrupar, y resolver conversationId -> leadPurchaseId solo para las
// conversaciones que sí tienen algo sin leer), nunca una por fila.

export async function getUnreadCountsByLeadPurchaseForAgent(
  agentProfileId: string,
  agentUserId: string,
): Promise<Map<string, number>> {
  const grouped = await prisma.conversationMessage.groupBy({
    by: ["conversationId"],
    where: {
      readAt: null,
      createdAt: { gte: UNREAD_TRACKING_SINCE },
      senderUserId: { not: agentUserId },
      conversation: { leadPurchase: { agentId: agentProfileId } },
    },
    _count: { _all: true },
  });
  return mapGroupedCountsToLeadPurchaseId(grouped);
}

export async function getUnreadCountsByLeadPurchaseForBuyer(
  buyerProfileId: string,
  buyerUserId: string,
): Promise<Map<string, number>> {
  const grouped = await prisma.conversationMessage.groupBy({
    by: ["conversationId"],
    where: {
      readAt: null,
      createdAt: { gte: UNREAD_TRACKING_SINCE },
      senderUserId: { not: buyerUserId },
      conversation: { leadPurchase: { request: { buyerId: buyerProfileId } } },
    },
    _count: { _all: true },
  });
  return mapGroupedCountsToLeadPurchaseId(grouped);
}

async function mapGroupedCountsToLeadPurchaseId(
  grouped: { conversationId: string; _count: { _all: number } }[],
): Promise<Map<string, number>> {
  if (grouped.length === 0) return new Map();
  const conversations = await prisma.conversation.findMany({
    where: { id: { in: grouped.map((g) => g.conversationId) } },
    select: { id: true, leadPurchaseId: true },
  });
  const leadPurchaseIdByConversationId = new Map(conversations.map((c) => [c.id, c.leadPurchaseId]));
  const result = new Map<string, number>();
  for (const g of grouped) {
    const leadPurchaseId = leadPurchaseIdByConversationId.get(g.conversationId);
    if (leadPurchaseId) result.set(leadPurchaseId, g._count._all);
  }
  return result;
}

// ---------- Enviar mensajes ----------

export async function sendTextMessageAsAgent(params: {
  agentUserId: string;
  agentProfileId: string;
  leadPurchaseId: string;
  body: string;
}) {
  const conversation = await getConversationForAgent(params.agentProfileId, params.leadPurchaseId);
  await assertNotRateLimited(conversation.id, params.agentUserId);
  const body = parseTextBody(params.body);

  return prisma.conversationMessage.create({
    data: {
      conversationId: conversation.id,
      senderUserId: params.agentUserId,
      type: "TEXT",
      body,
    },
    include: { sender: { select: SENDER_SELECT } },
  });
}

export async function sendTextMessageAsBuyer(params: {
  buyerUserId: string;
  buyerProfileId: string;
  leadPurchaseId: string;
  body: string;
}) {
  const conversation = await getConversationForBuyer(params.buyerProfileId, params.leadPurchaseId);
  await assertNotRateLimited(conversation.id, params.buyerUserId);
  const body = parseTextBody(params.body);

  return prisma.conversationMessage.create({
    data: {
      conversationId: conversation.id,
      senderUserId: params.buyerUserId,
      type: "TEXT",
      body,
    },
    include: { sender: { select: SENDER_SELECT } },
  });
}

function parseTextBody(raw: string): string {
  const parsed = sendTextMessageSchema.safeParse({ body: raw });
  if (!parsed.success) {
    throw new ConversationError(parsed.error.issues[0]?.message ?? "Mensaje inválido.");
  }
  return parsed.data.body;
}

// Solo el agente puede compartir propiedades (asimetría ya existente en
// todo el resto del sistema: Property/PropertyShare son del agente, igual
// que shareProperty() ya lo exige) — no hay equivalente para el comprador.
//
// Atomicidad (ver informe de auditoría, decisión 8 del usuario):
// shareProperty() abre y confirma su propia transacción — no acepta un tx
// externo, y extender su firma queda fuera del alcance aprobado para este
// PR. Por eso esta función NO es atómica de punta a punta: valida todo lo
// que puede validar en frío (autorización, rate limit, forma del mensaje)
// ANTES de llamar a shareProperty(), para minimizar la ventana en la que
// shareProperty() ya corrió pero el ConversationMessage todavía no. Si el
// insert del mensaje fallara después de que shareProperty() confirmó, el
// PropertyShare queda igual de válido y visible (ya se muestra en "Tus
// propiedades"/el detalle del comprador) — solo falta el mensaje de chat
// que lo anuncia; un reintento del agente se autocura porque
// shareProperty() es idempotente (no duplica la fila).
export async function sendPropertyShareMessage(params: {
  agentUserId: string;
  agentProfileId: string;
  leadPurchaseId: string;
  propertyId: string;
  body?: string;
}) {
  const conversation = await getConversationForAgent(params.agentProfileId, params.leadPurchaseId);
  await assertNotRateLimited(conversation.id, params.agentUserId);

  const parsed = sendPropertyShareMessageSchema.safeParse({
    propertyId: params.propertyId,
    body: params.body,
  });
  if (!parsed.success) {
    throw new ConversationError(parsed.error.issues[0]?.message ?? "Datos inválidos.");
  }

  // Propagado sin envolver: PropertyShareError ya describe exactamente lo
  // que falló (propiedad ajena, inexistente o no DISPONIBLE) — envolverlo
  // en ConversationError solo perdería esa especificidad.
  const share = await shareProperty(params.agentProfileId, params.leadPurchaseId, parsed.data.propertyId);

  return prisma.conversationMessage.create({
    data: {
      conversationId: conversation.id,
      senderUserId: params.agentUserId,
      type: "PROPERTY_SHARE",
      body: parsed.data.body || null,
      propertyShareId: share.id,
    },
    include: {
      sender: { select: SENDER_SELECT },
      propertyShare: { include: { property: { select: SHARED_PROPERTY_SELECT } } },
    },
  });
}
