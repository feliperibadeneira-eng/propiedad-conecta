import { prisma } from "@/lib/db";
import type { OperationType, PropertyType, RequestStatus } from "@/generated/prisma/enums";

// Matching inicial Property (oferta) <-> PropertyRequest (demanda).
//
// El score de 0-100 es un RANKING de compatibilidad para ordenar/priorizar
// resultados — NO es una probabilidad ni una certeza estadística, no
// prometas "92% de probabilidad de cerrar" en ningún texto de UI que lo
// consuma.
//
// Separado a propósito de src/lib/services/matching.ts (que compara el
// PERFIL GENERAL del agente — workAreas/propertyTypes — contra una
// PropertyRequest, usado hoy en el marketplace de leads). Este archivo
// compara una Property específica contra una PropertyRequest específica.
// No se tocan ni calculateMatchScore ni matchLabel de matching.ts.

// ---------- Configuración de pesos (fácil de recalibrar con datos reales) ----------

// Deben sumar 100 — lo confirma un test dedicado.
export const PROPERTY_MATCH_WEIGHTS = {
  price: 35,
  sector: 20,
  bedrooms: 20,
  squareMeters: 15,
  bathrooms: 10,
} as const;

// Por debajo de este score un resultado no se considera relevante y se
// descarta antes de llegar a la UI.
export const PROPERTY_MATCH_THRESHOLD = 35;

// Multiplicadores (0-1) que cada factor cuantitativo aplica sobre su peso,
// según qué tan bien calza. Centralizados junto a los pesos para que
// calibrar ambos a la vez sea un solo lugar.
export const PRICE_OVERAGE_FACTORS = {
  withinBudget: 1,
  mildOverage: 0.6,
  moderateOverage: 0.3,
  farOverage: 0,
} as const;

// % sobre priceMax que define cada escalón de PRICE_OVERAGE_FACTORS.
export const PRICE_OVERAGE_THRESHOLDS = {
  mild: 0.1,
  moderate: 0.25,
} as const;

export const SECTOR_FACTORS = {
  match: 1,
  unknown: 0.6,
  mismatch: 0.25,
} as const;

export const ROOM_COUNT_FACTORS = {
  meetsOrExceeds: 1,
  offByOne: 0.5,
  insufficient: 0,
} as const;

export const SQUARE_METERS_FACTORS = {
  meetsOrExceeds: 1,
  closeDeficit: 0.5,
  insufficient: 0,
} as const;

// % por debajo del mínimo pedido que todavía cuenta como "cerca".
export const SQUARE_METERS_DEFICIT_THRESHOLD = 0.1;

export const PROPERTY_MATCH_BANDS = [
  { min: 90, label: "Excelente" },
  { min: 75, label: "Muy bueno" },
  { min: 55, label: "Bueno" },
  { min: PROPERTY_MATCH_THRESHOLD, label: "Débil" },
  { min: 0, label: "Bajo" },
] as const;

// Mismo concepto de "solicitud activa" que ya usa
// getAvailableRequestsForAgent() en leads.ts — no se inventa uno nuevo.
const ACTIVE_REQUEST_STATUSES: RequestStatus[] = ["BUSCANDO", "EN_PROCESO"];

const norm = (s: string) => s.trim().toLowerCase();

// ---------- Tipos de entrada (estructurales — aceptan tanto filas de Prisma
// como fixtures planos en los tests) ----------

export type PropertyForMatching = {
  operationType: OperationType;
  propertyType: PropertyType;
  ciudad: string;
  sector: string | null;
  price: number | string | { toString(): string };
  squareMeters: number;
  bedrooms: number | null;
  bathrooms: number | null;
};

export type RequestForMatching = {
  operationType: OperationType;
  propertyType: PropertyType;
  ciudad: string;
  sector: string | null;
  priceMin: number | string | { toString(): string };
  priceMax: number | string | { toString(): string };
  minSquareMeters: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
};

// ---------- Gates duros ----------
//
// El status (Property.DISPONIBLE / PropertyRequest BUSCANDO-EN_PROCESO) no
// se evalúa acá: esta función es pura y no recibe status — ese gate vive en
// la query de listCompatibleRequestsForProperty().
export function passesHardGates(
  property: PropertyForMatching,
  request: RequestForMatching,
): boolean {
  if (property.operationType !== request.operationType) return false;
  if (property.propertyType !== request.propertyType) return false;
  if (norm(property.ciudad) !== norm(request.ciudad)) return false;
  return true;
}

// ---------- Factores cuantitativos ----------

function scorePrice(propertyPrice: number, priceMax: number): number {
  if (propertyPrice <= priceMax) {
    return PROPERTY_MATCH_WEIGHTS.price * PRICE_OVERAGE_FACTORS.withinBudget;
  }
  const overagePct = (propertyPrice - priceMax) / priceMax;
  if (overagePct <= PRICE_OVERAGE_THRESHOLDS.mild) {
    return PROPERTY_MATCH_WEIGHTS.price * PRICE_OVERAGE_FACTORS.mildOverage;
  }
  if (overagePct <= PRICE_OVERAGE_THRESHOLDS.moderate) {
    return PROPERTY_MATCH_WEIGHTS.price * PRICE_OVERAGE_FACTORS.moderateOverage;
  }
  return PROPERTY_MATCH_WEIGHTS.price * PRICE_OVERAGE_FACTORS.farOverage;
}

