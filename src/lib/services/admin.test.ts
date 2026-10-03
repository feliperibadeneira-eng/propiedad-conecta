// getMarketplaceMetrics() agrega sobre TODA la base — no hay forma de
// aislarla con un RUN_ID como el resto de los tests. Por eso cada test
// mide un delta (antes/después de crear datos propios) en vez de asumir
// un total absoluto; así funciona sin importar qué más haya en la DB
// (seed, otras corridas, datos manuales).
import "dotenv/config";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../db";
import { hashPassword } from "../password";
import { getMarketplaceMetrics, ecuadorTodayStart } from "./admin";
import { purchaseWithCredits } from "./purchase";

const RUN_ID = Date.now().toString(36);
const createdUserIds: string[] = [];
const createdRequestIds: string[] = [];

async function makeUser(role: "BUYER" | "AGENT" | "ADMIN", createdAt?: Date) {
  const user = await prisma.user.create({
    data: {
      email: `test-metrics-${role.toLowerCase()}-${RUN_ID}-${createdUserIds.length}@test.local`,
      passwordHash: await hashPassword("test12345"),
      name: "Usuario de prueba",
      phone: "0990000000",
      role,
      ...(createdAt ? { createdAt } : {}),
    },
  });
  createdUserIds.push(user.id);
  return user;
}

async function makeBuyerWithRequest(
  operationType: "COMPRAR" | "ALQUILAR",
  status: "BUSCANDO" | "EN_PROCESO" | "PAUSADA" | "CERRADA" = "BUSCANDO",
) {
  const user = await makeUser("BUYER");
  const buyerProfile = await prisma.buyerProfile.create({
    data: { userId: user.id, contactConsent: true },
  });
  const request = await prisma.propertyRequest.create({
    data: {
      buyerId: buyerProfile.id,
      operationType,
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
      status,
    },
  });
  createdRequestIds.push(request.id);
  return { user, buyerProfile, request };
}

async function makeAgent(credits: number) {
  const user = await makeUser("AGENT");
  const profile = await prisma.agentProfile.create({
    data: { userId: user.id, creditsBalance: credits },
  });
  return { user, profile };
}

after(async () => {
  await prisma.propertyRequest.deleteMany({
    where: { id: { in: createdRequestIds } },
  });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.$disconnect();
});

test("separa usuarios registrados por rol (BUYER/AGENT/ADMIN)", async () => {
  const before = await getMarketplaceMetrics();
  await makeUser("BUYER");
  await makeUser("AGENT");
  await makeUser("ADMIN");
  const after = await getMarketplaceMetrics();

  assert.equal(after.users.buyers, before.users.buyers + 1);
  assert.equal(after.users.agents, before.users.agents + 1);
  assert.equal(after.users.admins, before.users.admins + 1);
  assert.equal(after.users.total, before.users.total + 3);
});

test("cuenta solicitudes por operationType (COMPRAR/ALQUILAR)", async () => {
  const before = await getMarketplaceMetrics();
  await makeBuyerWithRequest("COMPRAR");
  await makeBuyerWithRequest("ALQUILAR");
  const after = await getMarketplaceMetrics();

  assert.equal(after.requests.comprar, before.requests.comprar + 1);
  assert.equal(after.requests.alquilar, before.requests.alquilar + 1);
  assert.equal(after.requests.total, before.requests.total + 2);
});

test("agrupa el estado de solicitudes en activas/pausadas/cerradas usando los estados reales de Prisma", async () => {
  const before = await getMarketplaceMetrics();
  await makeBuyerWithRequest("COMPRAR", "BUSCANDO");
  await makeBuyerWithRequest("COMPRAR", "EN_PROCESO");
  await makeBuyerWithRequest("COMPRAR", "PAUSADA");
  await makeBuyerWithRequest("COMPRAR", "CERRADA");
  const after = await getMarketplaceMetrics();

  // BUSCANDO + EN_PROCESO cuentan como "activas" (sección 10 del README:
  // son los dos estados en los que la solicitud sigue buscando agentes).
  assert.equal(after.requests.active, before.requests.active + 2);
  assert.equal(after.requests.paused, before.requests.paused + 1);
  assert.equal(after.requests.closed, before.requests.closed + 1);
});

