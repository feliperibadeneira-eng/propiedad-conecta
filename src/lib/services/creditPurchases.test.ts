// Tests de las reglas críticas de compra de créditos con pago manual
// (sección 11). Mismo enfoque que purchase.test.ts: corren contra la base
// de datos real de desarrollo, sin mocks, con datos propios que se
// limpian al final.
import "dotenv/config";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../db";
import { hashPassword } from "../password";
import {
  createCreditPurchaseRequest,
  listCreditPurchasesForAgent,
  approveCreditPurchase,
  rejectCreditPurchase,
} from "./creditPurchases";
import { CREDIT_PACKAGES } from "./creditPackages";
import { PurchaseError } from "./purchase";

const RUN_ID = Date.now().toString(36);
const createdUserIds: string[] = [];

async function makeAgent() {
  const user = await prisma.user.create({
    data: {
      email: `test-cp-agent-${RUN_ID}-${createdUserIds.length}@test.local`,
      passwordHash: await hashPassword("test12345"),
      name: "Agente de prueba",
      phone: "0990000000",
      role: "AGENT",
    },
  });
  createdUserIds.push(user.id);
  const profile = await prisma.agentProfile.create({
    data: { userId: user.id, creditsBalance: 0 },
  });
  return { user, profile };
}

async function makeAdmin() {
  const user = await prisma.user.create({
    data: {
      email: `test-cp-admin-${RUN_ID}@test.local`,
      passwordHash: await hashPassword("test12345"),
      name: "Admin de prueba",
      role: "ADMIN",
    },
  });
  createdUserIds.push(user.id);
  return user;
}

let agent: Awaited<ReturnType<typeof makeAgent>>;
let otherAgent: Awaited<ReturnType<typeof makeAgent>>;
let admin: Awaited<ReturnType<typeof makeAdmin>>;

before(async () => {
  agent = await makeAgent();
  otherAgent = await makeAgent();
  admin = await makeAdmin();
});

after(async () => {
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.$disconnect();
});

test("crear una solicitud de compra de créditos (paquete Starter)", async () => {
  const before = await prisma.agentProfile.findUniqueOrThrow({ where: { id: agent.profile.id } });
  const req = await createCreditPurchaseRequest(agent.profile.id, "STARTER");
  assert.equal(req.status, "PENDING");
  assert.equal(req.credits, CREDIT_PACKAGES.STARTER.credits);
  assert.equal(Number(req.amount), CREDIT_PACKAGES.STARTER.price);

  // Regla 13: crear la solicitud, por sí sola, no toca el saldo.
  const after = await prisma.agentProfile.findUniqueOrThrow({ where: { id: agent.profile.id } });
  assert.equal(after.creditsBalance, before.creditsBalance);
});

test("crear solicitudes de compra para cada paquete (Starter/Pro/Premium)", async () => {
  for (const key of ["STARTER", "PRO", "PREMIUM"] as const) {
    const req = await createCreditPurchaseRequest(otherAgent.profile.id, key);
    assert.equal(req.package, key);
    assert.equal(req.credits, CREDIT_PACKAGES[key].credits);
  }
  const requests = await listCreditPurchasesForAgent(otherAgent.profile.id);
  assert.equal(requests.length, 3);
});

test("un pago PENDING no acredita créditos", async () => {
  const req = await createCreditPurchaseRequest(agent.profile.id, "PRO");
  const profile = await prisma.agentProfile.findUniqueOrThrow({ where: { id: agent.profile.id } });
  assert.equal(profile.creditsBalance, 0);
  assert.equal(req.status, "PENDING");
});

test("un agente no puede aprobar sus propios pagos", async () => {
  const req = await createCreditPurchaseRequest(agent.profile.id, "STARTER");
  await assert.rejects(
    () => approveCreditPurchase(agent.user.id, req.id),
    PurchaseError,
  );
  const stillPending = await prisma.creditPurchaseRequest.findUniqueOrThrow({ where: { id: req.id } });
  assert.equal(stillPending.status, "PENDING");
});

test("un usuario no administrador no puede aprobar pagos", async () => {
  const req = await createCreditPurchaseRequest(agent.profile.id, "STARTER");
  // otherAgent tampoco es admin, y ni siquiera es el dueño del pago.
  await assert.rejects(
    () => approveCreditPurchase(otherAgent.user.id, req.id),
    PurchaseError,
  );
});

test("un administrador puede aprobar y acredita exactamente los créditos del paquete", async () => {
  const before = await prisma.agentProfile.findUniqueOrThrow({ where: { id: agent.profile.id } });
  const req = await createCreditPurchaseRequest(agent.profile.id, "PREMIUM");

  const approved = await approveCreditPurchase(admin.id, req.id);
  assert.equal(approved.status, "APPROVED");
  assert.equal(approved.reviewedBy, admin.id);
  assert.ok(approved.reviewedAt);

  const after = await prisma.agentProfile.findUniqueOrThrow({ where: { id: agent.profile.id } });
  assert.equal(after.creditsBalance, before.creditsBalance + CREDIT_PACKAGES.PREMIUM.credits);

  // El ledger registra correctamente la compra.
  const entry = await prisma.creditLedgerEntry.findFirst({
    where: { creditPurchaseRequestId: req.id },
  });
  assert.ok(entry);
  assert.equal(entry!.amount, CREDIT_PACKAGES.PREMIUM.credits);
  assert.equal(entry!.balanceAfter, after.creditsBalance);
  assert.match(entry!.description ?? "", /Premium/);
});

test("aprobar dos veces no duplica los créditos", async () => {
  const req = await createCreditPurchaseRequest(agent.profile.id, "STARTER");
  await approveCreditPurchase(admin.id, req.id);
  const afterFirst = await prisma.agentProfile.findUniqueOrThrow({ where: { id: agent.profile.id } });

  await assert.rejects(
    () => approveCreditPurchase(admin.id, req.id),
    PurchaseError,
  );
  const afterSecond = await prisma.agentProfile.findUniqueOrThrow({ where: { id: agent.profile.id } });
  assert.equal(afterSecond.creditsBalance, afterFirst.creditsBalance);
});

test("rechazar no acredita créditos", async () => {
  const before = await prisma.agentProfile.findUniqueOrThrow({ where: { id: agent.profile.id } });
  const req = await createCreditPurchaseRequest(agent.profile.id, "PRO");

  const rejected = await rejectCreditPurchase(admin.id, req.id, "Comprobante ilegible");
  assert.equal(rejected.status, "REJECTED");
  assert.equal(rejected.rejectionReason, "Comprobante ilegible");

  const after = await prisma.agentProfile.findUniqueOrThrow({ where: { id: agent.profile.id } });
  assert.equal(after.creditsBalance, before.creditsBalance);
});

test("el balance del agente siempre coincide con la suma de su ledger", async () => {
  const [profile, entries] = await Promise.all([
    prisma.agentProfile.findUniqueOrThrow({ where: { id: agent.profile.id } }),
    prisma.creditLedgerEntry.findMany({ where: { agentId: agent.profile.id } }),
  ]);
  const sum = entries.reduce((acc, e) => acc + e.amount, 0);
  assert.equal(profile.creditsBalance, sum);
});

test("el agente puede ver su historial de compras", async () => {
  const history = await listCreditPurchasesForAgent(agent.profile.id);
  assert.ok(history.length > 0);
  assert.ok(history.every((h) => h.agentId === agent.profile.id));
});
