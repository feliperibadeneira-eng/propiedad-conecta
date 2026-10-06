// Tests de propertyShares.ts: ownership del LeadPurchase, ownership de la
// Property, que solo se puedan compartir propiedades DISPONIBLE, que
// compartir la misma propiedad dos veces sea idempotente (no duplica), y
// aislamiento entre agentes/compradores al listar. Corre contra Postgres
// real, mismo patrón RUN_ID que el resto del proyecto.
import "dotenv/config";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../db";
import { hashPassword } from "../password";
import { createProperty } from "./properties";
import { purchaseWithCredits } from "./purchase";
import {
  shareProperty,
  listSharedPropertiesForAgent,
  listSharedPropertiesForBuyer,
  PropertyShareError,
} from "./propertyShares";

const RUN_ID = Date.now().toString(36);
const createdUserIds: string[] = [];
const createdRequestIds: string[] = [];

async function makeUser(role: "BUYER" | "AGENT") {
  const user = await prisma.user.create({
    data: {
      email: `test-propshare-${role.toLowerCase()}-${RUN_ID}-${createdUserIds.length}@test.local`,
      passwordHash: await hashPassword("test12345"),
      name: role === "AGENT" ? "Agente de prueba" : "Comprador de prueba",
      phone: "0990000000",
      role,
    },
  });
  createdUserIds.push(user.id);
  return user;
}

async function makeAgent(credits = 50) {
  const user = await makeUser("AGENT");
  const profile = await prisma.agentProfile.create({
    data: { userId: user.id, creditsBalance: credits },
  });
  return { user, profile };
}

async function makeBuyerWithRequest() {
  const user = await makeUser("BUYER");
  const buyerProfile = await prisma.buyerProfile.create({
    data: { userId: user.id, contactConsent: true },
  });
  const request = await prisma.propertyRequest.create({
    data: {
      buyerId: buyerProfile.id,
      operationType: "COMPRAR",
      propertyType: "DEPARTAMENTO",
      provincia: "Pichincha",
      ciudad: "Quito",
      priceMin: 100000,
      priceMax: 150000,
      contactName: user.name,
      contactPhone: user.phone!,
      contactPreference: "WHATSAPP",
      dataSharingConsent: true,
      maxAgents: 3,
      leadPrice: 0,
    },
  });
  createdRequestIds.push(request.id);
  return { user, buyerProfile, request };
}

async function makeProperty(
  agentProfileId: string,
  overrides: Partial<Parameters<typeof createProperty>[1]> = {},
) {
  return createProperty(agentProfileId, {
    operationType: "COMPRAR",
    propertyType: "DEPARTAMENTO",
    title: "Propiedad de prueba (compartir)",
    price: 120000,
    provincia: "Pichincha",
    ciudad: "Quito",
    squareMeters: 90,
    ...overrides,
  });
}

// Crea un LeadPurchase real (vía purchaseWithCredits, no un insert
// directo) entre un agente y un comprador frescos.
async function makeLeadPurchase() {
  const { user: agentUser, profile: agentProfile } = await makeAgent(50);
  const { request } = await makeBuyerWithRequest();
  const purchase = await purchaseWithCredits({
    agentUserId: agentUser.id,
    agentProfileId: agentProfile.id,
    requestId: request.id,
  });
  return { agentUser, agentProfile, request, purchase };
}

