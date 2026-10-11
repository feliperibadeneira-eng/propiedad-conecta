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
import { shareProperty, PropertyShareError } from "./propertyShares";
import {
  getConversationForAgent,
  getConversationForBuyer,
  listMessagesForAgent,
  listMessagesForBuyer,
  sendTextMessageAsAgent,
  sendTextMessageAsBuyer,
  sendPropertyShareMessage,
  ConversationError,
} from "./conversation";

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
  const { user: buyerUser, buyerProfile, request } = await makeBuyerWithRequest();
  const purchase = await purchaseWithCredits({
    agentUserId: agentUser.id,
    agentProfileId: agentProfile.id,
    requestId: request.id,
  });
  return { agentUser, agentProfile, buyerUser, buyerProfile, request, purchase };
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

// ========== Capa de servicio (PR #17): autorización, envío, rate limiting, paginación ==========

test("getConversationForAgent devuelve la conversación cuando el agente es dueño del LeadPurchase", async () => {
  const { agentProfile, purchase } = await makeLeadPurchase();
  const conversation = await getConversationForAgent(agentProfile.id, purchase.id);
  assert.equal(conversation.leadPurchaseId, purchase.id);
});

test("getConversationForAgent lanza error si el agente no es dueño del LeadPurchase (ajeno)", async () => {
  const { purchase } = await makeLeadPurchase();
  const { profile: otherAgent } = await makeAgent(0);
  await assert.rejects(
    () => getConversationForAgent(otherAgent.id, purchase.id),
    ConversationError,
  );
});

test("getConversationForBuyer devuelve la conversación cuando el comprador es dueño del LeadPurchase", async () => {
  const { buyerProfile, purchase } = await makeLeadPurchase();
  const conversation = await getConversationForBuyer(buyerProfile.id, purchase.id);
  assert.equal(conversation.leadPurchaseId, purchase.id);
});

test("getConversationForBuyer lanza error si el comprador no es dueño del LeadPurchase (ajeno)", async () => {
  const { purchase } = await makeLeadPurchase();
  const { buyerProfile: otherBuyer } = await makeBuyerWithRequest();
  await assert.rejects(
    () => getConversationForBuyer(otherBuyer.id, purchase.id),
    ConversationError,
  );
});

test("sendTextMessageAsAgent crea un mensaje TEXT con el senderUserId del agente", async () => {
  const { agentUser, agentProfile, purchase } = await makeLeadPurchase();
  const message = await sendTextMessageAsAgent({
    agentUserId: agentUser.id,
    agentProfileId: agentProfile.id,
    leadPurchaseId: purchase.id,
    body: "Hola, vi tu solicitud.",
  });
  assert.equal(message.type, "TEXT");
  assert.equal(message.senderUserId, agentUser.id);
  assert.equal(message.body, "Hola, vi tu solicitud.");
});

test("sendTextMessageAsBuyer crea un mensaje TEXT con el senderUserId del comprador", async () => {
  const { buyerUser, buyerProfile, purchase } = await makeLeadPurchase();
  const message = await sendTextMessageAsBuyer({
    buyerUserId: buyerUser.id,
    buyerProfileId: buyerProfile.id,
    leadPurchaseId: purchase.id,
    body: "Hola, gracias por contactarme.",
  });
  assert.equal(message.type, "TEXT");
  assert.equal(message.senderUserId, buyerUser.id);
});

test("sendTextMessageAsAgent rechaza un body vacío o compuesto únicamente por espacios", async () => {
  const { agentUser, agentProfile, purchase } = await makeLeadPurchase();
  await assert.rejects(
    () => sendTextMessageAsAgent({
      agentUserId: agentUser.id,
      agentProfileId: agentProfile.id,
      leadPurchaseId: purchase.id,
      body: "   ",
    }),
    ConversationError,
  );
  const count = await prisma.conversationMessage.count({ where: { senderUserId: agentUser.id } });
  assert.equal(count, 0, "no debe crearse ningún mensaje");
});