function scoreSector(propertySector: string | null, requestSector: string | null): number {
  if (!propertySector || !requestSector) {
    return PROPERTY_MATCH_WEIGHTS.sector * SECTOR_FACTORS.unknown;
  }
  return norm(propertySector) === norm(requestSector)
    ? PROPERTY_MATCH_WEIGHTS.sector * SECTOR_FACTORS.match
    : PROPERTY_MATCH_WEIGHTS.sector * SECTOR_FACTORS.mismatch;
}

// Habitaciones y baños comparten la misma lógica (un mínimo pedido, un
// valor ofrecido) — solo cambia el peso.
function scoreRoomCount(
  propertyValue: number | null,
  requestedMinimum: number | null,
  weight: number,
): number {
  if (requestedMinimum == null) return weight * ROOM_COUNT_FACTORS.meetsOrExceeds;
  const value = propertyValue ?? 0;
  if (value >= requestedMinimum) return weight * ROOM_COUNT_FACTORS.meetsOrExceeds;
  if (value === requestedMinimum - 1) return weight * ROOM_COUNT_FACTORS.offByOne;
  return weight * ROOM_COUNT_FACTORS.insufficient;
}

function scoreSquareMeters(propertySquareMeters: number, requestedMinimum: number | null): number {
  if (requestedMinimum == null) {
    return PROPERTY_MATCH_WEIGHTS.squareMeters * SQUARE_METERS_FACTORS.meetsOrExceeds;
  }
  if (propertySquareMeters >= requestedMinimum) {
    return PROPERTY_MATCH_WEIGHTS.squareMeters * SQUARE_METERS_FACTORS.meetsOrExceeds;
  }
  const deficitPct = (requestedMinimum - propertySquareMeters) / requestedMinimum;
  if (deficitPct <= SQUARE_METERS_DEFICIT_THRESHOLD) {
    return PROPERTY_MATCH_WEIGHTS.squareMeters * SQUARE_METERS_FACTORS.closeDeficit;
  }
  return PROPERTY_MATCH_WEIGHTS.squareMeters * SQUARE_METERS_FACTORS.insufficient;
}

// ---------- API pública ----------

// Función pura — sin DB, fácil de testear con fixtures en memoria. 0 si no
// pasa los gates duros; de lo contrario, 0-100.
export function calculatePropertyMatchScore(
  property: PropertyForMatching,
  request: RequestForMatching,
): number {
  if (!passesHardGates(property, request)) return 0;

  const propertyPrice = Number(property.price);
  const priceMax = Number(request.priceMax);

  const total =
    scorePrice(propertyPrice, priceMax) +
    scoreSector(property.sector, request.sector) +
    scoreRoomCount(property.bedrooms, request.bedrooms, PROPERTY_MATCH_WEIGHTS.bedrooms) +
    scoreSquareMeters(property.squareMeters, request.minSquareMeters) +
    scoreRoomCount(property.bathrooms, request.bathrooms, PROPERTY_MATCH_WEIGHTS.bathrooms);

  return Math.round(Math.min(100, total));
}

export function propertyMatchLabel(score: number): string {
  for (const band of PROPERTY_MATCH_BANDS) {
    if (score >= band.min) return band.label;
  }
  return "Bajo";
}

// Solicitudes activas potencialmente compatibles con UNA propiedad del
// agente autenticado. Ownership verificado acá mismo (no confía en que el
// caller ya lo haya hecho) — mismo patrón que cada función de
// properties.ts/propertyImages.ts. El `select` de PropertyRequest excluye
// a propósito contactName/contactPhone/contactEmail: la protección de
// privacidad vive en la consulta, no en que la UI decida no renderizarlos.
export async function listCompatibleRequestsForProperty(
  agentProfileId: string,
  propertyId: string,
) {
  const property = await prisma.property.findFirst({
    where: { id: propertyId, agentId: agentProfileId },
  });
  if (!property) throw new Error("Propiedad no encontrada");

  // Gate duro de status: una propiedad pausada/cerrada no busca matches.
  if (property.status !== "DISPONIBLE") return [];

  const requests = await prisma.propertyRequest.findMany({
    where: {
      status: { in: ACTIVE_REQUEST_STATUSES },
      operationType: property.operationType,
      propertyType: property.propertyType,
      ciudad: { equals: property.ciudad, mode: "insensitive" },
    },
    select: {
      id: true,
      operationType: true,
      propertyType: true,
      provincia: true,
      ciudad: true,
      sector: true,
      priceMin: true,
      priceMax: true,
      bedrooms: true,
      bathrooms: true,
      minSquareMeters: true,
      status: true,
      createdAt: true,
      // contactName / contactPhone / contactEmail deliberadamente omitidos.
    },
  });

  return requests
    .map((request) => ({
      ...request,
      matchScore: calculatePropertyMatchScore(property, request),
    }))
    .filter((r) => r.matchScore >= PROPERTY_MATCH_THRESHOLD)
    .sort((a, b) => b.matchScore - a.matchScore);
}
