// Conversation/ConversationMessage son modelos nuevos sin service layer
// todavía (PR #16) — estos tests ejercitan Prisma directamente (igual que
// el property.test.ts original de PR #10), validando solo el esquema: la
// creación automática dentro de purchaseWithCredits, el constraint único
// de leadPurchaseId, las reglas de borrado (Cascade/SetNull/Restrict) y
// los dos tipos de mensaje.
import "dotenv/config";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../db";
import { hashPassword } from "../password";
import { purchaseWithCredits } from "./purchase";
import { createProperty } from "./properties";
import { shareProperty } from "./propertyShares";

const RUN_ID = Date.now().toString(36);
const createdUserIds: string[] = [];
const createdRequestIds: string[] = [];

async function makeUser(role: "BUYER" | "AGENT") {
  const user = await prisma.user.create({
    data: {
      email: `test-conversation-${role.toLowerCase()}-${RUN_ID}-${createdUserIds.length}@test.local`,
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

// Crea un LeadPurchase real (vía purchaseWithCredits, no un insert
// directo) — es lo que debe disparar la creación automática de la
// Conversation (PR #16).
async function makeLeadPurchase() {
  const { user: agentUser, profile: agentProfile } = await makeAgent(50);
  const { user: buyerUser, request } = await makeBuyerWithRequest();
  const purchase = await purchaseWithCredits({
    agentUserId: agentUser.id,
    agentProfileId: agentProfile.id,
    requestId: request.id,
  });
  return { agentUser, agentProfile, buyerUser, request, purchase };
}

async function makeProperty(agentProfileId: string) {
  return createProperty(agentProfileId, {
    operationType: "COMPRAR",
    propertyType: "DEPARTAMENTO",
    title: "Propiedad de prueba (conversación)",
    price: 120000,
    provincia: "Pichincha",
    ciudad: "Quito",
    squareMeters: 90,
  });
}

after(async () => {
  await prisma.propertyRequest.deleteMany({ where: { id: { in: createdRequestIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.$disconnect();
});

test("purchaseWithCredits crea automáticamente una Conversation para el LeadPurchase nuevo", async () => {
  const { purchase } = await makeLeadPurchase();
  const conversation = await prisma.conversation.findUnique({
    where: { leadPurchaseId: purchase.id },
  });
  assert.ok(conversation, "debe existir una Conversation para este LeadPurchase");
  assert.equal(conversation!.leadPurchaseId, purchase.id);
});

test("no se puede crear una segunda Conversation para el mismo LeadPurchase (constraint único)", async () => {
  const { purchase } = await makeLeadPurchase();
  await assert.rejects(() =>
    prisma.conversation.create({ data: { leadPurchaseId: purchase.id } }),
  );
});

test("borrar el LeadPurchase borra en cascada su Conversation", async () => {
  // LeadPurchase nunca se borra en el flujo real de la app (confirmado en
  // el informe de PR #15), pero el comportamiento de cascada a nivel de
  // esquema debe seguir siendo correcto.
  const { purchase } = await makeLeadPurchase();
  const conversation = await prisma.conversation.findUniqueOrThrow({
    where: { leadPurchaseId: purchase.id },
  });
  await prisma.leadPurchase.delete({ where: { id: purchase.id } });
  const found = await prisma.conversation.findUnique({ where: { id: conversation.id } });
  assert.equal(found, null);
});

test("un mensaje TEXT se crea con senderUserId y body; el type por defecto es TEXT", async () => {
  const { agentUser, purchase } = await makeLeadPurchase();
  const conversation = await prisma.conversation.findUniqueOrThrow({
    where: { leadPurchaseId: purchase.id },
  });
  const message = await prisma.conversationMessage.create({
    data: {
      conversationId: conversation.id,
      senderUserId: agentUser.id,
      body: "Hola, vi tu solicitud y tengo algo que podría interesarte.",
    },
  });
  assert.equal(message.type, "TEXT");
  assert.equal(message.senderUserId, agentUser.id);
  assert.equal(message.propertyShareId, null);
});

test("un mensaje PROPERTY_SHARE referencia un PropertyShare existente sin duplicar sus datos", async () => {
  const { agentUser, agentProfile, purchase } = await makeLeadPurchase();
  const property = await makeProperty(agentProfile.id);
  const share = await shareProperty(agentProfile.id, purchase.id, property.id);
  const conversation = await prisma.conversation.findUniqueOrThrow({
    where: { leadPurchaseId: purchase.id },
  });

  const message = await prisma.conversationMessage.create({
    data: {
      conversationId: conversation.id,
      senderUserId: agentUser.id,
      type: "PROPERTY_SHARE",
      propertyShareId: share.id,
    },
  });

  const withShare = await prisma.conversationMessage.findUniqueOrThrow({
    where: { id: message.id },
    include: { propertyShare: { include: { property: true } } },
  });
  assert.equal(withShare.body, null, "el mensaje no duplica datos de la propiedad");
  assert.equal(withShare.propertyShare?.property?.id, property.id);
  assert.equal(withShare.propertyShare?.property?.title, property.title);
});

test("borrar la Conversation borra en cascada sus mensajes", async () => {
  const { agentUser, purchase } = await makeLeadPurchase();
  const conversation = await prisma.conversation.findUniqueOrThrow({
    where: { leadPurchaseId: purchase.id },
  });
  const message = await prisma.conversationMessage.create({
    data: { conversationId: conversation.id, senderUserId: agentUser.id, body: "hola" },
  });
  await prisma.conversation.delete({ where: { id: conversation.id } });
  const found = await prisma.conversationMessage.findUnique({ where: { id: message.id } });
  assert.equal(found, null);
});

test("borrar el PropertyShare referenciado deja propertyShareId en null; el mensaje sobrevive (SetNull)", async () => {
  const { agentUser, agentProfile, purchase } = await makeLeadPurchase();
  const property = await makeProperty(agentProfile.id);
  const share = await shareProperty(agentProfile.id, purchase.id, property.id);
  const conversation = await prisma.conversation.findUniqueOrThrow({
    where: { leadPurchaseId: purchase.id },
  });
  const message = await prisma.conversationMessage.create({
    data: {
      conversationId: conversation.id,
      senderUserId: agentUser.id,
      type: "PROPERTY_SHARE",
      propertyShareId: share.id,
    },
  });

  await prisma.propertyShare.delete({ where: { id: share.id } });

  const found = await prisma.conversationMessage.findUniqueOrThrow({ where: { id: message.id } });
  assert.equal(found.propertyShareId, null);
});

test("borrar un User que envió mensajes falla (Restrict) — protege el historial de evidencia", async () => {
  const { agentUser, purchase } = await makeLeadPurchase();
  const conversation = await prisma.conversation.findUniqueOrThrow({
    where: { leadPurchaseId: purchase.id },
  });
  const message = await prisma.conversationMessage.create({
    data: { conversationId: conversation.id, senderUserId: agentUser.id, body: "hola" },
  });

  await assert.rejects(() => prisma.user.delete({ where: { id: agentUser.id } }));

  // Limpieza manual: el after() global borra usuarios por id al final del
  // archivo, así que hay que quitar el mensaje que bloquea el borrado para
  // no dejar datos huérfanos en la base de desarrollo.
  await prisma.conversationMessage.delete({ where: { id: message.id } });
});

test("la relación Conversation <-> LeadPurchase carga correctamente desde ambos lados", async () => {
  const { purchase } = await makeLeadPurchase();

  const conversation = await prisma.conversation.findUniqueOrThrow({
    where: { leadPurchaseId: purchase.id },
    include: { leadPurchase: true },
  });
  assert.equal(conversation.leadPurchase.id, purchase.id);

  const withConversation = await prisma.leadPurchase.findUniqueOrThrow({
    where: { id: purchase.id },
    include: { conversation: true },
  });
  assert.equal(withConversation.conversation?.id, conversation.id);
});
