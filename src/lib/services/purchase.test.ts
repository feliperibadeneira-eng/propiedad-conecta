// Tests de las reglas críticas del sistema de créditos (sección 12).
// Corren contra la base de datos real de desarrollo (la misma que usa
// `npm run dev`), igual que el seed — no hay mocks. Cada test crea sus
// propios datos con un prefijo único y los limpia al final.
import "dotenv/config";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../db";
import { hashPassword } from "../password";
import {
  purchaseWithCredits,
  confirmPaymentById,
  PurchaseError,
  computeContactProtectionDeadline,
  isContactAccessible,
  releaseLead,
  markAgentContacted,
  markAppointmentScheduled,
  markBuyerOutcome,
  reactivateLeadPurchase,
  revealOwnContact,
  requestContactRelease,
  approveContactReleaseRequest,
  rejectContactReleaseRequest,
  cancelContactReleaseRequest,
  getRevealedContactMethods,
  requestRefund,
  approveRefund,
  rejectRefund,
  isEligibleForRefundCategory,
} from "./purchase";
import { getPurchasedLeadDetail } from "./leads";
import { getUnlockCost } from "./credits";
import { createProperty } from "./properties";
import { createRequestSchema } from "../validators/request";
import { requestRefundSchema, decisionReasonSchema } from "../validators/refund";
import { getContactProtectionHours } from "../settings";
import { recordStatusChange } from "./requests";
import { logAudit } from "./audit";

const RUN_ID = Date.now().toString(36);
const createdUserIds: string[] = [];
const createdRequestIds: string[] = [];

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

async function makeProperty(
  agentProfileId: string,
  overrides: Partial<Parameters<typeof createProperty>[1]> = {},
) {
  return createProperty(agentProfileId, {
    operationType: "COMPRAR",
    propertyType: "DEPARTAMENTO",
    title: "Propiedad de prueba (origen de unlock)",
    price: 120000,
    provincia: "Pichincha",
    ciudad: "Quito",
    squareMeters: 90,
    ...overrides,
  });
}

let richAgent: Awaited<ReturnType<typeof makeAgent>>;
let poorAgent: Awaited<ReturnType<typeof makeAgent>>;
let secondAgent: Awaited<ReturnType<typeof makeAgent>>;
let compraRequest: Awaited<ReturnType<typeof makeBuyerRequest>>;
let alquilerRequest: Awaited<ReturnType<typeof makeBuyerRequest>>;
let ownProperty: Awaited<ReturnType<typeof makeProperty>>;
let pausedProperty: Awaited<ReturnType<typeof makeProperty>>;
let closedProperty: Awaited<ReturnType<typeof makeProperty>>;
let foreignProperty: Awaited<ReturnType<typeof makeProperty>>;

before(async () => {
  richAgent = await makeAgent(100);
  poorAgent = await makeAgent(0);
  secondAgent = await makeAgent(50);
  compraRequest = await makeBuyerRequest("COMPRAR");
  alquilerRequest = await makeBuyerRequest("ALQUILAR");

  ownProperty = await makeProperty(richAgent.profile.id, { title: "Propia disponible" });
  pausedProperty = await makeProperty(richAgent.profile.id, { title: "Propia pausada" });
  await prisma.property.update({ where: { id: pausedProperty.id }, data: { status: "PAUSADA" } });
  closedProperty = await makeProperty(richAgent.profile.id, { title: "Propia cerrada" });
  await prisma.property.update({ where: { id: closedProperty.id }, data: { status: "CERRADA" } });
  foreignProperty = await makeProperty(secondAgent.profile.id, { title: "Ajena" });
});