test("sendTextMessageAsAgent rechaza un body de más de 2000 caracteres", async () => {
  const { agentUser, agentProfile, purchase } = await makeLeadPurchase();
  await assert.rejects(
    () => sendTextMessageAsAgent({
      agentUserId: agentUser.id,
      agentProfileId: agentProfile.id,
      leadPurchaseId: purchase.id,
      body: "a".repeat(2001),
    }),
    ConversationError,
  );
});

test("sendTextMessageAsAgent lanza error si el agente no es dueño del LeadPurchase (ajeno) y no crea ningún mensaje", async () => {
  const { purchase } = await makeLeadPurchase();
  const { user: otherAgentUser, profile: otherAgent } = await makeAgent(0);
  await assert.rejects(
    () => sendTextMessageAsAgent({
      agentUserId: otherAgentUser.id,
      agentProfileId: otherAgent.id,
      leadPurchaseId: purchase.id,
      body: "Intento no autorizado",
    }),
    ConversationError,
  );
  const count = await prisma.conversationMessage.count({ where: { senderUserId: otherAgentUser.id } });
  assert.equal(count, 0, "no debe crearse ningún mensaje");
});

test("sendTextMessageAsBuyer lanza error si el comprador no es dueño del LeadPurchase (ajeno) y no crea ningún mensaje", async () => {
  const { purchase } = await makeLeadPurchase();
  const { user: otherBuyerUser, buyerProfile: otherBuyer } = await makeBuyerWithRequest();
  await assert.rejects(
    () => sendTextMessageAsBuyer({
      buyerUserId: otherBuyerUser.id,
      buyerProfileId: otherBuyer.id,
      leadPurchaseId: purchase.id,
      body: "Intento no autorizado",
    }),
    ConversationError,
  );
  const count = await prisma.conversationMessage.count({ where: { senderUserId: otherBuyerUser.id } });
  assert.equal(count, 0, "no debe crearse ningún mensaje");
});

test("sendPropertyShareMessage crea el mensaje PROPERTY_SHARE referenciando el PropertyShare, con body opcional", async () => {
  const { agentUser, agentProfile, purchase } = await makeLeadPurchase();
  const property = await makeProperty(agentProfile.id);

  const message = await sendPropertyShareMessage({
    agentUserId: agentUser.id,
    agentProfileId: agentProfile.id,
    leadPurchaseId: purchase.id,
    propertyId: property.id,
    body: "Mira esta, creo que te puede interesar",
  });

  assert.equal(message.type, "PROPERTY_SHARE");
  assert.equal(message.body, "Mira esta, creo que te puede interesar");
  assert.ok(message.propertyShareId);

  const share = await prisma.propertyShare.findUniqueOrThrow({ where: { id: message.propertyShareId! } });
  assert.equal(share.leadPurchaseId, purchase.id);
  assert.equal(share.propertyId, property.id);
});

test("sendPropertyShareMessage sin body guarda body null", async () => {
  const { agentUser, agentProfile, purchase } = await makeLeadPurchase();
  const property = await makeProperty(agentProfile.id);

  const message = await sendPropertyShareMessage({
    agentUserId: agentUser.id,
    agentProfileId: agentProfile.id,
    leadPurchaseId: purchase.id,
    propertyId: property.id,
  });

  assert.equal(message.body, null);
});

test("sendPropertyShareMessage reutiliza el PropertyShare existente (idempotencia heredada de shareProperty)", async () => {
  const { agentUser, agentProfile, purchase } = await makeLeadPurchase();
  const property = await makeProperty(agentProfile.id);

  const first = await sendPropertyShareMessage({
    agentUserId: agentUser.id,
    agentProfileId: agentProfile.id,
    leadPurchaseId: purchase.id,
    propertyId: property.id,
  });
  const second = await sendPropertyShareMessage({
    agentUserId: agentUser.id,
    agentProfileId: agentProfile.id,
    leadPurchaseId: purchase.id,
    propertyId: property.id,
  });

  assert.equal(second.propertyShareId, first.propertyShareId, "ambos mensajes deben referenciar el mismo PropertyShare");
  const shareCount = await prisma.propertyShare.count({
    where: { leadPurchaseId: purchase.id, propertyId: property.id },
  });
  assert.equal(shareCount, 1, "no debe duplicarse el PropertyShare");
  const messageCount = await prisma.conversationMessage.count({ where: { type: "PROPERTY_SHARE", propertyShareId: first.propertyShareId } });
  assert.equal(messageCount, 2, "cada envío sigue creando su propio mensaje, aunque comparta el PropertyShare");
});

