import { prisma } from "@/lib/db";
import { notify } from "@/lib/services/notifications";
import { logEvent } from "@/lib/services/analytics";
import { OCCUPYING_STATUSES } from "@/lib/services/constants";
import type { CreateRequestInput } from "@/lib/validators/request";
import type { RequestStatus } from "@/generated/prisma/enums";

// Regla 1: solo un BUYER puede crear una PropertyRequest, y debe estar
// registrado e iniciado sesión antes (sección 2) — la cuenta ya existe
// para cuando esta función se llama (ver requireBuyer() en el caller).
export async function createRequest(
  buyerProfileId: string,
  input: CreateRequestInput,
) {
  const email = input.contactEmail?.trim().toLowerCase() || null;

  const buyerProfile = await prisma.buyerProfile.findUniqueOrThrow({
    where: { id: buyerProfileId },
  });

  const features = Object.entries(input.features ?? {}).filter(
    ([, v]) => v !== undefined && v !== false && v !== "",
  );

  const request = await prisma.propertyRequest.create({
    data: {
      buyerId: buyerProfileId,
      operationType: input.operationType,
      propertyType: input.propertyType,
      provincia: input.provincia,
      ciudad: input.ciudad,
      sector: input.sector || null,
      priceMin: input.priceMin,
      priceMax: input.priceMax,
      bedrooms: input.bedrooms,
      bathrooms: input.bathrooms,
      minSquareMeters: input.minSquareMeters,
      parkingSpots: input.parkingSpots,
      moveInDate: input.moveInDate || null,
      occupation: input.occupation || null,
      searchReason: input.searchReason || null,
      additionalNotes: input.additionalNotes || null,
      contactName: input.contactName,
      contactPhone: input.contactPhone,
      contactEmail: email,
      contactPreference: input.contactPreference,
      // El consentimiento ya se dio una sola vez al registrarse (sección 1).
      dataSharingConsent: true,
      maxAgents: input.maxAgents,
      // Columna heredada del viejo modelo de precio de lead; el costo real
      // lo determina getUnlockCost() según operationType, no este campo.
      leadPrice: 0,
      features: {
        create: features.map(([key, value]) => ({
          key,
          value: String(value),
        })),
      },
    },
  });

  await notify(
    buyerProfile.userId,
    "request_confirmed",
    "¡Solicitud publicada!",
    "Los agentes podrán encontrar tu solicitud si tienen una propiedad que coincida con lo que buscas.",
  );
  await logEvent("request_created", {
    userId: buyerProfile.userId,
    requestId: request.id,
  });

  return request;
}

export async function listBuyerRequests(buyerProfileId: string) {
  const requests = await prisma.propertyRequest.findMany({
    where: { buyerId: buyerProfileId },
    orderBy: { createdAt: "desc" },
    include: { purchases: true },
  });
  return requests.map((r) => ({
    ...r,
    connectedAgents: r.purchases.filter((p) =>
      OCCUPYING_STATUSES.includes(p.status),
    ).length,
  }));
}

export async function getBuyerRequestDetail(
  buyerProfileId: string,
  requestId: string,
) {
  const request = await prisma.propertyRequest.findFirst({
    where: { id: requestId, buyerId: buyerProfileId },
    include: {
      features: true,
      purchases: {
        include: {
          agent: { include: { user: true } },
          exchange: true,
        },
        orderBy: { purchasedAt: "desc" },
      },
      statusHistory: { orderBy: { createdAt: "desc" } },
    },
  });
  return request;
}

// Recalcula el estado "público" de la solicitud a partir de sus compras
// activas. No toca PAUSADA/CERRADA: esos son estados manuales del buyer.
export async function recomputeRequestStatus(requestId: string) {
  const request = await prisma.propertyRequest.findUnique({
    where: { id: requestId },
    include: { purchases: true },
  });
  if (!request) return;
  if (request.status === "PAUSADA" || request.status === "CERRADA") return;

  const activeCount = request.purchases.filter((p) =>
    OCCUPYING_STATUSES.includes(p.status),
  ).length;
  const nextStatus: RequestStatus = activeCount > 0 ? "EN_PROCESO" : "BUSCANDO";
  if (nextStatus !== request.status) {
    await recordStatusChange(requestId, request.status, nextStatus);
    await prisma.propertyRequest.update({
      where: { id: requestId },
      data: { status: nextStatus },
    });
  }
}

export async function recordStatusChange(
  requestId: string,
  from: string,
  to: string,
  opts: { reason?: string; changedByUserId?: string; leadPurchaseId?: string } = {},
) {
  await prisma.leadStatusHistory.create({
    data: {
      requestId,
      fromStatus: from,
      toStatus: to,
      reason: opts.reason,
      changedByUserId: opts.changedByUserId,
      leadPurchaseId: opts.leadPurchaseId,
    },
  });
}

export async function updateMaxAgents(
  buyerProfileId: string,
  requestId: string,
  maxAgents: number,
) {
  const request = await prisma.propertyRequest.findFirst({
    where: { id: requestId, buyerId: buyerProfileId },
  });
  if (!request) throw new Error("Solicitud no encontrada");
  await prisma.propertyRequest.update({
    where: { id: requestId },
    data: { maxAgents },
  });
}

export async function setBuyerRequestStatus(
  buyerProfileId: string,
  requestId: string,
  status: Extract<RequestStatus, "PAUSADA" | "CERRADA" | "BUSCANDO">,
) {
  const request = await prisma.propertyRequest.findFirst({
    where: { id: requestId, buyerId: buyerProfileId },
  });
  if (!request) throw new Error("Solicitud no encontrada");
  await recordStatusChange(requestId, request.status, status);
  await prisma.propertyRequest.update({
    where: { id: requestId },
    data: { status },
  });
  if (status === "CERRADA") {
    await logEvent("request_closed", { requestId });
  }
}
