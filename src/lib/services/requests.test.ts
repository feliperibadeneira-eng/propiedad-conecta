// Nadie ejercitaba createRequest() directamente — los demás tests insertan
// la PropertyRequest a mano vía prisma.propertyRequest.create(),
// saltándose el servicio real que usa el formulario de /buscar. Esto
// confirma que operationType se guarda tal cual se envía, para ambos
// valores (RequestForm.tsx ya no preselecciona ninguno).
import "dotenv/config";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../db";
import { hashPassword } from "../password";
import { createRequest } from "./requests";
import type { CreateRequestInput } from "../validators/request";

const RUN_ID = Date.now().toString(36);
const createdUserIds: string[] = [];
const createdRequestIds: string[] = [];

async function makeBuyerProfile() {
  const user = await prisma.user.create({
    data: {
      email: `test-req-buyer-${RUN_ID}-${createdUserIds.length}@test.local`,
      passwordHash: await hashPassword("test12345"),
      name: "Comprador de prueba",
      phone: "0991111111",
      role: "BUYER",
    },
  });
  createdUserIds.push(user.id);
  return prisma.buyerProfile.create({
    data: { userId: user.id, contactConsent: true },
  });
}

function baseInput(operationType: "COMPRAR" | "ALQUILAR"): CreateRequestInput {
  return {
    operationType,
    propertyType: "DEPARTAMENTO",
    provincia: "Pichincha",
    ciudad: "Quito",
    priceMin: 100000,
    priceMax: 150000,
    contactName: "Comprador de prueba",
    contactPhone: "0991111111",
    contactPreference: "WHATSAPP",
    maxAgents: 3,
  };
}

after(async () => {
  await prisma.propertyRequest.deleteMany({ where: { id: { in: createdRequestIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.$disconnect();
});

test("createRequest guarda una solicitud de COMPRAR tal cual se envía", async () => {
  const buyerProfile = await makeBuyerProfile();
  const request = await createRequest(buyerProfile.id, baseInput("COMPRAR"));
  createdRequestIds.push(request.id);

  const saved = await prisma.propertyRequest.findUniqueOrThrow({
    where: { id: request.id },
  });
  assert.equal(saved.operationType, "COMPRAR");
});

test("createRequest guarda una solicitud de ALQUILAR tal cual se envía", async () => {
  const buyerProfile = await makeBuyerProfile();
  const request = await createRequest(buyerProfile.id, baseInput("ALQUILAR"));
  createdRequestIds.push(request.id);

  const saved = await prisma.propertyRequest.findUniqueOrThrow({
    where: { id: request.id },
  });
  assert.equal(saved.operationType, "ALQUILAR");
});