after(async () => {
  // Cascada: borrar los Users borra Profiles/Sessions/Property/etc; borrar
  // las PropertyRequest borra features/purchases/payments/exchanges/historial.
  await prisma.propertyRequest.deleteMany({
    where: {
      id: {
        in: [compraRequest.request.id, alquilerRequest.request.id, ...createdRequestIds],
      },
    },
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

// ---------- propertyId: propiedad de origen del desbloqueo (PR #14) ----------
//
// Regla: propertyId ausente -> unlock normal, null. propertyId válido y
// propio -> se guarda (incluso si la propiedad está PAUSADA/CERRADA, ya
// que es atribución histórica, no disponibilidad actual). propertyId
// inexistente o de otro agente -> rechaza TODO el unlock, sin cobrar
// créditos ni crear nada — nunca se degrada en silencio a null.

test("unlock sin propertyId: funciona y guarda propertyId null (compatibilidad)", async () => {
  const { request } = await makeBuyerRequest("COMPRAR");
  createdRequestIds.push(request.id);

  const purchase = await purchaseWithCredits({
    agentUserId: richAgent.user.id,
    agentProfileId: richAgent.profile.id,
    requestId: request.id,
  });

  assert.equal(purchase.propertyId, null);
});

test("propertyId de una propiedad propia DISPONIBLE: funciona y lo guarda", async () => {
  const { request } = await makeBuyerRequest("COMPRAR");
  createdRequestIds.push(request.id);

  const purchase = await purchaseWithCredits({
    agentUserId: richAgent.user.id,
    agentProfileId: richAgent.profile.id,
    requestId: request.id,
    propertyId: ownProperty.id,
  });

  assert.equal(purchase.propertyId, ownProperty.id);
});

test("propertyId de otro agente: rechaza el unlock completo, sin cobrar ni crear nada", async () => {
  const { request } = await makeBuyerRequest("COMPRAR");
  createdRequestIds.push(request.id);

  const balanceBefore = await prisma.agentProfile.findUniqueOrThrow({
    where: { id: richAgent.profile.id },
  });
  const ledgerCountBefore = await prisma.creditLedgerEntry.count({
    where: { agentId: richAgent.profile.id },
  });

  await assert.rejects(
    () =>
      purchaseWithCredits({
        agentUserId: richAgent.user.id,
        agentProfileId: richAgent.profile.id,
        requestId: request.id,
        propertyId: foreignProperty.id,
      }),
    PurchaseError,
  );

  const balanceAfter = await prisma.agentProfile.findUniqueOrThrow({
    where: { id: richAgent.profile.id },
  });
  assert.equal(balanceAfter.creditsBalance, balanceBefore.creditsBalance, "no debe descontarse balance");

  const ledgerCountAfter = await prisma.creditLedgerEntry.count({
    where: { agentId: richAgent.profile.id },
  });
  assert.equal(ledgerCountAfter, ledgerCountBefore, "no debe crearse movimiento de créditos");

  const leadPurchase = await prisma.leadPurchase.findUnique({
    where: { requestId_agentId: { requestId: request.id, agentId: richAgent.profile.id } },
  });
  assert.equal(leadPurchase, null, "no debe crearse LeadPurchase");

  const exchange = await prisma.contactExchange.findFirst({ where: { requestId: request.id } });
  assert.equal(exchange, null, "no debe crearse ContactExchange");
});

test("propertyId inexistente: rechaza el unlock completo, sin cobrar ni crear nada", async () => {
  const { request } = await makeBuyerRequest("COMPRAR");
  createdRequestIds.push(request.id);

  const balanceBefore = await prisma.agentProfile.findUniqueOrThrow({
    where: { id: richAgent.profile.id },
  });
  const ledgerCountBefore = await prisma.creditLedgerEntry.count({
    where: { agentId: richAgent.profile.id },
  });

  await assert.rejects(
    () =>
      purchaseWithCredits({
        agentUserId: richAgent.user.id,
        agentProfileId: richAgent.profile.id,
        requestId: request.id,
        propertyId: "00000000-0000-0000-0000-000000000000",
      }),
    PurchaseError,
  );

  const balanceAfter = await prisma.agentProfile.findUniqueOrThrow({
    where: { id: richAgent.profile.id },
  });
  assert.equal(balanceAfter.creditsBalance, balanceBefore.creditsBalance, "no debe descontarse balance");

  const ledgerCountAfter = await prisma.creditLedgerEntry.count({
    where: { agentId: richAgent.profile.id },
  });
  assert.equal(ledgerCountAfter, ledgerCountBefore, "no debe crearse movimiento de créditos");

  const leadPurchase = await prisma.leadPurchase.findUnique({
    where: { requestId_agentId: { requestId: request.id, agentId: richAgent.profile.id } },
  });
  assert.equal(leadPurchase, null, "no debe crearse LeadPurchase");

  const exchange = await prisma.contactExchange.findFirst({ where: { requestId: request.id } });
  assert.equal(exchange, null, "no debe crearse ContactExchange");
});

test("duplicado: misma solicitud y mismo agente sigue rechazado, con o sin propertyId", async () => {
  const { request } = await makeBuyerRequest("COMPRAR");
  createdRequestIds.push(request.id);

  await purchaseWithCredits({
    agentUserId: richAgent.user.id,
    agentProfileId: richAgent.profile.id,
    requestId: request.id,
  });

  await assert.rejects(
    () =>
      purchaseWithCredits({
        agentUserId: richAgent.user.id,
        agentProfileId: richAgent.profile.id,
        requestId: request.id,
        propertyId: ownProperty.id,
      }),
    PurchaseError,
  );
});

test("propertyId de una propiedad propia PAUSADA: funciona y la guarda (atribución histórica)", async () => {
  const { request } = await makeBuyerRequest("COMPRAR");
  createdRequestIds.push(request.id);

  const purchase = await purchaseWithCredits({
    agentUserId: richAgent.user.id,
    agentProfileId: richAgent.profile.id,
    requestId: request.id,
    propertyId: pausedProperty.id,
  });

  assert.equal(purchase.propertyId, pausedProperty.id);
});

test("propertyId de una propiedad propia CERRADA: funciona y la guarda (atribución histórica)", async () => {
  const { request } = await makeBuyerRequest("COMPRAR");
  createdRequestIds.push(request.id);

  const purchase = await purchaseWithCredits({
    agentUserId: richAgent.user.id,
    agentProfileId: richAgent.profile.id,
    requestId: request.id,
    propertyId: closedProperty.id,
  });

  assert.equal(purchase.propertyId, closedProperty.id);
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

test("operationType ALQUILAR también es un valor válido del schema", () => {
  const parsed = createRequestSchema.safeParse({
    operationType: "ALQUILAR",
    propertyType: "DEPARTAMENTO",
    provincia: "Pichincha",
    ciudad: "Quito",
    priceMin: "100000",
    priceMax: "150000",
    contactName: "Prueba Alquiler",
    contactPhone: "0991234567",
    contactPreference: "WHATSAPP",
    maxAgents: "3",
  });
  assert.equal(parsed.success, true);
});

// El form ya no preselecciona COMPRAR (RequestForm.tsx): esta es la
// garantía real detrás de eso — si no llega operationType, el servidor
// rechaza la solicitud en vez de asumir un valor por defecto.
test("operationType sigue siendo obligatorio: sin él, el schema rechaza la solicitud", () => {
  const parsed = createRequestSchema.safeParse({
    propertyType: "DEPARTAMENTO",
    provincia: "Pichincha",
    ciudad: "Quito",
    priceMin: "100000",
    priceMax: "150000",
    contactName: "Prueba Sin Operación",
    contactPhone: "0991234567",
    contactPreference: "WHATSAPP",
    maxAgents: "3",
    // operationType deliberadamente ausente
  });
  assert.equal(parsed.success, false);
  if (!parsed.success) {
    assert.ok(
      parsed.error.issues.some(
        (issue) => issue.path[0] === "operationType",
      ),
    );
  }
});

// ---------- Protección de contacto (PR A: configuración y reglas
// fundamentales únicamente — nada bloquea el contacto todavía) ----------

test("computeContactProtectionDeadline suma las horas de protección a revealedAt", () => {
  const revealedAt = new Date("2026-01-01T00:00:00.000Z");
  const deadline = computeContactProtectionDeadline(revealedAt, 24);
  assert.equal(deadline.toISOString(), "2026-01-02T00:00:00.000Z");
});

test("computeContactProtectionDeadline con 0 horas: el plazo es el mismo instante", () => {
  const revealedAt = new Date("2026-01-01T00:00:00.000Z");
  const deadline = computeContactProtectionDeadline(revealedAt, 0);
  assert.equal(deadline.getTime(), revealedAt.getTime());
});

test("isContactAccessible: protectedUntil null (compra anterior a esta función) siempre es accesible", () => {
  assert.equal(isContactAccessible({ protectedUntil: null }), true);
});

test("isContactAccessible: todavía no llega el plazo, no es accesible", () => {
  const now = new Date("2026-01-01T12:00:00.000Z");
  const protectedUntil = new Date("2026-01-02T00:00:00.000Z");
  assert.equal(isContactAccessible({ protectedUntil }, now), false);
});

test("isContactAccessible: ya pasó el plazo, es accesible (liberación por tiempo)", () => {
  const now = new Date("2026-01-02T00:00:00.000Z");
  const protectedUntil = new Date("2026-01-01T00:00:00.000Z");
  assert.equal(isContactAccessible({ protectedUntil }, now), true);
});

test("isContactAccessible: consentimiento explícito libera antes de tiempo, aunque el plazo no haya llegado", () => {
  const now = new Date("2026-01-01T01:00:00.000Z");
  const protectedUntil = new Date("2026-01-02T00:00:00.000Z");
  assert.equal(
    isContactAccessible({ protectedUntil, consentReleasedAt: now }, now),
    true,
  );
});

test("purchaseWithCredits guarda protectedUntil usando la configuración vigente", async () => {
  const { request } = await makeBuyerRequest("COMPRAR");
  createdRequestIds.push(request.id);
  const agent = await makeAgent(20);

  const protectionHours = await getContactProtectionHours();
  const before = new Date();
  const purchase = await purchaseWithCredits({
    agentUserId: agent.user.id,
    agentProfileId: agent.profile.id,
    requestId: request.id,
  });

  const exchange = await prisma.contactExchange.findUniqueOrThrow({
    where: { leadPurchaseId: purchase.id },
  });
  assert.ok(
    exchange.protectedUntil,
    "protectedUntil debe quedar establecido en compras nuevas",
  );
  const expected = computeContactProtectionDeadline(before, protectionHours);
  const diffMs = Math.abs(exchange.protectedUntil!.getTime() - expected.getTime());
  assert.ok(
    diffMs < 5000,
    `protectedUntil debe ser ~revealedAt + ${protectionHours}h (diff: ${diffMs}ms)`,
  );
});

test("confirmPaymentById también guarda protectedUntil (mismo cálculo que purchaseWithCredits)", async () => {
  const { request } = await makeBuyerRequest("COMPRAR");
  createdRequestIds.push(request.id);
  const agent = await makeAgent(0);

  const payment = await prisma.payment.create({
    data: {
      agentId: agent.profile.id,
      requestId: request.id,
      amount: getUnlockCost(request.operationType),
      status: "PENDING",
    },
  });

  const protectionHours = await getContactProtectionHours();
  const before = new Date();
  const result = await confirmPaymentById(payment.id);
  assert.ok(result, "debe confirmar el pago y crear el LeadPurchase");

  const exchange = await prisma.contactExchange.findUniqueOrThrow({
    where: { leadPurchaseId: result!.id },
  });
  const expected = computeContactProtectionDeadline(before, protectionHours);
  const diffMs = Math.abs(exchange.protectedUntil!.getTime() - expected.getTime());
  assert.ok(diffMs < 5000, `protectedUntil debe ser ~revealedAt + ${protectionHours}h`);
});

// =====================================================================
// Etapa 2: protección bilateral de contactos y devoluciones (historial)
// =====================================================================

const NOTICE_V1 = "v1";

async function makeAgentWithWhatsapp(credits: number) {
  const agent = await makeAgent(credits);
  await prisma.agentProfile.update({
    where: { id: agent.profile.id },
    data: { whatsapp: "0998887777" },
  });
  return agent;
}

async function setupPurchasedLead(agentCredits = 100) {
  const agent = await makeAgentWithWhatsapp(agentCredits);
  const buyerReq = await makeBuyerRequest("COMPRAR");
  createdRequestIds.push(buyerReq.request.id);
  const purchase = await purchaseWithCredits({
    agentUserId: agent.user.id,
    agentProfileId: agent.profile.id,
    requestId: buyerReq.request.id,
  });
  return { agent, buyerReq, purchase };
}

async function markContactedLongAgo(leadPurchaseId: string) {
  await prisma.leadPurchase.update({
    where: { id: leadPurchaseId },
    data: { status: "CONTACTED", contactedAt: new Date(Date.now() - 100 * 60 * 60 * 1000) },
  });
}

// ---------- Camino A: revealOwnContact ----------

test("revealOwnContact: el agente revela su teléfono, queda registrado y fija externalContactRevealedAt", async () => {
  const { agent, purchase } = await setupPurchasedLead();
  await revealOwnContact({
    agentProfileId: agent.profile.id,
    agentUserId: agent.user.id,
    leadPurchaseId: purchase.id,
    methods: ["PHONE"],
    noticeVersion: NOTICE_V1,
  });
  const methods = await getRevealedContactMethods(purchase.id, "AGENT_TO_BUYER");
  assert.deepEqual(methods, ["PHONE"]);
  const lp = await prisma.leadPurchase.findUniqueOrThrow({ where: { id: purchase.id } });
  assert.ok(lp.externalContactRevealedAt, "debe quedar fijado tras el primer reveal");
});

test("revealOwnContact: protección bilateral — no revela el contacto del comprador", async () => {
  const { agent, purchase } = await setupPurchasedLead();
  await revealOwnContact({
    agentProfileId: agent.profile.id,
    agentUserId: agent.user.id,
    leadPurchaseId: purchase.id,
    methods: ["PHONE", "WHATSAPP"],
    noticeVersion: NOTICE_V1,
  });
  const buyerSide = await getRevealedContactMethods(purchase.id, "BUYER_TO_AGENT");
  assert.deepEqual(buyerSide, [], "el camino A nunca debe revelar el contacto del comprador");
});

test("revealOwnContact: rechaza revelar un método que el agente no tiene registrado", async () => {
  const agent = await makeAgent(100); // sin whatsapp
  const buyerReq = await makeBuyerRequest("COMPRAR");
  createdRequestIds.push(buyerReq.request.id);
  const purchase = await purchaseWithCredits({
    agentUserId: agent.user.id,
    agentProfileId: agent.profile.id,
    requestId: buyerReq.request.id,
  });
  await assert.rejects(
    revealOwnContact({
      agentProfileId: agent.profile.id,
      agentUserId: agent.user.id,
      leadPurchaseId: purchase.id,
      methods: ["WHATSAPP"],
      noticeVersion: NOTICE_V1,
    }),
    PurchaseError,
  );
});

test("revealOwnContact: bloqueado mientras hay una devolución pendiente", async () => {
  const { agent, purchase } = await setupPurchasedLead();
  await requestRefund({
    agentProfileId: agent.profile.id,
    agentUserId: agent.user.id,
    leadPurchaseId: purchase.id,
    category: "LEAD_QUALITY",
    reason: "Número incorrecto",
  });
  await assert.rejects(
    revealOwnContact({
      agentProfileId: agent.profile.id,
      agentUserId: agent.user.id,
      leadPurchaseId: purchase.id,
      methods: ["PHONE"],
      noticeVersion: NOTICE_V1,
    }),
    PurchaseError,
  );
});

test("revealOwnContact: un agente no puede revelar contacto de un lead que no le pertenece", async () => {
  const { purchase } = await setupPurchasedLead();
  const otherAgent = await makeAgent(50);
  await assert.rejects(
    revealOwnContact({
      agentProfileId: otherAgent.profile.id,
      agentUserId: otherAgent.user.id,
      leadPurchaseId: purchase.id,
      methods: ["PHONE"],
      noticeVersion: NOTICE_V1,
    }),
    PurchaseError,
  );
});

test("revealOwnContact: doble revelación simultánea del mismo método no duplica la fila", async () => {
  const { agent, purchase } = await setupPurchasedLead();
  const call = () =>
    revealOwnContact({
      agentProfileId: agent.profile.id,
      agentUserId: agent.user.id,
      leadPurchaseId: purchase.id,
      methods: ["PHONE"],
      noticeVersion: NOTICE_V1,
    });
  await Promise.all([call(), call()]);
  const count = await prisma.contactRevealEvent.count({
    where: { leadPurchaseId: purchase.id, direction: "AGENT_TO_BUYER", method: "PHONE" },
  });
  assert.equal(count, 1);
});

// ---------- Camino B: requestContactRelease / approve / reject / cancel ----------

test("Camino B completo: solicitar y aprobar revela ambas direcciones", async () => {
  const { agent, buyerReq, purchase } = await setupPurchasedLead();
  const request = await requestContactRelease({
    buyerProfileId: buyerReq.buyerProfile.id,
    buyerUserId: buyerReq.user.id,
    leadPurchaseId: purchase.id,
    noticeVersion: NOTICE_V1,
  });
  await approveContactReleaseRequest({
    agentProfileId: agent.profile.id,
    agentUserId: agent.user.id,
    contactReleaseRequestId: request.id,
    methods: ["PHONE", "WHATSAPP"],
    approvalNoticeVersion: NOTICE_V1,
  });

  const agentSide = await getRevealedContactMethods(purchase.id, "AGENT_TO_BUYER");
  const buyerSide = await getRevealedContactMethods(purchase.id, "BUYER_TO_AGENT");
  assert.deepEqual(new Set(agentSide), new Set(["PHONE", "WHATSAPP"]));
  assert.ok(buyerSide.includes("PHONE"), "el comprador siempre revela su teléfono al aprobar");
  const lp = await prisma.leadPurchase.findUniqueOrThrow({ where: { id: purchase.id } });
  assert.ok(lp.externalContactRevealedAt);

  const updated = await prisma.contactReleaseRequest.findUniqueOrThrow({ where: { id: request.id } });
  assert.equal(updated.status, "APPROVED");
  assert.equal(updated.approvalNoticeVersion, NOTICE_V1);
});

test("requestContactRelease: máximo una solicitud pendiente por compra", async () => {
  const { buyerReq, purchase } = await setupPurchasedLead();
  await requestContactRelease({
    buyerProfileId: buyerReq.buyerProfile.id,
    buyerUserId: buyerReq.user.id,
    leadPurchaseId: purchase.id,
    noticeVersion: NOTICE_V1,
  });
  await assert.rejects(
    requestContactRelease({
      buyerProfileId: buyerReq.buyerProfile.id,
      buyerUserId: buyerReq.user.id,
      leadPurchaseId: purchase.id,
      noticeVersion: NOTICE_V1,
    }),
    PurchaseError,
  );
});

test("rejectContactReleaseRequest: rechazar no revela nada ni afecta la elegibilidad de devolución", async () => {
  const { agent, buyerReq, purchase } = await setupPurchasedLead();
  const request = await requestContactRelease({
    buyerProfileId: buyerReq.buyerProfile.id,
    buyerUserId: buyerReq.user.id,
    leadPurchaseId: purchase.id,
    noticeVersion: NOTICE_V1,
  });
  await rejectContactReleaseRequest({
    agentProfileId: agent.profile.id,
    agentUserId: agent.user.id,
    contactReleaseRequestId: request.id,
  });
  const agentSide = await getRevealedContactMethods(purchase.id, "AGENT_TO_BUYER");
  const buyerSide = await getRevealedContactMethods(purchase.id, "BUYER_TO_AGENT");
  assert.deepEqual(agentSide, []);
  assert.deepEqual(buyerSide, []);
  const lp = await prisma.leadPurchase.findUniqueOrThrow({ where: { id: purchase.id } });
  assert.equal(lp.externalContactRevealedAt, null);
});

test("cancelContactReleaseRequest: el comprador puede cancelar mientras está pendiente", async () => {
  const { buyerReq, purchase } = await setupPurchasedLead();
  const request = await requestContactRelease({
    buyerProfileId: buyerReq.buyerProfile.id,
    buyerUserId: buyerReq.user.id,
    leadPurchaseId: purchase.id,
    noticeVersion: NOTICE_V1,
  });
  await cancelContactReleaseRequest({
    buyerProfileId: buyerReq.buyerProfile.id,
    buyerUserId: buyerReq.user.id,
    contactReleaseRequestId: request.id,
  });
  const updated = await prisma.contactReleaseRequest.findUniqueOrThrow({ where: { id: request.id } });
  assert.equal(updated.status, "CANCELLED");
});

test("cancelContactReleaseRequest: otro comprador no puede cancelar una solicitud ajena", async () => {
  const { buyerReq, purchase } = await setupPurchasedLead();
  const request = await requestContactRelease({
    buyerProfileId: buyerReq.buyerProfile.id,
    buyerUserId: buyerReq.user.id,
    leadPurchaseId: purchase.id,
    noticeVersion: NOTICE_V1,
  });
  const otherBuyer = await makeBuyerRequest("COMPRAR");
  createdRequestIds.push(otherBuyer.request.id);
  await assert.rejects(
    cancelContactReleaseRequest({
      buyerProfileId: otherBuyer.buyerProfile.id,
      buyerUserId: otherBuyer.user.id,
      contactReleaseRequestId: request.id,
    }),
    PurchaseError,
  );
});

test("approveContactReleaseRequest: otro agente no puede aprobar una solicitud que no es suya", async () => {
  const { buyerReq, purchase } = await setupPurchasedLead();
  const request = await requestContactRelease({
    buyerProfileId: buyerReq.buyerProfile.id,
    buyerUserId: buyerReq.user.id,
    leadPurchaseId: purchase.id,
    noticeVersion: NOTICE_V1,
  });
  const otherAgent = await makeAgentWithWhatsapp(50);
  await assert.rejects(
    approveContactReleaseRequest({
      agentProfileId: otherAgent.profile.id,
      agentUserId: otherAgent.user.id,
      contactReleaseRequestId: request.id,
      methods: ["PHONE"],
      approvalNoticeVersion: NOTICE_V1,
    }),
    PurchaseError,
  );
});

test("approveContactReleaseRequest: bloqueado mientras hay una devolución pendiente", async () => {
  const { agent, buyerReq, purchase } = await setupPurchasedLead();
  const request = await requestContactRelease({
    buyerProfileId: buyerReq.buyerProfile.id,
    buyerUserId: buyerReq.user.id,
    leadPurchaseId: purchase.id,
    noticeVersion: NOTICE_V1,
  });
  await requestRefund({
    agentProfileId: agent.profile.id,
    agentUserId: agent.user.id,
    leadPurchaseId: purchase.id,
    category: "LEAD_QUALITY",
    reason: "Lead duplicado",
  });
  await assert.rejects(
    approveContactReleaseRequest({
      agentProfileId: agent.profile.id,
      agentUserId: agent.user.id,
      contactReleaseRequestId: request.id,
      methods: ["PHONE"],
      approvalNoticeVersion: NOTICE_V1,
    }),
    PurchaseError,
  );
});

// ---------- Concurrencia real contra Postgres ----------

test("concurrencia: dos requestContactRelease simultáneas — solo una queda PENDING", async () => {
  const { buyerReq, purchase } = await setupPurchasedLead();
  const call = () =>
    requestContactRelease({
      buyerProfileId: buyerReq.buyerProfile.id,
      buyerUserId: buyerReq.user.id,
      leadPurchaseId: purchase.id,
      noticeVersion: NOTICE_V1,
    });
  const results = await Promise.allSettled([call(), call()]);
  const fulfilled = results.filter((r) => r.status === "fulfilled");
  const rejected = results.filter((r) => r.status === "rejected");
  assert.equal(fulfilled.length, 1, "exactamente una debe crear la solicitud");
  assert.equal(rejected.length, 1, "la otra debe fallar limpio, nunca duplicar");
  const pendingCount = await prisma.contactReleaseRequest.count({
    where: { leadPurchaseId: purchase.id, status: "PENDING" },
  });
  assert.equal(pendingCount, 1);
});

test("concurrencia: revealOwnContact y requestRefund(LEAD_QUALITY) simultáneos nunca dejan un estado inconsistente", async () => {
  const { agent, purchase } = await setupPurchasedLead();
  const reveal = () =>
    revealOwnContact({
      agentProfileId: agent.profile.id,
      agentUserId: agent.user.id,
      leadPurchaseId: purchase.id,
      methods: ["PHONE"],
      noticeVersion: NOTICE_V1,
    });
  const refund = () =>
    requestRefund({
      agentProfileId: agent.profile.id,
      agentUserId: agent.user.id,
      leadPurchaseId: purchase.id,
      category: "LEAD_QUALITY",
      reason: "Lead duplicado",
    });
  const results = await Promise.allSettled([reveal(), refund()]);
  const fulfilled = results.filter((r) => r.status === "fulfilled");
  assert.equal(fulfilled.length, 1, "exactamente una de las dos debe ganar la carrera");

  // Invariante de negocio: si existe una RefundRequest LEAD_QUALITY para
  // este lead, el contacto no puede estar revelado, y viceversa.
  const lp = await prisma.leadPurchase.findUniqueOrThrow({ where: { id: purchase.id } });
  const refundRow = await prisma.refundRequest.findFirst({ where: { leadPurchaseId: purchase.id } });
  if (refundRow) {
    assert.equal(lp.externalContactRevealedAt, null, "no puede haber RefundRequest LEAD_QUALITY con contacto ya revelado");
  } else {
    assert.ok(lp.externalContactRevealedAt, "si no se creó la RefundRequest, el reveal debe haber ganado");
  }
});

// ---------- Matriz de elegibilidad de devoluciones ----------

test("isEligibleForRefundCategory: matriz completa antes/después de revelar", () => {
  const base = { status: "CONTACTED" as const, contactedAt: new Date(Date.now() - 100 * 3600 * 1000) };
  const notRevealed = { ...base, externalContactRevealedAt: null };
  const revealed = { ...base, externalContactRevealedAt: new Date() };

  assert.equal(isEligibleForRefundCategory("NO_RESPONSE", notRevealed, 48), true);
  assert.equal(isEligibleForRefundCategory("LEAD_QUALITY", notRevealed, 48), true);
  assert.equal(isEligibleForRefundCategory("PLATFORM_ERROR", notRevealed, 48), true);

  assert.equal(isEligibleForRefundCategory("NO_RESPONSE", revealed, 48), false);
  assert.equal(isEligibleForRefundCategory("LEAD_QUALITY", revealed, 48), false);
  assert.equal(isEligibleForRefundCategory("PLATFORM_ERROR", revealed, 48), true);
});

test("requestRefund de punta a punta: NO_RESPONSE y LEAD_QUALITY bloqueadas tras revelar, PLATFORM_ERROR sigue elegible", async () => {
  const leadA = await setupPurchasedLead();
  const leadB = await setupPurchasedLead();
  const leadC = await setupPurchasedLead();
  await markContactedLongAgo(leadA.purchase.id);

  for (const { agent, purchase } of [leadA, leadB, leadC]) {
    await revealOwnContact({
      agentProfileId: agent.profile.id,
      agentUserId: agent.user.id,
      leadPurchaseId: purchase.id,
      methods: ["PHONE"],
      noticeVersion: NOTICE_V1,
    });
  }

  await assert.rejects(
    requestRefund({
      agentProfileId: leadA.agent.profile.id,
      agentUserId: leadA.agent.user.id,
      leadPurchaseId: leadA.purchase.id,
      category: "NO_RESPONSE",
      reason: "No respondió",
    }),
    PurchaseError,
  );
  await assert.rejects(
    requestRefund({
      agentProfileId: leadB.agent.profile.id,
      agentUserId: leadB.agent.user.id,
      leadPurchaseId: leadB.purchase.id,
      category: "LEAD_QUALITY",
      reason: "Lead duplicado",
    }),
    PurchaseError,
  );
  const created = await requestRefund({
    agentProfileId: leadC.agent.profile.id,
    agentUserId: leadC.agent.user.id,
    leadPurchaseId: leadC.purchase.id,
    category: "PLATFORM_ERROR",
    reason: "Cobro duplicado por un error de la plataforma",
  });
  assert.equal(created.category, "PLATFORM_ERROR");
  assert.equal(created.status, "PENDING");
});

// ---------- Validación de la reclamación: categoría/motivo/evidencia (Etapa 2.1) ----------

test("requestRefundSchema: acepta las tres categorías con un motivo válido", () => {
  for (const category of ["NO_RESPONSE", "LEAD_QUALITY", "PLATFORM_ERROR"] as const) {
    const parsed = requestRefundSchema.safeParse({ category, reason: "El usuario no respondió" });
    assert.equal(parsed.success, true, `categoría ${category} debe ser válida`);
  }
});

test("requestRefundSchema: rechaza sin categoría (no preselecciona ninguna) y con categoría inválida", () => {
  assert.equal(requestRefundSchema.safeParse({ reason: "Motivo" }).success, false);
  assert.equal(
    requestRefundSchema.safeParse({ category: "", reason: "Motivo" }).success,
    false,
  );
  assert.equal(
    requestRefundSchema.safeParse({ category: "INVENTADA", reason: "Motivo" }).success,
    false,
  );
});

test("requestRefundSchema/requestRefund: rechazan un motivo vacío, solo espacios, o demasiado largo", async () => {
  assert.equal(
    requestRefundSchema.safeParse({ category: "LEAD_QUALITY", reason: "" }).success,
    false,
  );
  assert.equal(
    requestRefundSchema.safeParse({ category: "LEAD_QUALITY", reason: "   " }).success,
    false,
  );
  assert.equal(
    requestRefundSchema.safeParse({ category: "LEAD_QUALITY", reason: "a".repeat(1001) }).success,
    false,
  );

  const { agent, purchase } = await setupPurchasedLead();
  await assert.rejects(
    requestRefund({
      agentProfileId: agent.profile.id,
      agentUserId: agent.user.id,
      leadPurchaseId: purchase.id,
      category: "LEAD_QUALITY",
      reason: "   ",
    }),
    PurchaseError,
  );
  const count = await prisma.refundRequest.count({ where: { leadPurchaseId: purchase.id } });
  assert.equal(count, 0, "un motivo inválido no debe crear ninguna RefundRequest");
});

test("requestRefund: evidencia es opcional y se guarda como texto libre cuando se provee", async () => {
  const { agent, purchase } = await setupPurchasedLead();
  const created = await requestRefund({
    agentProfileId: agent.profile.id,
    agentUserId: agent.user.id,
    leadPurchaseId: purchase.id,
    category: "LEAD_QUALITY",
    reason: "Lead duplicado",
    evidence: "Captura de pantalla adjunta en el ticket #123",
  });
  assert.equal(created.evidence, "Captura de pantalla adjunta en el ticket #123");

  const { agent: agent2, purchase: purchase2 } = await setupPurchasedLead();
  const createdSinEvidencia = await requestRefund({
    agentProfileId: agent2.profile.id,
    agentUserId: agent2.user.id,
    leadPurchaseId: purchase2.id,
    category: "LEAD_QUALITY",
    reason: "Lead duplicado",
  });
  assert.equal(createdSinEvidencia.evidence, null);
});

test("requestRefund: categoría no elegible (NO_RESPONSE sobre un lead que no está CONTACTED) rechazada por el servidor", async () => {
  const { agent, purchase } = await setupPurchasedLead(); // status PURCHASED, nunca contactado
  await assert.rejects(
    requestRefund({
      agentProfileId: agent.profile.id,
      agentUserId: agent.user.id,
      leadPurchaseId: purchase.id,
      category: "NO_RESPONSE",
      reason: "No respondió",
    }),
    PurchaseError,
  );
  const count = await prisma.refundRequest.count({ where: { leadPurchaseId: purchase.id } });
  assert.equal(count, 0, "una categoría no elegible nunca debe crear la RefundRequest");
});

test("decisionReasonSchema: rechaza vacío/solo espacios y demasiado largo, acepta un texto normal", () => {
  assert.equal(decisionReasonSchema.safeParse("").success, false);
  assert.equal(decisionReasonSchema.safeParse("   ").success, false);
  assert.equal(decisionReasonSchema.safeParse("a".repeat(1001)).success, false);
  assert.equal(decisionReasonSchema.safeParse("Verificado con el usuario").success, true);
});

// ---------- Atomicidad: historial y auditoría dentro de la transacción (Etapa 2.1) ----------

test("recordStatusChange y logAudit con tx: un error posterior dentro de la misma transacción revierte también el cambio de negocio", async () => {
  const { purchase } = await setupPurchasedLead();
  await markContactedLongAgo(purchase.id);

  const historyCountBefore = await prisma.leadStatusHistory.count({
    where: { leadPurchaseId: purchase.id },
  });
  const auditCountBefore = await prisma.auditLog.count({ where: { entityId: purchase.id } });

  await assert.rejects(
    prisma.$transaction(async (tx) => {
      // Mismo orden que requestRefund/approveRefund/rejectRefund: el
      // cambio de negocio primero, historial y auditoría DENTRO de la
      // misma tx usando `tx` — y acá, deliberadamente, un error después de
      // los tres, antes de que la transacción pueda confirmar.
      await tx.leadPurchase.update({
        where: { id: purchase.id },
        data: { status: "REFUND_REQUESTED", refundRequestedAt: new Date() },
      });
      await recordStatusChange(
        purchase.requestId,
        "CONTACTED",
        "REFUND_REQUESTED",
        { leadPurchaseId: purchase.id },
        tx,
      );
      await logAudit(
        { action: "TEST_FORCED_ROLLBACK", entityType: "LeadPurchase", entityId: purchase.id },
        tx,
      );
      throw new Error("fallo forzado después de negocio+historial+auditoría, antes del commit");
    }),
    /fallo forzado/,
  );

  const lp = await prisma.leadPurchase.findUniqueOrThrow({ where: { id: purchase.id } });
  assert.equal(lp.status, "CONTACTED", "el cambio de estado de negocio debe revertirse");
  const historyCountAfter = await prisma.leadStatusHistory.count({
    where: { leadPurchaseId: purchase.id },
  });
  const auditCountAfter = await prisma.auditLog.count({ where: { entityId: purchase.id } });
  assert.equal(historyCountAfter, historyCountBefore, "el historial debe revertirse junto con el resto");
  assert.equal(auditCountAfter, auditCountBefore, "la auditoría debe revertirse junto con el resto");
});

test("approveRefund: historial y auditoría quedan escritos de forma atómica con el crédito al confirmar", async () => {
  const { agent, purchase } = await setupPurchasedLead(30);
  await markContactedLongAgo(purchase.id);
  const admin = await prisma.user.create({
    data: {
      email: `test-admin-${RUN_ID}-${createdUserIds.length}@test.local`,
      passwordHash: await hashPassword("test12345"),
      name: "Admin de prueba",
      role: "ADMIN",
    },
  });
  createdUserIds.push(admin.id);
  const request = await requestRefund({
    agentProfileId: agent.profile.id,
    agentUserId: agent.user.id,
    leadPurchaseId: purchase.id,
    category: "NO_RESPONSE",
    reason: "No respondió",
  });

  await approveRefund({
    adminUserId: admin.id,
    refundRequestId: request.id,
    decisionReason: "Confirmado con el comprador",
  });

  const history = await prisma.leadStatusHistory.findMany({
    where: { leadPurchaseId: purchase.id, toStatus: "REFUNDED" },
  });
  assert.equal(history.length, 1, "debe quedar exactamente un registro de historial para REFUNDED");
  const audit = await prisma.auditLog.findMany({
    where: { entityType: "RefundRequest", entityId: request.id, action: "REFUND_APPROVED" },
  });
  assert.equal(audit.length, 1, "debe quedar exactamente una entrada de auditoría para la aprobación");
  const metadata = audit[0]!.metadata as { decisionReason?: string } | null;
  assert.equal(metadata?.decisionReason, "Confirmado con el comprador");
});

// ---------- Aprobación / rechazo de devoluciones ----------

test("approveRefund cambia el estado a REFUNDED y acredita el crédito", async () => {
  const { agent, purchase } = await setupPurchasedLead(30);
  await markContactedLongAgo(purchase.id);
  const admin = await prisma.user.create({
    data: {
      email: `test-admin-${RUN_ID}-${createdUserIds.length}@test.local`,
      passwordHash: await hashPassword("test12345"),
      name: "Admin de prueba",
      role: "ADMIN",
    },
  });
  createdUserIds.push(admin.id);

  const request = await requestRefund({
    agentProfileId: agent.profile.id,
    agentUserId: agent.user.id,
    leadPurchaseId: purchase.id,
    category: "NO_RESPONSE",
    reason: "No respondió",
  });
  const balanceBefore = (await prisma.agentProfile.findUniqueOrThrow({ where: { id: agent.profile.id } }))
    .creditsBalance;

  await approveRefund({ adminUserId: admin.id, refundRequestId: request.id, decisionReason: "Verificado" });

  const lp = await prisma.leadPurchase.findUniqueOrThrow({ where: { id: purchase.id } });
  assert.equal(lp.status, "REFUNDED");
  const balanceAfter = (await prisma.agentProfile.findUniqueOrThrow({ where: { id: agent.profile.id } }))
    .creditsBalance;
  assert.equal(balanceAfter, balanceBefore + purchase.creditsUsed);
  const updatedRequest = await prisma.refundRequest.findUniqueOrThrow({ where: { id: request.id } });
  assert.equal(updatedRequest.status, "APPROVED");
  assert.equal(updatedRequest.decisionReason, "Verificado");
});

test("rejectRefund restaura leadPurchaseStatusBefore (no CLOSED) y permite una nueva solicitud después", async () => {
  const { agent, purchase } = await setupPurchasedLead();
  await markContactedLongAgo(purchase.id);
  const admin = await prisma.user.create({
    data: {
      email: `test-admin-${RUN_ID}-${createdUserIds.length}@test.local`,
      passwordHash: await hashPassword("test12345"),
      name: "Admin de prueba",
      role: "ADMIN",
    },
  });
  createdUserIds.push(admin.id);

  const request1 = await requestRefund({
    agentProfileId: agent.profile.id,
    agentUserId: agent.user.id,
    leadPurchaseId: purchase.id,
    category: "NO_RESPONSE",
    reason: "No respondió",
  });
  await rejectRefund({ adminUserId: admin.id, refundRequestId: request1.id, decisionReason: "Insuficiente" });

  const lp = await prisma.leadPurchase.findUniqueOrThrow({ where: { id: purchase.id } });
  assert.equal(lp.status, "CONTACTED", "debe volver al estado previo, no a CLOSED");

  const request2 = await requestRefund({
    agentProfileId: agent.profile.id,
    agentUserId: agent.user.id,
    leadPurchaseId: purchase.id,
    category: "NO_RESPONSE",
    reason: "Nuevo intento, sigue sin responder",
  });
  assert.notEqual(request2.id, request1.id);

  const allRequests = await prisma.refundRequest.findMany({ where: { leadPurchaseId: purchase.id } });
  assert.equal(allRequests.length, 2, "ambos intentos deben conservarse, nunca sobrescribirse");
  const stillThere = await prisma.refundRequest.findUniqueOrThrow({ where: { id: request1.id } });
  assert.equal(stillThere.status, "REJECTED", "la decisión anterior no debe alterarse");
});

test("approveRefund/rejectRefund: no se puede procesar la misma solicitud dos veces, ni modificar su decisionReason ya fijado", async () => {
  const { agent, purchase } = await setupPurchasedLead();
  await markContactedLongAgo(purchase.id);
  const admin = await prisma.user.create({
    data: {
      email: `test-admin-${RUN_ID}-${createdUserIds.length}@test.local`,
      passwordHash: await hashPassword("test12345"),
      name: "Admin de prueba",
      role: "ADMIN",
    },
  });
  createdUserIds.push(admin.id);
  const request = await requestRefund({
    agentProfileId: agent.profile.id,
    agentUserId: agent.user.id,
    leadPurchaseId: purchase.id,
    category: "NO_RESPONSE",
    reason: "No respondió",
  });
  await approveRefund({
    adminUserId: admin.id,
    refundRequestId: request.id,
    decisionReason: "Verificado, el usuario confirmó que nunca lo contactaron",
  });
  await assert.rejects(
    approveRefund({
      adminUserId: admin.id,
      refundRequestId: request.id,
      decisionReason: "Segundo intento de aprobar",
    }),
    PurchaseError,
  );
  await assert.rejects(
    rejectRefund({
      adminUserId: admin.id,
      refundRequestId: request.id,
      decisionReason: "Intento de rechazar algo ya aprobado",
    }),
    PurchaseError,
  );
  // La decisión y su motivo quedan exactamente como los fijó la primera
  // decisión — ninguna de las dos llamadas posteriores los tocó.
  const stillDecided = await prisma.refundRequest.findUniqueOrThrow({ where: { id: request.id } });
  assert.equal(stillDecided.status, "APPROVED");
  assert.equal(
    stillDecided.decisionReason,
    "Verificado, el usuario confirmó que nunca lo contactaron",
  );
});

// ---------- decisionReason obligatorio (Etapa 2.1) ----------

test("approveRefund rechaza decisionReason vacío o compuesto solo de espacios", async () => {
  const { agent, purchase } = await setupPurchasedLead();
  await markContactedLongAgo(purchase.id);
  const admin = await prisma.user.create({
    data: {
      email: `test-admin-${RUN_ID}-${createdUserIds.length}@test.local`,
      passwordHash: await hashPassword("test12345"),
      name: "Admin de prueba",
      role: "ADMIN",
    },
  });
  createdUserIds.push(admin.id);
  const request = await requestRefund({
    agentProfileId: agent.profile.id,
    agentUserId: agent.user.id,
    leadPurchaseId: purchase.id,
    category: "NO_RESPONSE",
    reason: "No respondió",
  });
  await assert.rejects(
    approveRefund({ adminUserId: admin.id, refundRequestId: request.id, decisionReason: "" }),
    PurchaseError,
  );
  await assert.rejects(
    approveRefund({ adminUserId: admin.id, refundRequestId: request.id, decisionReason: "   " }),
    PurchaseError,
  );
  // Sigue PENDING: el rechazo de la validación no debe haber alterado nada.
  const stillPending = await prisma.refundRequest.findUniqueOrThrow({ where: { id: request.id } });
  assert.equal(stillPending.status, "PENDING");
  assert.equal(stillPending.decisionReason, null);
});

test("rejectRefund rechaza decisionReason vacío o compuesto solo de espacios", async () => {
  const { agent, purchase } = await setupPurchasedLead();
  await requestRefund({
    agentProfileId: agent.profile.id,
    agentUserId: agent.user.id,
    leadPurchaseId: purchase.id,
    category: "LEAD_QUALITY",
    reason: "Lead duplicado",
  });
  const request = await prisma.refundRequest.findFirstOrThrow({
    where: { leadPurchaseId: purchase.id, status: "PENDING" },
  });
  const admin = await prisma.user.create({
    data: {
      email: `test-admin-${RUN_ID}-${createdUserIds.length}@test.local`,
      passwordHash: await hashPassword("test12345"),
      name: "Admin de prueba",
      role: "ADMIN",
    },
  });
  createdUserIds.push(admin.id);
  await assert.rejects(
    rejectRefund({ adminUserId: admin.id, refundRequestId: request.id, decisionReason: "   " }),
    PurchaseError,
  );
  const stillPending = await prisma.refundRequest.findUniqueOrThrow({ where: { id: request.id } });
  assert.equal(stillPending.status, "PENDING");
});

test("concurrencia: dos requestRefund simultáneas para la misma compra — solo una queda PENDING", async () => {
  const { agent, purchase } = await setupPurchasedLead();
  await markContactedLongAgo(purchase.id);
  const call = () =>
    requestRefund({
      agentProfileId: agent.profile.id,
      agentUserId: agent.user.id,
      leadPurchaseId: purchase.id,
      category: "NO_RESPONSE",
      reason: "No respondió",
    });
  const results = await Promise.allSettled([call(), call()]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.filter((r) => r.status === "rejected").length, 1);
  const pendingCount = await prisma.refundRequest.count({
    where: { leadPurchaseId: purchase.id, status: "PENDING" },
  });
  assert.equal(pendingCount, 1);
});

test("concurrencia: approveRefund y rejectRefund simultáneos sobre la misma solicitud — solo uno surte efecto", async () => {
  const { agent, purchase } = await setupPurchasedLead();
  await markContactedLongAgo(purchase.id);
  const admin = await prisma.user.create({
    data: {
      email: `test-admin-${RUN_ID}-${createdUserIds.length}@test.local`,
      passwordHash: await hashPassword("test12345"),
      name: "Admin de prueba",
      role: "ADMIN",
    },
  });
  createdUserIds.push(admin.id);
  const request = await requestRefund({
    agentProfileId: agent.profile.id,
    agentUserId: agent.user.id,
    leadPurchaseId: purchase.id,
    category: "NO_RESPONSE",
    reason: "No respondió",
  });
  const startedAt = Date.now();
  const results = await Promise.allSettled([
    approveRefund({ adminUserId: admin.id, refundRequestId: request.id, decisionReason: "Aprobando" }),
    rejectRefund({ adminUserId: admin.id, refundRequestId: request.id, decisionReason: "Rechazando" }),
  ]);
  const elapsedMs = Date.now() - startedAt;
  // Guarda de regresión: el autobloqueo encontrado en la Etapa 2 (llamar
  // recordStatusChange/logAudit con el cliente prisma global mientras tx
  // sostenía el FOR UPDATE) solo se resolvía vía el timeout de 5000ms de
  // Prisma. Ahora que ambas aceptan `tx` y corren dentro de la misma
  // transacción, esta carrera debe resolverse en milisegundos reales de
  // Postgres, nunca cerca de ese timeout.
  assert.ok(
    elapsedMs < 3000,
    `no debe reaparecer el autobloqueo de la Etapa 2 (tardó ${elapsedMs}ms)`,
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const updated = await prisma.refundRequest.findUniqueOrThrow({ where: { id: request.id } });
  assert.ok(updated.status === "APPROVED" || updated.status === "REJECTED");
  const lp = await prisma.leadPurchase.findUniqueOrThrow({ where: { id: purchase.id } });
  assert.equal(lp.status, updated.status === "APPROVED" ? "REFUNDED" : "CONTACTED");
});

// ---------- Interacciones con las 5 funciones legacy ----------

test("releaseLead falla mientras hay una devolución pendiente", async () => {
  const { agent, purchase } = await setupPurchasedLead();
  await requestRefund({
    agentProfileId: agent.profile.id,
    agentUserId: agent.user.id,
    leadPurchaseId: purchase.id,
    category: "LEAD_QUALITY",
    reason: "Lead duplicado",
  });
  await assert.rejects(
    releaseLead(agent.profile.id, purchase.id, "Otro"),
    PurchaseError,
  );
});

test("markAgentContacted falla sobre un lead ya REFUNDED (guarda nueva, antes no existía)", async () => {
  const { agent, purchase } = await setupPurchasedLead();
  await markContactedLongAgo(purchase.id);
  const admin = await prisma.user.create({
    data: {
      email: `test-admin-${RUN_ID}-${createdUserIds.length}@test.local`,
      passwordHash: await hashPassword("test12345"),
      name: "Admin de prueba",
      role: "ADMIN",
    },
  });
  createdUserIds.push(admin.id);
  const request = await requestRefund({
    agentProfileId: agent.profile.id,
    agentUserId: agent.user.id,
    leadPurchaseId: purchase.id,
    category: "NO_RESPONSE",
    reason: "No respondió",
  });
  await approveRefund({
    adminUserId: admin.id,
    refundRequestId: request.id,
    decisionReason: "Verificado",
  });

  await assert.rejects(
    markAgentContacted(agent.profile.id, purchase.id),
    PurchaseError,
  );
});

test("markBuyerOutcome: un comprador no puede actuar sobre la solicitud de otro", async () => {
  const { buyerReq, purchase } = await setupPurchasedLead();
  const otherBuyer = await makeBuyerRequest("COMPRAR");
  createdRequestIds.push(otherBuyer.request.id);
  await assert.rejects(
    markBuyerOutcome(otherBuyer.buyerProfile.id, purchase.id, "NO_CONTACT"),
    PurchaseError,
  );
  // El dueño real sigue pudiendo.
  await markBuyerOutcome(buyerReq.buyerProfile.id, purchase.id, "NO_CONTACT");
  const lp = await prisma.leadPurchase.findUniqueOrThrow({ where: { id: purchase.id } });
  assert.equal(lp.status, "NO_CONTACT");
});

test("reactivateLeadPurchase: sigue exigiendo NO_CONTACT/NO_MATCH, ahora de forma atómica", async () => {
  const { purchase } = await setupPurchasedLead(); // status PURCHASED, no elegible
  await assert.rejects(
    reactivateLeadPurchase("admin-test-id", purchase.id),
    PurchaseError,
  );
});

test("markAppointmentScheduled falla mientras hay una devolución pendiente", async () => {
  const { agent, purchase } = await setupPurchasedLead();
  await requestRefund({
    agentProfileId: agent.profile.id,
    agentUserId: agent.user.id,
    leadPurchaseId: purchase.id,
    category: "LEAD_QUALITY",
    reason: "Lead duplicado",
  });
  await assert.rejects(
    markAppointmentScheduled(agent.profile.id, purchase.id),
    PurchaseError,
  );
});

// ---------- Autorización adicional ----------

test("requestRefund: un agente no puede pedir devolución de un lead que no le pertenece", async () => {
  const { purchase } = await setupPurchasedLead();
  const otherAgent = await makeAgent(50);
  await assert.rejects(
    requestRefund({
      agentProfileId: otherAgent.profile.id,
      agentUserId: otherAgent.user.id,
      leadPurchaseId: purchase.id,
      category: "LEAD_QUALITY",
      reason: "Lead duplicado",
    }),
    PurchaseError,
  );
});
