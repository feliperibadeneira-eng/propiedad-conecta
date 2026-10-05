import type {
  OperationType,
  PropertyType,
  ContactPreference,
  RequestStatus,
  LeadPurchaseStatus,
  PaymentStatus,
  CreditPurchaseStatus,
  PropertyStatus,
} from "@/generated/prisma/enums";

export const OPERATION_TYPE_LABELS: Record<OperationType, string> = {
  COMPRAR: "Comprar",
  ALQUILAR: "Alquilar",
};

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  DEPARTAMENTO: "Departamento",
  CASA: "Casa",
  TERRENO: "Terreno",
  OFICINA: "Oficina",
  LOCAL_COMERCIAL: "Local comercial",
  BODEGA: "Bodega",
  OTRO: "Otro",
};

export const CONTACT_PREFERENCE_LABELS: Record<ContactPreference, string> = {
  WHATSAPP: "WhatsApp",
  LLAMADA: "Llamada",
  EMAIL: "Email",
};

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  BUSCANDO: "Buscando",
  EN_PROCESO: "En proceso",
  PAUSADA: "Pausada",
  CERRADA: "Cerrada",
};

export const PROPERTY_STATUS_LABELS: Record<PropertyStatus, string> = {
  DISPONIBLE: "Disponible",
  PAUSADA: "Pausada",
  CERRADA: "Cerrada",
};

export const LEAD_PURCHASE_STATUS_LABELS: Record<LeadPurchaseStatus, string> = {
  PURCHASED: "Desbloqueada",
  CONTACTED: "Contactada",
  RESPONDED: "Respondió",
  NO_CONTACT: "Sin respuesta",
  NO_MATCH: "No coincide",
  RELEASED: "Liberado",
  REACTIVATED: "Reactivado",
  REFUND_REQUESTED: "Devolución pendiente",
  REFUNDED: "Devuelto",
  APPOINTMENT_SCHEDULED: "Cita agendada",
  CLOSED: "Cerrada",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: "Pendiente",
  SUCCEEDED: "Pagado",
  FAILED: "Fallido",
  REFUNDED: "Reembolsado",
};

export const CREDIT_PURCHASE_STATUS_LABELS: Record<CreditPurchaseStatus, string> = {
  PENDING: "🟡 Pago pendiente",
  APPROVED: "🟢 Aprobado",
  REJECTED: "🔴 Rechazado",
};

// Etiquetas para mostrar las características extra (RequestFeature) de una
// solicitud como algo legible en vez del par clave/valor crudo.
const FEATURE_LABELS: Record<string, string> = {
  furnished: "Amoblado",
  hasElevator: "Ascensor",
  hasTerrace: "Terraza",
  hasPatio: "Patio",
  hasPool: "Piscina",
  hasSecurity: "Seguridad",
};

export function formatFeatureBadge(key: string, value: string): string {
  if (key === "propertyAgeYears") return `Antigüedad máxima: ${value} años`;
  if (key === "otherFeature") return value;
  return FEATURE_LABELS[key] ?? `${key}: ${value}`;
}

export const RELEASE_REASONS = [
  "No tengo propiedades adecuadas",
  "El presupuesto no coincide",
  "La zona no coincide",
  "El cliente no responde",
  "Otro",
] as const;

export const BUYER_OUTCOME_OPTIONS = [
  { value: "CONTACTED", label: "El agente me contactó" },
  { value: "NO_CONTACT", label: "El agente no me ha contactado" },
  { value: "NO_MATCH", label: "El agente no tenía una propiedad adecuada" },
  { value: "BUYER_CLOSED_FOUND", label: "Ya encontré una propiedad" },
  { value: "KEEP_SEARCHING", label: "Quiero seguir buscando" },
] as const;
