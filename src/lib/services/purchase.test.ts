// Tests de las reglas críticas del sistema de créditos (sección 12).
// Corren contra la base de datos real de desarrollo (la misma que usa
// `npm run dev`), igual que el seed — no hay mocks. Cada test crea sus
// propios datos con un prefijo único y los limpia al final.
import "dotenv/config";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../db";
import { hashPassword } from "../password";
import { purchaseWithCredits, PurchaseError } from "./purchase";
import { getPurchasedLeadDetail } from "./leads";
import { getUnlockCost } from "./credits";
import { createRequestSchema } from "../validators/request";

const RUN_ID = Date.now().toString(36);
const createdUserIds: string[] = [];

async function makeAgent(credits: number) {
  const user = await prisma.user.create({
    data: {
      email: `test-agent-${RUN_ID}-${createdUserIds.length}@test.local`,
      passwordHash: await hashPassword("test12345"),
      name: "Agente de prueba",
      phone: "0990000000",
      role: "AGENT",
    },
  });
  createdUserIds.push(user.id);
  const profile = await prisma.agentProfile.create({
    data: { userId: user.id, creditsBalance: credits },
  });
  if (credits > 0) {
    await prisma.creditLedgerEntry.create({
      data: {
        agentId: profile.id,
        amount: credits,
        balanceAfter: credits,
        reason: "STARTING_BALANCE",
      },
    });
  }
  return { user, profile };
}

async function makeBuyerRequest(operationType: "COMPRAR" | "ALQUILAR") {
  const user = await prisma.user.create({
    data: {
      email: `test-buyer-${RUN_ID}-${createdUserIds.length}@test.local`,
      passwordHash: await hashPassword("test12345"),
      name: "Comprador de prueba",
      phone: "0991111111",
      role: "BUYER",
    },
  });
  createdUserIds.push(user.id);
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
      contactEmail: user.email,
      contactPreference: "WHATSAPP",
      dataSharingConsent: true,
      maxAgents: 3,
      leadPrice: 15,
    },
  });
  return { user, buyerProfile, request };
}

let richAgent: Awaited<ReturnType<typeof makeAgent>>;
let poorAgent: Awaited<ReturnType<typeof makeAgent>>;
let compraRequest: Awaited<ReturnType<typeof makeBuyerRequest>>;
let alquilerRequest: Awaited<ReturnType<typeof makeBuyerRequest>>;

before(async () => {
  richAgent = await makeAgent(100);
  poorAgent = await makeAgent(0);
  compraRequest = await makeBuyerRequest("COMPRAR");
  alquilerRequest = await makeBuyerRequest("ALQUILAR");
});

after(async () => {
  // Cascada: borrar los Users borra Profiles/Sessions/etc; borrar las
  // PropertyRequest borra features/purchases/payments/exchanges/historial.
  await prisma.propertyRequest.deleteMany({
    where: { id: { in: [compraRequest.request.id, alquilerRequest.request.id] } },
  });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.$disconnect();
});

test("un agente sin créditos no puede desbloquear un lead", async () => {
  await assert.rejects(
    () =>
      purchaseWithCredits({
        agentUserId: poorAgent.user.id,
        agentProfileId: poorAgent.profile.id,
        requestId: compraRequest.request.id,
      }),
    PurchaseError,
  );
  const detail = await getPurchasedLeadDetail(
    poorAgent.profile.id,
    compraRequest.request.id,
  );
  assert.equal(detail, null, "no debe existir un LeadPurchase para este par");
});

test("una solicitud de compra cuesta 10 créditos", () => {
  assert.equal(getUnlockCost("COMPRAR"), 10);
});

test("una solicitud de alquiler cuesta 2 créditos", () => {
  assert.equal(getUnlockCost("ALQUILAR"), 2);
});

test("un agente con créditos puede desbloquear y se cobra lo correcto", async () => {
  const before = await prisma.agentProfile.findUniqueOrThrow({
    where: { id: richAgent.profile.id },
  });

  const purchase = await purchaseWithCredits({
    agentUserId: richAgent.user.id,
    agentProfileId: richAgent.profile.id,
    requestId: compraRequest.request.id,
  });

  assert.equal(purchase.creditsUsed, 10);
  assert.equal(purchase.status, "PURCHASED");

  const after = await prisma.agentProfile.findUniqueOrThrow({
    where: { id: richAgent.profile.id },
  });
  assert.equal(after.creditsBalance, before.creditsBalance - 10);

  // El contacto solo se entrega ahora que el LeadPurchase existe.
  const detail = await getPurchasedLeadDetail(
    richAgent.profile.id,
    compraRequest.request.id,
  );
  assert.ok(detail, "debe existir el LeadPurchase tras el desbloqueo");
  assert.equal(detail!.request.contactPhone, compraRequest.user.phone);
});

test("no se puede cobrar dos veces la misma solicitud al mismo agente", async () => {
  // richAgent ya compró compraRequest en el test anterior.
  await assert.rejects(
    () =>
      purchaseWithCredits({
        agentUserId: richAgent.user.id,
        agentProfileId: richAgent.profile.id,
        requestId: compraRequest.request.id,
      }),
    PurchaseError,
  );
});

test("una solicitud de alquiler descuenta 2 créditos", async () => {
  const before = await prisma.agentProfile.findUniqueOrThrow({
    where: { id: richAgent.profile.id },
  });
  const purchase = await purchaseWithCredits({
    agentUserId: richAgent.user.id,
    agentProfileId: richAgent.profile.id,
    requestId: alquilerRequest.request.id,
  });
  assert.equal(purchase.creditsUsed, 2);
  const after = await prisma.agentProfile.findUniqueOrThrow({
    where: { id: richAgent.profile.id },
  });
  assert.equal(after.creditsBalance, before.creditsBalance - 2);
});

test("el saldo del agente siempre coincide con la suma de su ledger", async () => {
  const [agent, entries] = await Promise.all([
    prisma.agentProfile.findUniqueOrThrow({ where: { id: richAgent.profile.id } }),
    prisma.creditLedgerEntry.findMany({ where: { agentId: richAgent.profile.id } }),
  ]);
  const sum = entries.reduce((acc, e) => acc + e.amount, 0);
  assert.equal(agent.creditsBalance, sum);
  // Cada entrada, en orden, también debe coincidir con su propio balanceAfter.
  const sorted = [...entries].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
  let running = 0;
  for (const e of sorted) {
    running += e.amount;
    assert.equal(e.balanceAfter, running);
  }
});

test("los campos personales opcionales pueden quedar vacíos", () => {
  const parsed = createRequestSchema.safeParse({
    operationType: "COMPRAR",
    propertyType: "DEPARTAMENTO",
    provincia: "Pichincha",
    ciudad: "Quito",
    priceMin: "100000",
    priceMax: "150000",
    contactName: "Prueba Sin Descripción",
    contactPhone: "0991234567",
    contactPreference: "WHATSAPP",
    maxAgents: "3",
    // occupation/searchReason/additionalNotes/moveInDate deliberadamente ausentes
  });
  assert.equal(parsed.success, true);
});
