// Property es un modelo nuevo sin service layer todavía — estos tests
// ejercitan Prisma directamente (igual que el resto de fixtures de este
// archivo), validando solo el esquema: creación, campos opcionales,
// transiciones de status y la relación/cascada con AgentProfile.
import "dotenv/config";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../db";
import { hashPassword } from "../password";

const RUN_ID = Date.now().toString(36);
const createdUserIds: string[] = [];

async function makeAgent() {
  const user = await prisma.user.create({
    data: {
      email: `test-property-agent-${RUN_ID}-${createdUserIds.length}@test.local`,
      passwordHash: await hashPassword("test12345"),
      name: "Agente de prueba",
      phone: "0990000000",
      role: "AGENT",
    },
  });
  createdUserIds.push(user.id);
  const profile = await prisma.agentProfile.create({
    data: { userId: user.id },
  });
  return { user, profile };
}

function baseData(agentProfileId: string, operationType: "COMPRAR" | "ALQUILAR") {
  return {
    agentId: agentProfileId,
    operationType,
    propertyType: "DEPARTAMENTO" as const,
    title: "Departamento de prueba",
    price: 95000,
    provincia: "Pichincha",
    ciudad: "Quito",
    squareMeters: 80,
  };
}

after(async () => {
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.$disconnect();
});

test("crea una Property con operationType COMPRAR", async () => {
  const { profile } = await makeAgent();
  const property = await prisma.property.create({
    data: baseData(profile.id, "COMPRAR"),
  });
  assert.equal(property.operationType, "COMPRAR");
  assert.equal(property.agentId, profile.id);
});

test("crea una Property con operationType ALQUILAR", async () => {
  const { profile } = await makeAgent();
  const property = await prisma.property.create({
    data: baseData(profile.id, "ALQUILAR"),
  });
  assert.equal(property.operationType, "ALQUILAR");
});

test("los campos opcionales (description, sector, bedrooms, bathrooms) quedan null si se omiten", async () => {
  const { profile } = await makeAgent();
  const property = await prisma.property.create({
    data: baseData(profile.id, "COMPRAR"),
  });
  assert.equal(property.description, null);
  assert.equal(property.sector, null);
  assert.equal(property.bedrooms, null);
  assert.equal(property.bathrooms, null);
});

test("los campos opcionales se guardan correctamente cuando sí se envían", async () => {
  const { profile } = await makeAgent();
  const property = await prisma.property.create({
    data: {
      ...baseData(profile.id, "COMPRAR"),
      description: "Depto remodelado, excelente ubicación.",
      sector: "Cumbayá",
      bedrooms: 3,
      bathrooms: 2,
    },
  });
  assert.equal(property.description, "Depto remodelado, excelente ubicación.");
  assert.equal(property.sector, "Cumbayá");
  assert.equal(property.bedrooms, 3);
  assert.equal(property.bathrooms, 2);
});

test("el status por defecto de una Property nueva es DISPONIBLE", async () => {
  const { profile } = await makeAgent();
  const property = await prisma.property.create({
    data: baseData(profile.id, "COMPRAR"),
  });
  assert.equal(property.status, "DISPONIBLE");
});

test("una Property puede transicionar a PAUSADA", async () => {
  const { profile } = await makeAgent();
  const property = await prisma.property.create({
    data: baseData(profile.id, "COMPRAR"),
  });
  const updated = await prisma.property.update({
    where: { id: property.id },
    data: { status: "PAUSADA" },
  });
  assert.equal(updated.status, "PAUSADA");
});

test("una Property puede transicionar a CERRADA", async () => {
  const { profile } = await makeAgent();
  const property = await prisma.property.create({
    data: baseData(profile.id, "COMPRAR"),
  });
  const updated = await prisma.property.update({
    where: { id: property.id },
    data: { status: "CERRADA" },
  });
  assert.equal(updated.status, "CERRADA");
});

test("la relación con AgentProfile carga correctamente desde ambos lados", async () => {
  const { profile } = await makeAgent();
  const property = await prisma.property.create({
    data: baseData(profile.id, "COMPRAR"),
  });

  const withAgent = await prisma.property.findUniqueOrThrow({
    where: { id: property.id },
    include: { agent: true },
  });
  assert.equal(withAgent.agent.id, profile.id);

  const agentWithProperties = await prisma.agentProfile.findUniqueOrThrow({
    where: { id: profile.id },
    include: { properties: true },
  });
  assert.equal(agentWithProperties.properties.length, 1);
  assert.equal(agentWithProperties.properties[0].id, property.id);
});

test("borrar el AgentProfile (vía su User) borra en cascada sus Property", async () => {
  const { user, profile } = await makeAgent();
  const property = await prisma.property.create({
    data: baseData(profile.id, "COMPRAR"),
  });

  await prisma.user.delete({ where: { id: user.id } });

  const found = await prisma.property.findUnique({ where: { id: property.id } });
  assert.equal(found, null);
});
