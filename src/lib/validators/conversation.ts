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
