import { z } from "zod";

// Límites compartidos por el formulario del agente (RequestRefundDialog) y
// el del admin (admin/devoluciones) — una sola constante para que ambos
// extremos (cliente y servicio) no puedan desincronizarse.
const MAX_REASON_LENGTH = 1000;
const MAX_EVIDENCE_LENGTH = 2000;
const MAX_DECISION_REASON_LENGTH = 1000;

export const refundCategorySchema = z.enum([
  "NO_RESPONSE",
  "LEAD_QUALITY",
  "PLATFORM_ERROR",
]);

export const refundReasonSchema = z
  .string()
  .trim()
  .min(1, "Tenés que indicar un motivo.")
  .max(MAX_REASON_LENGTH, `El motivo no puede superar los ${MAX_REASON_LENGTH} caracteres.`);

// Opcional (decisión del usuario): evidencia como texto libre, sin mínimo.
export const refundEvidenceSchema = z
  .string()
  .trim()
  .max(MAX_EVIDENCE_LENGTH, `La evidencia no puede superar los ${MAX_EVIDENCE_LENGTH} caracteres.`)
  .optional();

// Esquema completo del formulario del agente — no preselecciona ninguna
// categoría (RequestRefundDialog no le da un `defaultValue` real al
// `<select>`, así que un envío sin elegir falla acá, nunca se infiere).
export const requestRefundSchema = z.object({
  category: refundCategorySchema,
  reason: refundReasonSchema,
  evidence: refundEvidenceSchema,
});
export type RequestRefundInput = z.infer<typeof requestRefundSchema>;

// El motivo de la decisión del admin (aprobar/rechazar) — mismo criterio
// de "no vacío tras trim()" que refundReasonSchema, pero como esquema
// separado porque pertenece a un paso distinto (decisión, no reclamación).
export const decisionReasonSchema = z
  .string()
  .trim()
  .min(1, "Tenés que indicar el motivo de la decisión.")
  .max(
    MAX_DECISION_REASON_LENGTH,
    `El motivo no puede superar los ${MAX_DECISION_REASON_LENGTH} caracteres.`,
  );
