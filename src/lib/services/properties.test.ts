// Reemplaza al antiguo property.test.ts (que probaba el modelo de Prisma
// directamente porque todavía no existía la capa de servicio). Ahora
// ejercita properties.ts: creación, lectura/listado con ownership,
// edición, cambio de status, y la validación de esquema de
// validators/property.ts — incluyendo los dos casos donde el agente A no
// puede ver ni modificar una propiedad del agente B.
import "dotenv/config";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../db";
import { hashPassword } from "../password";
import {
  createProperty,
  listAgentProperties,
  getAgentPropertyDetail,
  updateProperty,
  setPropertyStatus,
} from "./properties";
import { createPropertySchema, type CreatePropertyInput } from "../validators/property";

const RUN_ID = Date.now().toString(36);
const createdUserIds: string[] = [];

async function makeAgent() {
  const user = await prisma.user.create({
    data: {
      email: `test-properties-agent-${RUN_ID}-${createdUserIds.length}@test.local`,
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

function baseInput(operationType: "COMPRAR" | "ALQUILAR"): CreatePropertyInput {
  return {
    operationType,
    propertyType: "DEPARTAMENTO",
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

test("createProperty guarda una propiedad de COMPRAR tal cual se envía", async () => {
  const { profile } = await makeAgent();
  const property = await createProperty(profile.id, baseInput("COMPRAR"));
  assert.equal(property.operationType, "COMPRAR");
  assert.equal(property.agentId, profile.id);
});

test("createProperty guarda una propiedad de ALQUILAR tal cual se envía", async () => {
  const { profile } = await makeAgent();
  const property = await createProperty(profile.id, baseInput("ALQUILAR"));
  assert.equal(property.operationType, "ALQUILAR");
});

test("createProperty deja los campos opcionales como null si se omiten", async () => {
  const { profile } = await makeAgent();
  const property = await createProperty(profile.id, baseInput("COMPRAR"));
  assert.equal(property.description, null);
  assert.equal(property.sector, null);
  assert.equal(property.bedrooms, null);
  assert.equal(property.bathrooms, null);
});

test("createProperty guarda los campos opcionales cuando sí se envían", async () => {
  const { profile } = await makeAgent();
  const property = await createProperty(profile.id, {
    ...baseInput("COMPRAR"),
    description: "Depto remodelado, excelente ubicación.",
    sector: "Cumbayá",
    bedrooms: 3,
    bathrooms: 2,
  });
  assert.equal(property.description, "Depto remodelado, excelente ubicación.");
  assert.equal(property.sector, "Cumbayá");
  assert.equal(property.bedrooms, 3);
  assert.equal(property.bathrooms, 2);
});

test("createProperty asigna status DISPONIBLE por defecto", async () => {
  const { profile } = await makeAgent();
  const property = await createProperty(profile.id, baseInput("COMPRAR"));
  assert.equal(property.status, "DISPONIBLE");
});

test("la relación con AgentProfile carga correctamente desde ambos lados", async () => {
  const { profile } = await makeAgent();
  const property = await createProperty(profile.id, baseInput("COMPRAR"));

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
  const property = await createProperty(profile.id, baseInput("COMPRAR"));

  await prisma.user.delete({ where: { id: user.id } });

  const found = await prisma.property.findUnique({ where: { id: property.id } });
  assert.equal(found, null);
});

test("listAgentProperties solo devuelve las propiedades del agente dueño", async () => {
  const { profile: agentA } = await makeAgent();
  const { profile: agentB } = await makeAgent();
  const propertyA = await createProperty(agentA.id, baseInput("COMPRAR"));
  await createProperty(agentB.id, baseInput("ALQUILAR"));

  const listA = await listAgentProperties(agentA.id);
  assert.equal(listA.length, 1);
  assert.equal(listA[0].id, propertyA.id);
});

test("getAgentPropertyDetail devuelve la propiedad cuando el agente es el dueño", async () => {
  const { profile } = await makeAgent();
  const property = await createProperty(profile.id, baseInput("COMPRAR"));

  const found = await getAgentPropertyDetail(profile.id, property.id);
  assert.ok(found);
  assert.equal(found!.id, property.id);
});

test("getAgentPropertyDetail devuelve null cuando la propiedad es de otro agente", async () => {
  const { profile: agentA } = await makeAgent();
  const { profile: agentB } = await makeAgent();
  const property = await createProperty(agentB.id, baseInput("COMPRAR"));

  const found = await getAgentPropertyDetail(agentA.id, property.id);
  assert.equal(found, null);
});

test("getAgentPropertyDetail devuelve null cuando el id no existe", async () => {
  const { profile } = await makeAgent();
  const found = await getAgentPropertyDetail(
    profile.id,
    "00000000-0000-0000-0000-000000000000",
  );
  assert.equal(found, null);
});

test("updateProperty actualiza los campos de una propiedad propia", async () => {
  const { profile } = await makeAgent();
  const property = await createProperty(profile.id, baseInput("COMPRAR"));

  const updated = await updateProperty(profile.id, property.id, {
    ...baseInput("ALQUILAR"),
    title: "Título actualizado",
    price: 120000,
  });
  assert.equal(updated.title, "Título actualizado");
  assert.equal(Number(updated.price), 120000);
  assert.equal(updated.operationType, "ALQUILAR");
});

test("updateProperty lanza un error si el agente no es el dueño, y no modifica la fila", async () => {
  const { profile: agentA } = await makeAgent();
  const { profile: agentB } = await makeAgent();
  const property = await createProperty(agentB.id, baseInput("COMPRAR"));

  await assert.rejects(() =>
    updateProperty(agentA.id, property.id, { ...baseInput("COMPRAR"), title: "Hackeado" }),
  );

  const stillOriginal = await prisma.property.findUniqueOrThrow({ where: { id: property.id } });
  assert.equal(stillOriginal.title, "Departamento de prueba");
});

test("setPropertyStatus cambia una propiedad propia a PAUSADA", async () => {
  const { profile } = await makeAgent();
  const property = await createProperty(profile.id, baseInput("COMPRAR"));
  const updated = await setPropertyStatus(profile.id, property.id, "PAUSADA");
  assert.equal(updated.status, "PAUSADA");
});

test("setPropertyStatus cambia una propiedad propia a CERRADA", async () => {
  const { profile } = await makeAgent();
  const property = await createProperty(profile.id, baseInput("COMPRAR"));
  const updated = await setPropertyStatus(profile.id, property.id, "CERRADA");
  assert.equal(updated.status, "CERRADA");
});

test("setPropertyStatus puede volver a cambiar una propiedad a DISPONIBLE", async () => {
  const { profile } = await makeAgent();
  const property = await createProperty(profile.id, baseInput("COMPRAR"));
  await setPropertyStatus(profile.id, property.id, "PAUSADA");
  const reactivated = await setPropertyStatus(profile.id, property.id, "DISPONIBLE");
  assert.equal(reactivated.status, "DISPONIBLE");
});

test("setPropertyStatus lanza un error si el agente no es el dueño, y no modifica el status", async () => {
  const { profile: agentA } = await makeAgent();
  const { profile: agentB } = await makeAgent();
  const property = await createProperty(agentB.id, baseInput("COMPRAR"));

  await assert.rejects(() => setPropertyStatus(agentA.id, property.id, "CERRADA"));

  const stillAvailable = await prisma.property.findUniqueOrThrow({ where: { id: property.id } });
  assert.equal(stillAvailable.status, "DISPONIBLE");
});

test("createPropertySchema rechaza cuando falta un campo requerido (title)", () => {
  const result = createPropertySchema.safeParse({ ...baseInput("COMPRAR"), title: undefined });
  assert.equal(result.success, false);
});

test("createPropertySchema rechaza price igual a 0 o negativo", () => {
  const zero = createPropertySchema.safeParse({ ...baseInput("COMPRAR"), price: 0 });
  assert.equal(zero.success, false);
  const negative = createPropertySchema.safeParse({ ...baseInput("COMPRAR"), price: -100 });
  assert.equal(negative.success, false);
});

test("createPropertySchema rechaza squareMeters igual a 0 o negativo", () => {
  const zero = createPropertySchema.safeParse({ ...baseInput("COMPRAR"), squareMeters: 0 });
  assert.equal(zero.success, false);
  const negative = createPropertySchema.safeParse({ ...baseInput("COMPRAR"), squareMeters: -10 });
  assert.equal(negative.success, false);
});
