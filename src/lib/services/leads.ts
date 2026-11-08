import { prisma } from "@/lib/db";
import { calculateMatchScore } from "@/lib/services/matching";
import { computeTrustSignals, computeTrustSignalsBatch } from "@/lib/services/trustSignals";
import { getUnlockCost } from "@/lib/services/credits";
import { OCCUPYING_STATUSES } from "@/lib/services/constants";
import type { OperationType, PropertyType } from "@/generated/prisma/enums";

// Lo que getCurrentUser() ya trae del AgentProfile en la sesión (ver
// src/lib/auth.ts) — se pasa directo en vez de volver a consultar por id.
// `null` cuando el agente no tiene perfil (mismo caso borde que antes
// cubría `agent?.x ?? fallback`).
export type AgentMatchProfile = {
  workAreas: string[];
  propertyTypes: PropertyType[];
  creditsBalance: number;
} | null;

export type LeadFilters = {
  operationType?: OperationType;
  propertyType?: PropertyType;
  ciudad?: string;
  sector?: string;
  priceMin?: number;
  priceMax?: number;
  bedrooms?: number;
};

export type LeadSort = "recientes" | "compatibilidad" | "intencion";

// Límite de seguridad, no paginación real todavía: hoy el marketplace
// siempre muestra el total completo (sin controles de "siguiente página"),
// así que no se puede recortar silenciosamente sin cambiar lo que el agente
// ve. 100 es muy por encima del volumen actual (confirmado: 9 solicitudes en
// los datos de prueba) — solo evita que un `findMany` sin tope crezca sin
// límite si el volumen real aumenta mucho. Paginación de verdad (con UI)
// queda fuera de este cambio.
const MAX_MARKETPLACE_RESULTS = 100;

function intentScore(request: {
  bedrooms: number | null;
  bathrooms: number | null;
  minSquareMeters: number | null;
  parkingSpots: number | null;
  maxAgents: number;
  features: { key: string }[];
}): number {
  const filled = [
    request.bedrooms,
    request.bathrooms,
    request.minSquareMeters,
    request.parkingSpots,
  ].filter((v) => v != null).length;
  // Exclusividad: menos agentes permitidos = comprador más selectivo/serio.
  const exclusivity = Math.max(0, 5 - request.maxAgents);
  return filled + request.features.length + exclusivity;
}

async function agentAlreadyPurchasedIds(agentProfileId: string) {
  const purchases = await prisma.leadPurchase.findMany({
    where: { agentId: agentProfileId },
    select: { requestId: true },
  });
  return purchases.map((p) => p.requestId);
}

export async function getAvailableRequestsForAgent(
  agentProfileId: string,
  agentMatchProfile: AgentMatchProfile,
  filters: LeadFilters,
  sort: LeadSort,
) {
  const excludeIds = await agentAlreadyPurchasedIds(agentProfileId);

  const requests = await prisma.propertyRequest.findMany({
    where: {
      status: { in: ["BUSCANDO", "EN_PROCESO"] },
      id: excludeIds.length ? { notIn: excludeIds } : undefined,
      operationType: filters.operationType,
      propertyType: filters.propertyType,
      ciudad: filters.ciudad
        ? { equals: filters.ciudad, mode: "insensitive" }
        : undefined,
      sector: filters.sector
        ? { contains: filters.sector, mode: "insensitive" }
        : undefined,
      bedrooms: filters.bedrooms != null ? { gte: filters.bedrooms } : undefined,
      ...(filters.priceMin != null || filters.priceMax != null
        ? {
            priceMin: filters.priceMax != null ? { lte: filters.priceMax } : undefined,
            priceMax: filters.priceMin != null ? { gte: filters.priceMin } : undefined,
          }
        : {}),
    },
    include: { purchases: true, features: true },
    orderBy: { createdAt: "desc" },
    take: MAX_MARKETPLACE_RESULTS,
  });

  const withSlots = requests.filter((r) => {
    const occupied = r.purchases.filter((p) =>
      OCCUPYING_STATUSES.includes(p.status),
    ).length;
    return occupied < r.maxAgents;
  });

  // Antes: computeTrustSignals(r) por fila → 2×N consultas (N = resultados).
  // Ahora: una sola consulta por lote para todas las filas a la vez.
  const trustSignalsByRequest = await computeTrustSignalsBatch(withSlots);

  const enriched = withSlots.map((r) => ({
    ...r,
    matchScore: calculateMatchScore(
      {
        ciudad: r.ciudad,
        sector: r.sector,
        propertyType: r.propertyType,
        featureCount: r.features.length,
      },
      agentMatchProfile
        ? { workAreas: agentMatchProfile.workAreas, propertyTypes: agentMatchProfile.propertyTypes }
        : null,
    ),
    intentScore: intentScore(r),
    unlockCost: getUnlockCost(r.operationType),
    trustSignals: trustSignalsByRequest.get(r.id) ?? [],
  }));

  const sorted = [...enriched].sort((a, b) => {
    switch (sort) {
      case "compatibilidad":
        return b.matchScore - a.matchScore;
      case "intencion":
        return b.intentScore - a.intentScore;
      case "recientes":
      default:
        return b.createdAt.getTime() - a.createdAt.getTime();
    }
  });

  return sorted;
}

export async function getRequestForAgentDetail(
  agentProfileId: string,
  agentMatchProfile: AgentMatchProfile,
  requestId: string,
) {
  const request = await prisma.propertyRequest.findUnique({
    where: { id: requestId },
    include: { purchases: true, features: true },
  });
  if (!request) return null;

  const occupied = request.purchases.filter((p) =>
    OCCUPYING_STATUSES.includes(p.status),
  ).length;
  const alreadyPurchasedByThisAgent = request.purchases.some(
    (p) => p.agentId === agentProfileId,
  );

  return {
    ...request,
    matchScore: calculateMatchScore(
      {
        ciudad: request.ciudad,
        sector: request.sector,
        propertyType: request.propertyType,
        featureCount: request.features.length,
      },
      agentMatchProfile
        ? { workAreas: agentMatchProfile.workAreas, propertyTypes: agentMatchProfile.propertyTypes }
        : null,
    ),
    availableSlots: request.maxAgents - occupied,
    alreadyPurchasedByThisAgent,
    agentCreditsBalance: agentMatchProfile?.creditsBalance ?? 0,
    unlockCost: getUnlockCost(request.operationType),
    trustSignals: await computeTrustSignals(request),
    isPurchasable:
      !alreadyPurchasedByThisAgent &&
      occupied < request.maxAgents &&
      request.status !== "PAUSADA" &&
      request.status !== "CERRADA",
  };
}

// Usado por la página de detalle de "Mis leads", cuyo :id es el requestId
// (así lo arma la success_url de Stripe, antes de que exista el LeadPurchase).
export async function getPurchasedLeadDetail(
  agentProfileId: string,
  requestId: string,
) {
  return prisma.leadPurchase.findUnique({
    where: { requestId_agentId: { requestId, agentId: agentProfileId } },
    include: { request: true, payment: true },
  });
}

export async function getPurchasedLeadsForAgent(agentProfileId: string) {
  return prisma.leadPurchase.findMany({
    where: { agentId: agentProfileId },
    include: {
      request: true,
      exchange: true,
    },
    orderBy: { purchasedAt: "desc" },
  });
}