test("sendPropertyShareMessage rechaza una propiedad ajena (propaga PropertyShareError) sin crear ningún mensaje", async () => {
  const { agentUser, agentProfile, purchase } = await makeLeadPurchase();
  const { profile: otherAgent } = await makeAgent(0);
  const foreignProperty = await makeProperty(otherAgent.id);

  await assert.rejects(
    () => sendPropertyShareMessage({
      agentUserId: agentUser.id,
      agentProfileId: agentProfile.id,
      leadPurchaseId: purchase.id,
      propertyId: foreignProperty.id,
    }),
    PropertyShareError,
  );
  const count = await prisma.conversationMessage.count({ where: { senderUserId: agentUser.id } });
  assert.equal(count, 0, "no debe crearse ningún mensaje");
});

test("sendPropertyShareMessage rechaza una propiedad propia que no está DISPONIBLE", async () => {
  const { agentUser, agentProfile, purchase } = await makeLeadPurchase();
  const property = await makeProperty(agentProfile.id);
  await prisma.property.update({ where: { id: property.id }, data: { status: "PAUSADA" } });

  await assert.rejects(
    () => sendPropertyShareMessage({
      agentUserId: agentUser.id,
      agentProfileId: agentProfile.id,
      leadPurchaseId: purchase.id,
      propertyId: property.id,
    }),
    PropertyShareError,
  );
});

test("sendPropertyShareMessage rechaza un comentario de más de 2000 caracteres", async () => {
  const { agentUser, agentProfile, purchase } = await makeLeadPurchase();
  const property = await makeProperty(agentProfile.id);

  await assert.rejects(
    () => sendPropertyShareMessage({
      agentUserId: agentUser.id,
      agentProfileId: agentProfile.id,
      leadPurchaseId: purchase.id,
      propertyId: property.id,
      body: "a".repeat(2001),
    }),
    ConversationError,
  );
  const shareCount = await prisma.propertyShare.count({ where: { leadPurchaseId: purchase.id } });
  assert.equal(shareCount, 0, "al validarse ANTES de llamar a shareProperty, tampoco debe crearse el PropertyShare");
});

test("rate limiting: el mensaje número 11 en la misma conversación y remitente dentro de 60s es rechazado", async () => {
  const { agentUser, agentProfile, purchase } = await makeLeadPurchase();

  for (let i = 0; i < 10; i++) {
    await sendTextMessageAsAgent({
      agentUserId: agentUser.id,
      agentProfileId: agentProfile.id,
      leadPurchaseId: purchase.id,
      body: `Mensaje ${i}`,
    });
  }

  await assert.rejects(
    () => sendTextMessageAsAgent({
      agentUserId: agentUser.id,
      agentProfileId: agentProfile.id,
      leadPurchaseId: purchase.id,
      body: "Mensaje número 11",
    }),
    ConversationError,
  );

  const count = await prisma.conversationMessage.count({ where: { conversationId: (await prisma.conversation.findUniqueOrThrow({ where: { leadPurchaseId: purchase.id } })).id } });
  assert.equal(count, 10, "el mensaje número 11 no debe haberse creado");
});

