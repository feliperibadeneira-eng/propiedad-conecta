import { prisma } from "@/lib/db";
import type { CreatePropertyInput, UpdatePropertyInput } from "@/lib/validators/property";
import type { PropertyStatus } from "@/generated/prisma/enums";

export async function createProperty(agentProfileId: string, input: CreatePropertyInput) {
  return prisma.property.create({
    data: {
      agentId: agentProfileId,
      operationType: input.operationType,
      propertyType: input.propertyType,
      title: input.title,
      description: input.description || null,
      price: input.price,
      provincia: input.provincia,
      ciudad: input.ciudad,
      sector: input.sector || null,
      squareMeters: input.squareMeters,
      bedrooms: input.bedrooms,
      bathrooms: input.bathrooms,
    },
  });
}

export async function listAgentProperties(agentProfileId: string) {
  return prisma.property.findMany({
    where: { agentId: agentProfileId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getAgentPropertyDetail(agentProfileId: string, propertyId: string) {
  return prisma.property.findFirst({
    where: { id: propertyId, agentId: agentProfileId },
  });
}

export async function updateProperty(
  agentProfileId: string,
  propertyId: string,
  input: UpdatePropertyInput,
) {
  const property = await prisma.property.findFirst({
    where: { id: propertyId, agentId: agentProfileId },
  });
  if (!property) throw new Error("Propiedad no encontrada");

  return prisma.property.update({
    where: { id: propertyId },
    data: {
      operationType: input.operationType,
      propertyType: input.propertyType,
      title: input.title,
      description: input.description || null,
      price: input.price,
      provincia: input.provincia,
      ciudad: input.ciudad,
      sector: input.sector || null,
      squareMeters: input.squareMeters,
      bedrooms: input.bedrooms,
      bathrooms: input.bathrooms,
    },
  });
}

export async function setPropertyStatus(
  agentProfileId: string,
  propertyId: string,
  status: PropertyStatus,
) {
  const property = await prisma.property.findFirst({
    where: { id: propertyId, agentId: agentProfileId },
  });
  if (!property) throw new Error("Propiedad no encontrada");

  return prisma.property.update({
    where: { id: propertyId },
    data: { status },
  });
}
