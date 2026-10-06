// Tests de propertyMatching.ts: la función pura de scoring (con fixtures en
// memoria, sin DB) y la capa de servicio listCompatibleRequestsForProperty
// (con Postgres real, patrón RUN_ID habitual de este proyecto) — incluyendo
// ownership, filtros de status, umbral mínimo, y la ausencia de campos de
// contacto en el resultado.
import "dotenv/config";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../db";
import { hashPassword } from "../password";
import { createProperty } from "./properties";
import {
  PROPERTY_MATCH_WEIGHTS,
  PROPERTY_MATCH_THRESHOLD,
  calculatePropertyMatchScore,
  propertyMatchLabel,
  listCompatibleRequestsForProperty,
  type PropertyForMatching,
  type RequestForMatching,
} from "./propertyMatching";

const RUN_ID = Date.now().toString(36);
const createdUserIds: string[] = [];
const createdRequestIds: string[] = [];

// ---------- Fixtures puros (sin DB) ----------

function baseProperty(overrides: Partial<PropertyForMatching> = {}): PropertyForMatching {
  return {
    operationType: "COMPRAR",
    propertyType: "DEPARTAMENTO",
    ciudad: "Quito",
    sector: "Cumbayá",
    price: 200000,
    squareMeters: 120,
    bedrooms: 3,
    bathrooms: 2,
    ...overrides,
  };
}

function baseRequest(overrides: Partial<RequestForMatching> = {}): RequestForMatching {
  return {
    operationType: "COMPRAR",
    propertyType: "DEPARTAMENTO",
    ciudad: "Quito",
    sector: "Cumbayá",
    priceMin: 150000,
    priceMax: 250000,
    minSquareMeters: 100,
    bedrooms: 3,
    bathrooms: 2,
    ...overrides,
  };
}

// ---------- Configuración ----------