test("cuenta un lead desbloqueado real (vía purchaseWithCredits, no un insert directo)", async () => {
  const before = await getMarketplaceMetrics();
  const { request } = await makeBuyerWithRequest("COMPRAR");
  const { user: agentUser, profile: agentProfile } = await makeAgent(50);

  await purchaseWithCredits({
    agentUserId: agentUser.id,
    agentProfileId: agentProfile.id,
    requestId: request.id,
  });

  const after = await getMarketplaceMetrics();
  assert.equal(after.leads.unlocked, before.leads.unlocked + 1);
  assert.equal(after.agentsActivity.withUnlock, before.agentsActivity.withUnlock + 1);
});

test("créditos vendidos e ingresos solo cuentan compras APPROVED, nunca PENDING ni REJECTED", async () => {
  const before = await getMarketplaceMetrics();
  const { profile: agent1 } = await makeAgent(0);
  const { profile: agent2 } = await makeAgent(0);
  const { profile: agent3 } = await makeAgent(0);

  await prisma.creditPurchaseRequest.create({
    data: { agentId: agent1.id, package: "STARTER", amount: 10, credits: 10, status: "PENDING" },
  });
  await prisma.creditPurchaseRequest.create({
    data: { agentId: agent2.id, package: "PRO", amount: 40, credits: 50, status: "REJECTED" },
  });
  await prisma.creditPurchaseRequest.create({
    data: {
      agentId: agent3.id,
      package: "PREMIUM",
      amount: 75,
      credits: 100,
      status: "APPROVED",
      reviewedAt: new Date(),
    },
  });

  const after = await getMarketplaceMetrics();
  // Solo la APPROVED (paquete Premium: $75 / 100 créditos) debe contarse.
  assert.equal(after.credits.sold, before.credits.sold + 100);
  assert.equal(Number(after.credits.revenue), Number(before.credits.revenue) + 75);
  assert.equal(after.credits.approvedPurchases, before.credits.approvedPurchases + 1);
});

test("actividad reciente: separa correctamente hoy / 7 días / 30 días por fecha real", async () => {
  const before = await getMarketplaceMetrics();

  const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);

  await makeUser("BUYER"); // hoy: debe entrar en los 3 buckets
  await makeUser("BUYER", tenDaysAgo); // dentro de 30 días, fuera de hoy/7 días
  await makeUser("BUYER", fortyDaysAgo); // fuera de los 3 buckets

  const after = await getMarketplaceMetrics();

  assert.equal(after.recentActivity.users.today, before.recentActivity.users.today + 1);
  assert.equal(
    after.recentActivity.users.last7Days,
    before.recentActivity.users.last7Days + 1,
  );
  assert.equal(
    after.recentActivity.users.last30Days,
    before.recentActivity.users.last30Days + 2,
  );
});

test("ecuadorTodayStart usa la medianoche de Ecuador (UTC-5), no la medianoche UTC", () => {
  // 02:00 UTC del 3 de octubre = 21:00 (9pm) del 2 de octubre en Ecuador
  // — todavía "ayer" para Ecuador. La medianoche de Ecuador de ese día
  // (inicio del 2 de octubre en Ecuador) cae a las 05:00 UTC del 2 de
  // octubre. Si el cálculo usara medianoche UTC en vez de Ecuador,
  // devolvería 2026-10-03T00:00:00Z en vez de esto.
  const start = ecuadorTodayStart(new Date("2026-10-03T02:00:00.000Z"));
  assert.equal(start.toISOString(), "2026-10-02T05:00:00.000Z");
});

test("ecuadorTodayStart: a media mañana en Ecuador, hoy ya avanzó de fecha", () => {
  // 12:00 UTC del 3 de octubre = 07:00 (7am) del 3 de octubre en Ecuador
  // — ya es "hoy" (3 de octubre) para Ecuador.
  const start = ecuadorTodayStart(new Date("2026-10-03T12:00:00.000Z"));
  assert.equal(start.toISOString(), "2026-10-03T05:00:00.000Z");
});
