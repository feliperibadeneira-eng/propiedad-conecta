import { prisma } from "@/lib/db";

export class PropertyShareError extends Error {}

// Lo mínimo necesario para pintar una tarjeta de propiedad compartida
// (sección 8 del informe: foto principal, título, precio, ubicación,
// estado) — nunca datos de contacto ni campos privados. Exportado para que
// requests.ts (getBuyerRequestDetail) lo reutilice tal cual, en vez de
// duplicar la selección de campos.
export const SHARED_PROPERTY_SELECT = {
  id: true,
  title: true,
  price: true,
  status: true,
  provincia: true,
  ciudad: true,
  sector: true,
  images: {
    where: { isPrimary: true },
    take: 1,
    select: { id: true },
  },
} as const;

// "El agente compartió/ofreció esta propiedad a este lead." No implica que
// el comprador la haya visto, abierto o mostrado interés — ver el informe
// de PR #15. Idempotente (regla 5): compartir de nuevo la misma propiedad
// con el mismo lead no crea una fila nueva, devuelve la existente.
export async function shareProperty(
  agentProfileId: string,
  leadPurchaseId: string,
  propertyId: string,
) {
  return prisma.$transaction(async (tx) => {
    const leadPurchase = await tx.leadPurchase.findFirst({
      where: { id: leadPurchaseId, agentId: agentProfileId },
    });
    if (!leadPurchase) {
      throw new PropertyShareError("Lead no encontrado o no te pertenece.");
    }

    const property = await tx.property.findFirst({
      where: { id: propertyId, agentId: agentProfileId },
    });
    if (!property) {
      throw new PropertyShareError("La propiedad no existe o no te pertenece.");
    }
    // Solo propiedades DISPONIBLE pueden compartirse activamente — a
    // diferencia de LeadPurchase.propertyId (PR #14, atribución histórica
    // que sí admite PAUSADA/CERRADA), esto es una acción hacia adelante.
    if (property.status !== "DISPONIBLE") {
      throw new PropertyShareError("Solo puedes compartir propiedades disponibles.");
    }

    const existing = await tx.propertyShare.findUnique({
      where: { leadPurchaseId_propertyId: { leadPurchaseId, propertyId } },
    });
    if (existing) {
      return { ...existing, alreadyShared: true as const };
    }

    const share = await tx.propertyShare.create({
      data: { leadPurchaseId, propertyId },
    });
    return { ...share, alreadyShared: false as const };
  });
}

export async function listSharedPropertiesForAgent(
  agentProfileId: string,
  leadPurchaseId: string,
) {
  const leadPurchase = await prisma.leadPurchase.findFirst({
    where: { id: leadPurchaseId, agentId: agentProfileId },
  });
  if (!leadPurchase) {
    throw new PropertyShareError("Lead no encontrado o no te pertenece.");
  }

  return prisma.propertyShare.findMany({
    where: { leadPurchaseId },
    orderBy: { sentAt: "desc" },
    include: { property: { select: SHARED_PROPERTY_SELECT } },
  });
}

export async function listSharedPropertiesForBuyer(
  buyerProfileId: string,
  leadPurchaseId: string,
) {
  const leadPurchase = await prisma.leadPurchase.findFirst({
    where: { id: leadPurchaseId, request: { buyerId: buyerProfileId } },
  });
  if (!leadPurchase) {
    throw new PropertyShareError("Lead no encontrado o no te pertenece.");
  }

  return prisma.propertyShare.findMany({
    where: { leadPurchaseId },
    orderBy: { sentAt: "desc" },
    include: { property: { select: SHARED_PROPERTY_SELECT } },
  });
}