test("rate limiting: el límite es por conversación y remitente, no global — otra conversación del mismo agente no se ve afectada", async () => {
  const { agentUser, agentProfile, purchase: purchaseA } = await makeLeadPurchase();
  const { request: requestB } = await makeBuyerWithRequest();
  const purchaseB = await purchaseWithCredits({
    agentUserId: agentUser.id,
    agentProfileId: agentProfile.id,
    requestId: requestB.id,
  });

  for (let i = 0; i < 10; i++) {
    await sendTextMessageAsAgent({
      agentUserId: agentUser.id,
      agentProfileId: agentProfile.id,
      leadPurchaseId: purchaseA.id,
      body: `Mensaje ${i}`,
    });
  }
  await assert.rejects(() =>
    sendTextMessageAsAgent({
      agentUserId: agentUser.id,
      agentProfileId: agentProfile.id,
      leadPurchaseId: purchaseA.id,
      body: "Bloqueado en A",
    }),
  );

  // La misma pareja agente+comprador, pero en el hilo de otra solicitud
  // (otra Conversation): no debe estar afectada por el límite de A.
  const messageInB = await sendTextMessageAsAgent({
    agentUserId: agentUser.id,
    agentProfileId: agentProfile.id,
    leadPurchaseId: purchaseB.id,
    body: "No debería estar bloqueado en B",
  });
  assert.ok(messageInB.id);
});

test("rate limiting: el límite es por remitente — el otro participante de la misma conversación no se ve afectado", async () => {
  const { agentUser, agentProfile, buyerUser, buyerProfile, purchase } = await makeLeadPurchase();

  for (let i = 0; i < 10; i++) {
    await sendTextMessageAsAgent({
      agentUserId: agentUser.id,
      agentProfileId: agentProfile.id,
      leadPurchaseId: purchase.id,
      body: `Mensaje ${i}`,
    });
  }

  const buyerMessage = await sendTextMessageAsBuyer({
    buyerUserId: buyerUser.id,
    buyerProfileId: buyerProfile.id,
    leadPurchaseId: purchase.id,
    body: "El comprador no está bloqueado por los mensajes del agente",
  });
  assert.ok(buyerMessage.id);
});

test("listMessagesForAgent devuelve los mensajes más recientes primero", async () => {
  const { agentUser, agentProfile, purchase } = await makeLeadPurchase();
  const conversation = await prisma.conversation.findUniqueOrThrow({ where: { leadPurchaseId: purchase.id } });

  const base = Date.now();
  const bodies = ["primero", "segundo", "tercero"];
  for (let i = 0; i < bodies.length; i++) {
    await prisma.conversationMessage.create({
      data: {
        conversationId: conversation.id,
        senderUserId: agentUser.id,
        body: bodies[i],
        createdAt: new Date(base + i * 1000),
      },
    });
  }

  const { messages, nextCursor } = await listMessagesForAgent(agentProfile.id, purchase.id);
  assert.deepEqual(messages.map((m) => m.body), ["tercero", "segundo", "primero"]);
  assert.equal(nextCursor, null);
});

test("listMessagesForAgent pagina con cursor estable, sin duplicar ni saltar filas", async () => {
  const { agentUser, agentProfile, purchase } = await makeLeadPurchase();
  const conversation = await prisma.conversation.findUniqueOrThrow({ where: { leadPurchaseId: purchase.id } });

  const base = Date.now();
  const total = 5;
  for (let i = 0; i < total; i++) {
    await prisma.conversationMessage.create({
      data: {
        conversationId: conversation.id,
        senderUserId: agentUser.id,
        body: `mensaje-${i}`,
        createdAt: new Date(base + i * 1000),
      },
    });
  }

  const collected: string[] = [];
  let cursor: { createdAt: Date; id: string } | undefined;
  for (let page = 0; page < total; page++) {
    const result = await listMessagesForAgent(agentProfile.id, purchase.id, { cursor, limit: 2 });
    collected.push(...result.messages.map((m) => m.body!));
    if (!result.nextCursor) break;
    cursor = result.nextCursor;
  }

  assert.deepEqual(collected, ["mensaje-4", "mensaje-3", "mensaje-2", "mensaje-1", "mensaje-0"]);
  assert.equal(new Set(collected).size, total, "no debe haber filas duplicadas entre páginas");
});

test("listMessagesForBuyer lanza error si el comprador no es dueño del LeadPurchase (ajeno)", async () => {
  const { purchase } = await makeLeadPurchase();
  const { buyerProfile: otherBuyer } = await makeBuyerWithRequest();
  await assert.rejects(
    () => listMessagesForBuyer(otherBuyer.id, purchase.id),
    ConversationError,
  );
});
