import type { LeadPurchaseStatus } from "@/generated/prisma/enums";

// Estados de LeadPurchase que siguen "ocupando" uno de los cupos de
// maxAgents de la solicitud. RELEASED/REACTIVATED/REFUNDED/CLOSED liberan
// el cupo.
export const OCCUPYING_STATUSES: LeadPurchaseStatus[] = [
  "PURCHASED",
  "CONTACTED",
  "RESPONDED",
  "NO_CONTACT",
  "NO_MATCH",
  "REFUND_REQUESTED",
  "APPOINTMENT_SCHEDULED",
];

// Estados desde los que una compra puede reabrirse para otro agente (sección 20).
export const REACTIVATION_ELIGIBLE_STATUSES: LeadPurchaseStatus[] = [
  "NO_CONTACT",
  "NO_MATCH",
];

// Estados desde los que las acciones legacy (liberar, marcar contactado,
// marcar cita, resultado del comprador) y las solicitudes de devolución
// LEAD_QUALITY/PLATFORM_ERROR pueden partir — igual que OCCUPYING_STATUSES
// pero sin REFUND_REQUESTED: mientras hay una devolución pendiente, solo
// approveRefund/rejectRefund pueden cambiar el status (ver especificación
// de protección de contactos y devoluciones).
export const MODIFIABLE_BY_LEGACY_ACTIONS: LeadPurchaseStatus[] = OCCUPYING_STATUSES.filter(
  (s) => s !== "REFUND_REQUESTED",
);
