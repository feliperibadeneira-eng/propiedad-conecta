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

// Estados desde los que un agente puede pedir la devolución de su crédito
// (garantía del lead, sección 7): tiene que haber intentado contactar y
// el usuario no haber confirmado respuesta.
export const REFUND_ELIGIBLE_STATUSES: LeadPurchaseStatus[] = ["CONTACTED"];