after(async () => {
  await prisma.propertyRequest.deleteMany({ where: { id: { in: createdRequestIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.$disconnect();
});

test("el agente dueño del lead comparte una propiedad propia DISPONIBLE", async () => {
  const { agentProfile, purchase } = await makeLeadPurchase();
  const property = await makeProperty(agentProfile.id);

  const result = await shareProperty(agentProfile.id, purchase.id, property.id);

  assert.equal(result.alreadyShared, false);
  assert.equal(result.leadPurchaseId, purchase.id);
  assert.equal(result.propertyId, property.id);
});

test("compartir la misma propiedad otra vez con el mismo lead es idempotente, no duplica", async () => {
  const { agentProfile, purchase } = await makeLeadPurchase();
  const property = await makeProperty(agentProfile.id);

  const first = await shareProperty(agentProfile.id, purchase.id, property.id);
  const second = await shareProperty(agentProfile.id, purchase.id, property.id);

  assert.equal(first.alreadyShared, false);
  assert.equal(second.alreadyShared, true);
  assert.equal(second.id, first.id, "debe ser la misma fila, no una nueva");

  const count = await prisma.propertyShare.count({
    where: { leadPurchaseId: purchase.id, propertyId: property.id },
  });
  assert.equal(count, 1, "no debe haber más de una fila para el mismo par");
});

test("un agente que no es dueño del LeadPurchase no puede compartir en él", async () => {
  const { purchase } = await makeLeadPurchase();
  const { profile: otherAgent } = await makeAgent(50);
  const foreignOwnProperty = await makeProperty(otherAgent.id);

  await assert.rejects(
    () => shareProperty(otherAgent.id, purchase.id, foreignOwnProperty.id),
    PropertyShareError,
  );

  const count = await prisma.propertyShare.count({ where: { leadPurchaseId: purchase.id } });
  assert.equal(count, 0, "no debe crearse ninguna fila");
});

test("un agente no puede compartir una propiedad que pertenece a otro agente", async () => {
  const { agentProfile, purchase } = await makeLeadPurchase();
  const { profile: otherAgent } = await makeAgent(0);
  const foreignProperty = await makeProperty(otherAgent.id);

  await assert.rejects(
    () => shareProperty(agentProfile.id, purchase.id, foreignProperty.id),
    PropertyShareError,
  );

  const count = await prisma.propertyShare.count({ where: { leadPurchaseId: purchase.id } });
  assert.equal(count, 0, "no debe crearse ninguna fila");
});

test("una propiedad propia PAUSADA no puede compartirse", async () => {
  const { agentProfile, purchase } = await makeLeadPurchase();
  const property = await makeProperty(agentProfile.id);
  await prisma.property.update({ where: { id: property.id }, data: { status: "PAUSADA" } });

  await assert.rejects(
    () => shareProperty(agentProfile.id, purchase.id, property.id),
    PropertyShareError,
  );

  const count = await prisma.propertyShare.count({ where: { leadPurchaseId: purchase.id } });
  assert.equal(count, 0, "no debe crearse ninguna fila");
});

test("una propiedad propia CERRADA no puede compartirse", async () => {
  const { agentProfile, purchase } = await makeLeadPurchase();
  const property = await makeProperty(agentProfile.id);
  await prisma.property.update({ where: { id: property.id }, data: { status: "CERRADA" } });

  await assert.rejects(
    () => shareProperty(agentProfile.id, purchase.id, property.id),
    PropertyShareError,
  );

  const count = await prisma.propertyShare.count({ where: { leadPurchaseId: purchase.id } });
  assert.equal(count, 0, "no debe crearse ninguna fila");
});

test("una propiedad inexistente no puede compartirse", async () => {
  const { agentProfile, purchase } = await makeLeadPurchase();

  await assert.rejects(
    () =>
      shareProperty(
        agentProfile.id,
        purchase.id,
        "00000000-0000-0000-0000-000000000000",
      ),
    PropertyShareError,
  );
});

test("listSharedPropertiesForAgent: aislamiento — otro agente no puede listar las de un lead ajeno", async () => {
  const { agentProfile, purchase } = await makeLeadPurchase();
  const property = await makeProperty(agentProfile.id);
  await shareProperty(agentProfile.id, purchase.id, property.id);

  const { profile: otherAgent } = await makeAgent(0);
  await assert.rejects(
    () => listSharedPropertiesForAgent(otherAgent.id, purchase.id),
    PropertyShareError,
  );
});

test("listSharedPropertiesForAgent devuelve las propiedades compartidas del agente dueño, con sus datos", async () => {
  const { agentProfile, purchase } = await makeLeadPurchase();
  const property = await makeProperty(agentProfile.id, { title: "Depto para listar" });
  await shareProperty(agentProfile.id, purchase.id, property.id);

  const shares = await listSharedPropertiesForAgent(agentProfile.id, purchase.id);
  assert.equal(shares.length, 1);
  assert.equal(shares[0].property?.id, property.id);
  assert.equal(shares[0].property?.title, "Depto para listar");
});

test("listSharedPropertiesForBuyer: aislamiento — otro comprador no puede listar las de un lead ajeno", async () => {
  const { agentProfile, purchase } = await makeLeadPurchase();
  const property = await makeProperty(agentProfile.id);
  await shareProperty(agentProfile.id, purchase.id, property.id);

  const { buyerProfile: otherBuyer } = await makeBuyerWithRequest();
  await assert.rejects(
    () => listSharedPropertiesForBuyer(otherBuyer.id, purchase.id),
    PropertyShareError,
  );
});

test("listSharedPropertiesForBuyer devuelve las propiedades compartidas al comprador dueño de la solicitud", async () => {
  const { agentProfile, request, purchase } = await makeLeadPurchase();
  const property = await makeProperty(agentProfile.id, { title: "Depto para el comprador" });
  await shareProperty(agentProfile.id, purchase.id, property.id);

  const buyerProfile = await prisma.buyerProfile.findUniqueOrThrow({
    where: { id: request.buyerId },
  });
  const shares = await listSharedPropertiesForBuyer(buyerProfile.id, purchase.id);
  assert.equal(shares.length, 1);
  assert.equal(shares[0].property?.title, "Depto para el comprador");
});
