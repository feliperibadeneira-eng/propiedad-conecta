import { z } from "zod";

// Límite compartido por el body de TEXT y el comentario opcional de
// PROPERTY_SHARE (PR #17, decisiones 2 y 6) — una sola constante para que
// ambos no puedan desincronizarse.
const MAX_BODY_LENGTH = 2000;

export const sendTextMessageSchema = z.object({
  // .trim() corre antes que .min(1): un body compuesto únicamente por
  // espacios se normaliza a "" y queda rechazado por el mínimo, igual que
  // un body realmente vacío.
  body: z
    .string()
    .trim()
    .min(1, "El mensaje no puede estar vacío.")
    .max(MAX_BODY_LENGTH, `El mensaje no puede superar los ${MAX_BODY_LENGTH} caracteres.`),
});
export type SendTextMessageInput = z.infer<typeof sendTextMessageSchema>;

export const sendPropertyShareMessageSchema = z.object({
  propertyId: z.string().uuid(),
  // Opcional (decisión 2): compartir una propiedad sin comentario es
  // válido. A diferencia de TEXT, no tiene mínimo — solo el máximo.
  body: z
    .string()
    .trim()
    .max(MAX_BODY_LENGTH, `El comentario no puede superar los ${MAX_BODY_LENGTH} caracteres.`)
    .optional(),
});
export type SendPropertyShareMessageInput = z.infer<typeof sendPropertyShareMessageSchema>;

// ---------- Fase 1.1: polling ----------
//
// leadPurchaseId y el cursor `after` llegan del cliente (ver
// pollConversationAction en ambos actions.ts); esto NO reemplaza la
// autorización real — getConversationForAgent/Buyer sigue siendo la única
// fuente de verdad sobre a qué conversación pertenece cada quien, filtrando
// siempre por el profileId de la sesión. Esto solo rechaza, antes de tocar
// la base de datos, una forma que ya sabemos que no puede ser válida (hoy
// Prisma lo hacía de todos modos al fallar por tipo, pero sin un mensaje
// claro ni una frontera explícita).
export const pollLeadPurchaseIdSchema = z.string().uuid("Identificador inválido.");

export const pollCursorSchema = z
  .object({
    createdAt: z.coerce.date(),
    id: z.string().uuid("Identificador de cursor inválido."),
  })
  .nullable();
export type PollCursorInput = z.infer<typeof pollCursorSchema>;