test("los pesos de scoring suman 100", () => {
  const total = Object.values(PROPERTY_MATCH_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.equal(total, 100);
});

// ---------- Gates duros ----------

test("misma operación, mismo tipo, misma ciudad: el score es mayor que 0", () => {
  const score = calculatePropertyMatchScore(baseProperty(), baseRequest());
  assert.ok(score > 0);
});

test("operación diferente excluye el match (gate duro) -> score 0", () => {
  const score = calculatePropertyMatchScore(
    baseProperty({ operationType: "COMPRAR" }),
    baseRequest({ operationType: "ALQUILAR" }),
  );
  assert.equal(score, 0);
});

test("tipo de propiedad diferente excluye el match (gate duro) -> score 0", () => {
  const score = calculatePropertyMatchScore(
    baseProperty({ propertyType: "DEPARTAMENTO" }),
    baseRequest({ propertyType: "CASA" }),
  );
  assert.equal(score, 0);
});

test("ciudad diferente excluye el match (gate duro) -> score 0", () => {
  const score = calculatePropertyMatchScore(
    baseProperty({ ciudad: "Quito" }),
    baseRequest({ ciudad: "Guayaquil" }),
  );
  assert.equal(score, 0);
});

test("la comparación de ciudad es insensible a mayúsculas/espacios", () => {
  const score = calculatePropertyMatchScore(
    baseProperty({ ciudad: "  QUITO " }),
    baseRequest({ ciudad: "quito" }),
  );
  assert.ok(score > 0);
});

// ---------- Precio ----------

test("precio dentro del presupuesto: puntaje de precio completo", () => {
  // Resto de factores en su valor perfecto (sector+bedrooms+sqm+bathrooms=65),
  // así que el total aísla exactamente el aporte del precio.
  const score = calculatePropertyMatchScore(
    baseProperty({ price: 200000 }),
    baseRequest({ priceMax: 250000 }),
  );
  assert.equal(score, 100); // 65 + 35 (completo)
});

test("precio ligeramente sobre el presupuesto (<=10%): puntaje parcial alto", () => {
  const score = calculatePropertyMatchScore(
    baseProperty({ price: 210000 }), // 5% sobre priceMax
    baseRequest({ priceMax: 200000 }),
  );
  assert.equal(score, 86); // 65 + 35*0.6=21
});

test("precio moderadamente sobre el presupuesto (<=25%): puntaje parcial bajo", () => {
  const score = calculatePropertyMatchScore(
    baseProperty({ price: 230000 }), // 15% sobre priceMax
    baseRequest({ priceMax: 200000 }),
  );
  assert.equal(score, 76); // 65 + 35*0.3=10.5 -> round(75.5)=76
});

test("precio muy por encima del presupuesto (>25%): sin puntaje de precio", () => {
  const score = calculatePropertyMatchScore(
    baseProperty({ price: 300000 }), // 50% sobre priceMax
    baseRequest({ priceMax: 200000 }),
  );
  assert.equal(score, 65); // 65 + 0
});

// ---------- Sector ----------

test("sector coincidente: puntaje de sector completo", () => {
  const score = calculatePropertyMatchScore(
    baseProperty({ sector: "Cumbayá" }),
    baseRequest({ sector: "Cumbayá" }),
  );
  assert.equal(score, 100); // 80 + 20
});

test("sector ausente en un lado: puntaje de sector neutral (no penaliza como un mismatch)", () => {
  const score = calculatePropertyMatchScore(
    baseProperty({ sector: "Cumbayá" }),
    baseRequest({ sector: null }),
  );
  assert.equal(score, 92); // 80 + 20*0.6=12
});

test("sector presente pero diferente: puntaje de sector bajo", () => {
  const score = calculatePropertyMatchScore(
    baseProperty({ sector: "Cumbayá" }),
    baseRequest({ sector: "La Carolina" }),
  );
  assert.equal(score, 85); // 80 + 20*0.25=5
});

// ---------- Habitaciones ----------

test("habitaciones suficientes: puntaje completo", () => {
  const score = calculatePropertyMatchScore(
    baseProperty({ bedrooms: 3 }),
    baseRequest({ bedrooms: 3 }),
  );
  assert.equal(score, 100); // 80 + 20
});

test("habitaciones insuficientes por uno: puntaje parcial", () => {
  const score = calculatePropertyMatchScore(
    baseProperty({ bedrooms: 2 }),
    baseRequest({ bedrooms: 3 }),
  );
  assert.equal(score, 90); // 80 + 20*0.5=10
});

test("habitaciones muy insuficientes: sin puntaje", () => {
  const score = calculatePropertyMatchScore(
    baseProperty({ bedrooms: 1 }),
    baseRequest({ bedrooms: 3 }),
  );
  assert.equal(score, 80); // 80 + 0
});

test("habitaciones no especificadas en la solicitud: puntaje completo (sin preferencia que incumplir)", () => {
  const score = calculatePropertyMatchScore(
    baseProperty({ bedrooms: 1 }),
    baseRequest({ bedrooms: null }),
  );
  assert.equal(score, 100); // 80 + 20
});

// ---------- Baños ----------

test("baños suficientes: puntaje completo", () => {
  const score = calculatePropertyMatchScore(
    baseProperty({ bathrooms: 2 }),
    baseRequest({ bathrooms: 2 }),
  );
  assert.equal(score, 100); // 90 + 10
});

test("baños insuficientes por uno: puntaje parcial", () => {
  const score = calculatePropertyMatchScore(
    baseProperty({ bathrooms: 1 }),
    baseRequest({ bathrooms: 2 }),
  );
  assert.equal(score, 95); // 90 + 10*0.5=5
});

test("baños muy insuficientes: sin puntaje", () => {
  const score = calculatePropertyMatchScore(
    baseProperty({ bathrooms: 0 }),
    baseRequest({ bathrooms: 2 }),
  );
  assert.equal(score, 90); // 90 + 0
});

test("baños no especificados en la solicitud: puntaje completo", () => {
  const score = calculatePropertyMatchScore(
    baseProperty({ bathrooms: 0 }),
    baseRequest({ bathrooms: null }),
  );
  assert.equal(score, 100); // 90 + 10
});

// ---------- Metros cuadrados ----------

test("metros cuadrados suficientes: puntaje completo", () => {
  const score = calculatePropertyMatchScore(
    baseProperty({ squareMeters: 120 }),
    baseRequest({ minSquareMeters: 100 }),
  );
  assert.equal(score, 100); // 85 + 15
});

test("metros cuadrados levemente insuficientes (<=10% por debajo): puntaje parcial", () => {
  const score = calculatePropertyMatchScore(
    baseProperty({ squareMeters: 92 }), // 8% por debajo de 100
    baseRequest({ minSquareMeters: 100 }),
  );
  assert.equal(score, 93); // 85 + 15*0.5=7.5 -> round(92.5)=93
});

test("metros cuadrados muy insuficientes: sin puntaje", () => {
  const score = calculatePropertyMatchScore(
    baseProperty({ squareMeters: 80 }), // 20% por debajo de 100
    baseRequest({ minSquareMeters: 100 }),
  );
  assert.equal(score, 85); // 85 + 0
});

test("metros cuadrados mínimos no especificados en la solicitud: puntaje completo", () => {
  const score = calculatePropertyMatchScore(
    baseProperty({ squareMeters: 10 }),
    baseRequest({ minSquareMeters: null }),
  );
  assert.equal(score, 100); // 85 + 15
});

// ---------- Ejemplo exacto del plan aprobado ----------

test("el ejemplo exacto del plan (COMPRAR/Quito/Cumbayá/Depto, 120m²/3hab/$220k vs min 100m²/3hab/hasta $250k) da score 100", () => {
  const property = baseProperty({
    operationType: "COMPRAR",
    propertyType: "DEPARTAMENTO",
    ciudad: "Quito",
    sector: "Cumbayá",
    price: 220000,
    squareMeters: 120,
    bedrooms: 3,
    bathrooms: null,
  });
  const request = baseRequest({
    operationType: "COMPRAR",
    propertyType: "DEPARTAMENTO",
    ciudad: "Quito",
    sector: "Cumbayá",
    priceMin: 150000,
    priceMax: 250000,
    minSquareMeters: 100,
    bedrooms: 3,
    bathrooms: null,
  });
  assert.equal(calculatePropertyMatchScore(property, request), 100);
});

// ---------- Label ----------

test("propertyMatchLabel refleja las bandas configuradas", () => {
  assert.equal(propertyMatchLabel(95), "Excelente");
  assert.equal(propertyMatchLabel(80), "Muy bueno");
  assert.equal(propertyMatchLabel(60), "Bueno");
  assert.equal(propertyMatchLabel(40), "Débil");
  assert.equal(propertyMatchLabel(10), "Bajo");
});

// ---------- Capa de servicio (Postgres real) ----------

async function makeAgent() {
  const user = await prisma.user.create({
    data: {
      email: `test-propmatch-agent-${RUN_ID}-${createdUserIds.length}@test.local`,
      passwordHash: await hashPassword("test12345"),
      name: "Agente de prueba",
      phone: "0990000000",
      role: "AGENT",
    },
  });
  createdUserIds.push(user.id);
  const profile = await prisma.agentProfile.create({ data: { userId: user.id } });
  return { user, profile };
}

async function makeMatchingProperty(
  agentProfileId: string,
  overrides: Partial<Parameters<typeof createProperty>[1]> = {},
) {
  return createProperty(agentProfileId, {
    operationType: "COMPRAR",
    propertyType: "DEPARTAMENTO",
    title: "Propiedad de prueba",
    price: 220000,
    provincia: "Pichincha",
    ciudad: "Quito",
    sector: "Cumbayá",
    squareMeters: 120,
    bedrooms: 3,
    ...overrides,
  });
}

async function makeBuyerWithRequest(overrides: {
  operationType?: "COMPRAR" | "ALQUILAR";
  propertyType?: "DEPARTAMENTO" | "CASA";
  ciudad?: string;
  sector?: string;
  priceMin?: number;
  priceMax?: number;
  minSquareMeters?: number;
  bedrooms?: number;
  status?: "BUSCANDO" | "EN_PROCESO" | "PAUSADA" | "CERRADA";
} = {}) {
  const user = await prisma.user.create({
    data: {
      email: `test-propmatch-buyer-${RUN_ID}-${createdUserIds.length}@test.local`,
      passwordHash: await hashPassword("test12345"),
      name: "Comprador de prueba",
      phone: "0991234567",
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
      operationType: overrides.operationType ?? "COMPRAR",
      propertyType: overrides.propertyType ?? "DEPARTAMENTO",
      provincia: "Pichincha",
      ciudad: overrides.ciudad ?? "Quito",
      sector: overrides.sector ?? "Cumbayá",
      priceMin: overrides.priceMin ?? 150000,
      priceMax: overrides.priceMax ?? 250000,
      minSquareMeters: overrides.minSquareMeters ?? 100,
      bedrooms: overrides.bedrooms ?? 3,
      contactName: "Nombre Privado del Comprador",
      contactPhone: "0999999999",
      contactEmail: "privado@test.local",
      contactPreference: "WHATSAPP",
      dataSharingConsent: true,
      maxAgents: 3,
      leadPrice: 0,
      status: overrides.status ?? "BUSCANDO",
    },
  });
  createdRequestIds.push(request.id);
  return { user, buyerProfile, request };
}

after(async () => {
  await prisma.propertyRequest.deleteMany({ where: { id: { in: createdRequestIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.$disconnect();
});

test("lista solicitudes activas compatibles, con matchScore, ordenadas descendente", async () => {
  const { profile } = await makeAgent();
  const property = await makeMatchingProperty(profile.id);

  const { request: strong } = await makeBuyerWithRequest({ sector: "Cumbayá", bedrooms: 3 });
  const { request: weaker } = await makeBuyerWithRequest({ sector: "La Carolina", bedrooms: 3 });

  const results = await listCompatibleRequestsForProperty(profile.id, property.id);
  const ids = results.map((r) => r.id);
  assert.ok(ids.includes(strong.id));
  assert.ok(ids.includes(weaker.id));

  const strongResult = results.find((r) => r.id === strong.id)!;
  const weakerResult = results.find((r) => r.id === weaker.id)!;
  assert.ok(strongResult.matchScore >= weakerResult.matchScore);
  assert.ok(results[0].matchScore >= results[results.length - 1].matchScore);
});

test("una propiedad PAUSADA no busca solicitudes compatibles (lista vacía)", async () => {
  const { profile } = await makeAgent();
  const property = await makeMatchingProperty(profile.id);
  await prisma.property.update({ where: { id: property.id }, data: { status: "PAUSADA" } });
  await makeBuyerWithRequest({ sector: "Cumbayá", bedrooms: 3 });

  const results = await listCompatibleRequestsForProperty(profile.id, property.id);
  assert.deepEqual(results, []);
});

test("una propiedad CERRADA no busca solicitudes compatibles (lista vacía)", async () => {
  const { profile } = await makeAgent();
  const property = await makeMatchingProperty(profile.id);
  await prisma.property.update({ where: { id: property.id }, data: { status: "CERRADA" } });
  await makeBuyerWithRequest({ sector: "Cumbayá", bedrooms: 3 });

  const results = await listCompatibleRequestsForProperty(profile.id, property.id);
  assert.deepEqual(results, []);
});

test("una solicitud PAUSADA queda excluida del resultado", async () => {
  const { profile } = await makeAgent();
  const property = await makeMatchingProperty(profile.id);
  const { request } = await makeBuyerWithRequest({ status: "PAUSADA" });

  const results = await listCompatibleRequestsForProperty(profile.id, property.id);
  assert.ok(!results.some((r) => r.id === request.id));
});

test("una solicitud CERRADA queda excluida del resultado", async () => {
  const { profile } = await makeAgent();
  const property = await makeMatchingProperty(profile.id);
  const { request } = await makeBuyerWithRequest({ status: "CERRADA" });

  const results = await listCompatibleRequestsForProperty(profile.id, property.id);
  assert.ok(!results.some((r) => r.id === request.id));
});

test("una solicitud EN_PROCESO sigue siendo elegible", async () => {
  const { profile } = await makeAgent();
  const property = await makeMatchingProperty(profile.id);
  const { request } = await makeBuyerWithRequest({ status: "EN_PROCESO" });

  const results = await listCompatibleRequestsForProperty(profile.id, property.id);
  assert.ok(results.some((r) => r.id === request.id));
});

test("una solicitud con operación distinta no aparece aunque todo lo demás coincida", async () => {
  const { profile } = await makeAgent();
  const property = await makeMatchingProperty(profile.id, { operationType: "COMPRAR" });
  const { request } = await makeBuyerWithRequest({ operationType: "ALQUILAR" });

  const results = await listCompatibleRequestsForProperty(profile.id, property.id);
  assert.ok(!results.some((r) => r.id === request.id));
});

test("un score por debajo del umbral queda excluido del resultado", async () => {
  const { profile } = await makeAgent();
  const property = await makeMatchingProperty(profile.id, {
    price: 500000, // muy por encima del presupuesto de la solicitud
    bedrooms: 1, // muy por debajo de lo pedido
    squareMeters: 20, // muy por debajo de lo pedido
  });
  const { request } = await makeBuyerWithRequest({
    sector: "Otro sector distinto",
    priceMax: 100000,
    bedrooms: 4,
    minSquareMeters: 150,
  });

  const results = await listCompatibleRequestsForProperty(profile.id, property.id);
  assert.ok(!results.some((r) => r.id === request.id));
  assert.ok(
    results.every((r) => r.matchScore >= PROPERTY_MATCH_THRESHOLD),
    "ningún resultado debería tener matchScore bajo el umbral",
  );
});

test("un agente no puede listar compatibles de una propiedad que no le pertenece", async () => {
  const { profile: agentA } = await makeAgent();
  const { profile: agentB } = await makeAgent();
  const property = await makeMatchingProperty(agentB.id);

  await assert.rejects(() => listCompatibleRequestsForProperty(agentA.id, property.id));
});

test("el resultado nunca incluye contactName, contactPhone ni contactEmail", async () => {
  const { profile } = await makeAgent();
  const property = await makeMatchingProperty(profile.id);
  const { request } = await makeBuyerWithRequest({ sector: "Cumbayá", bedrooms: 3 });

  const results = await listCompatibleRequestsForProperty(profile.id, property.id);
  const match = results.find((r) => r.id === request.id);
  assert.ok(match, "la solicitud debería aparecer como compatible");
  assert.ok(!("contactName" in match!));
  assert.ok(!("contactPhone" in match!));
  assert.ok(!("contactEmail" in match!));
});
