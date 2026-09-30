// Datos de ejemplo para desarrollo y demo. Ejecutar con: npm run db:seed
// Es idempotente: borra y recrea los datos de ejemplo cada vez.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/lib/password";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const DEMO_PASSWORD = "demo1234";

async function main() {
  const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000);

  console.log("Borrando datos previos...");
  await prisma.analyticsEvent.deleteMany();
  await prisma.leadStatusHistory.deleteMany();
  await prisma.contactExchange.deleteMany();
  await prisma.creditLedgerEntry.deleteMany();
  await prisma.creditPurchaseRequest.deleteMany();
  await prisma.leadPurchase.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.requestFeature.deleteMany();
  await prisma.propertyRequest.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.session.deleteMany();
  await prisma.agentProfile.deleteMany();
  await prisma.buyerProfile.deleteMany();
  await prisma.user.deleteMany();
  await prisma.adminSetting.deleteMany();

  console.log("Configuración inicial...");
  await prisma.adminSetting.createMany({
    data: [
      { key: "lead_price_default", value: "15" },
      { key: "lead_price_basic", value: "10" },
      { key: "lead_price_qualified", value: "20" },
      { key: "lead_price_premium", value: "35" },
      { key: "max_agents_default", value: "3" },
      { key: "reactivation_hours", value: "48" },
      { key: "refund_eligible_hours", value: "48" },
      { key: "starting_credits", value: "20" },
    ],
  });

  console.log("Administrador...");
  const admin = await prisma.user.create({
    data: {
      email: "demo-admin@propertymatch.test",
      passwordHash: await hashPassword(DEMO_PASSWORD),
      name: "Admin PropertyMatch",
      role: "ADMIN",
    },
  });

  console.log("Agentes (5)...");
  const agentSeeds = [
    {
      email: "demo-agente@propertymatch.test",
      name: "María Fernanda Ortiz",
      phone: "0991234567",
      company: "Ortiz Bienes Raíces",
      city: "Quito",
      yearsExperience: 6,
      workAreas: ["Quito", "Cumbayá", "Tumbaco"],
      propertyTypes: ["DEPARTAMENTO", "CASA"] as const,
      description: "Especialista en el valle de Cumbayá y Tumbaco.",
    },
    {
      email: "agente2@propertymatch.test",
      name: "Carlos Andrade",
      phone: "0987654321",
      company: "Andrade Propiedades",
      city: "Guayaquil",
      yearsExperience: 10,
      workAreas: ["Guayaquil", "Samborondón", "Durán"],
      propertyTypes: ["CASA", "DEPARTAMENTO", "BODEGA"] as const,
      description: "10 años vendiendo en Guayaquil y Samborondón.",
    },
    {
      email: "agente3@propertymatch.test",
      name: "Gabriela Salazar",
      phone: "0976543210",
      company: null,
      city: "Cuenca",
      yearsExperience: 3,
      workAreas: ["Cuenca"],
      propertyTypes: ["CASA", "DEPARTAMENTO"] as const,
      description: "Asesora independiente en Cuenca, enfocada en alquileres.",
    },
    {
      email: "agente4@propertymatch.test",
      name: "Diego Paredes",
      phone: "0965432109",
      company: "Paredes Comercial",
      city: "Quito",
      yearsExperience: 8,
      workAreas: ["Quito", "Manta"],
      propertyTypes: ["OFICINA", "LOCAL_COMERCIAL", "BODEGA"] as const,
      description: "Propiedades comerciales e industriales.",
      // Demo de "agente sin créditos" (sección 12): sin saldo inicial, para
      // poder probar el aviso "No tienes suficientes créditos" y el flujo
      // de compra desde cero.
      startingCredits: 0,
    },
    {
      email: "agente5@propertymatch.test",
      name: "Valentina Ríos",
      phone: "0954321098",
      company: "Ríos Inmobiliaria",
      city: "Manta",
      yearsExperience: 5,
      workAreas: ["Manta", "Machala"],
      propertyTypes: ["TERRENO", "CASA"] as const,
      description: "Terrenos y casas de playa en la costa.",
    },
  ];

  const agents = [];
  for (const a of agentSeeds) {
    const startingCredits = a.startingCredits ?? 20;
    const user = await prisma.user.create({
      data: {
        email: a.email,
        passwordHash: await hashPassword(DEMO_PASSWORD),
        name: a.name,
        phone: a.phone,
        role: "AGENT",
      },
    });
    const profile = await prisma.agentProfile.create({
      data: {
        userId: user.id,
        whatsapp: a.phone,
        company: a.company,
        city: a.city,
        yearsExperience: a.yearsExperience,
        workAreas: [...a.workAreas],
        propertyTypes: [...a.propertyTypes],
        description: a.description,
        creditsBalance: startingCredits,
      },
    });
    if (startingCredits > 0) await prisma.creditLedgerEntry.create({
      data: {
        agentId: profile.id,
        amount: startingCredits,
        balanceAfter: startingCredits,
        reason: "STARTING_BALANCE",
        description: "Saldo inicial de bienvenida",
      },
    });
    agents.push({ user, profile });
  }

  console.log("Compras de créditos (pendiente/aprobada/rechazada)...");
  // Diego (agents[3]) arrancó sin créditos: le dejamos un pago Starter
  // pendiente, listo para aprobar/rechazar desde /admin/compras-creditos.
  await prisma.creditPurchaseRequest.create({
    data: {
      agentId: agents[3].profile.id,
      package: "STARTER",
      amount: 10,
      credits: 10,
      status: "PENDING",
    },
  });
  // Carlos (agents[1]) ya tiene una compra aprobada en su historial.
  const approvedPurchase = await prisma.creditPurchaseRequest.create({
    data: {
      agentId: agents[1].profile.id,
      package: "PRO",
      amount: 40,
      credits: 50,
      status: "APPROVED",
      reviewedAt: hoursAgo(20),
      reviewedBy: admin.id,
    },
  });
  const carlosAfter = await prisma.agentProfile.update({
    where: { id: agents[1].profile.id },
    data: { creditsBalance: { increment: 50 } },
  });
  await prisma.creditLedgerEntry.create({
    data: {
      agentId: agents[1].profile.id,
      amount: 50,
      balanceAfter: carlosAfter.creditsBalance,
      reason: "CREDIT_PURCHASE_APPROVED",
      description: "Compra de paquete Pro",
      creditPurchaseRequestId: approvedPurchase.id,
      createdAt: hoursAgo(20),
    },
  });
  // Gabriela (agents[2]) tiene una compra rechazada (comprobante inválido).
  await prisma.creditPurchaseRequest.create({
    data: {
      agentId: agents[2].profile.id,
      package: "PREMIUM",
      amount: 75,
      credits: 100,
      status: "REJECTED",
      reviewedAt: hoursAgo(10),
      reviewedBy: admin.id,
      rejectionReason: "No se pudo verificar el comprobante de pago.",
    },
  });

  console.log("Compradores y solicitudes (10)...");
  const buyerSeeds = [
    { email: "demo-comprador@propertymatch.test", name: "Andrés Vega", phone: "0991112222" },
    { email: "comprador2@propertymatch.test", name: "Paola Chávez", phone: "0992223333" },
    { email: "comprador3@propertymatch.test", name: "Luis Morales", phone: "0993334444" },
    { email: "comprador4@propertymatch.test", name: "Sofía Naranjo", phone: "0994445555" },
    { email: "comprador5@propertymatch.test", name: "Jorge Espín", phone: "0995556666" },
  ];

  const buyers = [];
  for (const b of buyerSeeds) {
    const user = await prisma.user.create({
      data: {
        email: b.email,
        passwordHash: await hashPassword(DEMO_PASSWORD),
        name: b.name,
        phone: b.phone,
        role: "BUYER",
      },
    });
    const profile = await prisma.buyerProfile.create({
      data: {
        userId: user.id,
        whatsapp: b.phone,
        contactPreference: "WHATSAPP",
        contactConsent: true,
      },
    });
    buyers.push({ user, profile });
  }

  type Seed = {
    buyer: (typeof buyers)[number];
    operationType: "COMPRAR" | "ALQUILAR";
    propertyType:
      | "DEPARTAMENTO"
      | "CASA"
      | "TERRENO"
      | "OFICINA"
      | "LOCAL_COMERCIAL"
      | "BODEGA"
      | "OTRO";
    provincia: string;
    ciudad: string;
    sector?: string;
    priceMin: number;
    priceMax: number;
    bedrooms?: number;
    bathrooms?: number;
    minSquareMeters?: number;
    parkingSpots?: number;
    features?: Record<string, string>;
    moveInDate?: Date;
    occupation?: string;
    searchReason?: string;
    additionalNotes?: string;
    createdAt: Date;
    purchasedBy?: (typeof agents)[number];
    purchaseStatus?:
      | "PURCHASED"
      | "CONTACTED"
      | "RESPONDED"
      | "REFUND_REQUESTED"
      | "REFUNDED"
      | "APPOINTMENT_SCHEDULED";
  };

  const requestSeeds: Seed[] = [
    {
      buyer: buyers[0],
      operationType: "COMPRAR",
      propertyType: "DEPARTAMENTO",
      provincia: "Pichincha",
      ciudad: "Quito",
      sector: "Cumbayá",
      priceMin: 150000,
      priceMax: 200000,
      bedrooms: 3,
      bathrooms: 2,
      minSquareMeters: 120,
      parkingSpots: 2,
      features: { hasSecurity: "true", hasPool: "true" },
      moveInDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      occupation: "Soy ingeniera y trabajo en una empresa privada en Quito.",
      searchReason: "Busco mi primera vivienda porque quiero independizarme.",
      additionalNotes: "Me gustaría mudarme en los próximos 2 meses, ya tengo crédito hipotecario aprobado.",
      createdAt: hoursAgo(2),
      purchasedBy: agents[0],
      purchaseStatus: "CONTACTED",
    },
    {
      buyer: buyers[1],
      operationType: "COMPRAR",
      propertyType: "CASA",
      provincia: "Guayas",
      ciudad: "Samborondón",
      priceMin: 250000,
      priceMax: 350000,
      bedrooms: 4,
      bathrooms: 3,
      minSquareMeters: 220,
      parkingSpots: 2,
      features: { hasPool: "true", hasSecurity: "true" },
      createdAt: hoursAgo(5),
    },
    {
      buyer: buyers[2],
      operationType: "COMPRAR",
      propertyType: "DEPARTAMENTO",
      provincia: "Guayas",
      ciudad: "Guayaquil",
      sector: "Urdesa",
      priceMin: 90000,
      priceMax: 130000,
      bedrooms: 2,
      bathrooms: 2,
      minSquareMeters: 80,
      createdAt: hoursAgo(8),
      purchasedBy: agents[1],
      purchaseStatus: "PURCHASED",
    },
    {
      buyer: buyers[3],
      operationType: "COMPRAR",
      propertyType: "TERRENO",
      provincia: "Manabí",
      ciudad: "Manta",
      priceMin: 80000,
      priceMax: 120000,
      minSquareMeters: 500,
      createdAt: hoursAgo(20),
    },
    {
      buyer: buyers[4],
      operationType: "ALQUILAR",
      propertyType: "OFICINA",
      provincia: "Pichincha",
      ciudad: "Quito",
      sector: "La Carolina",
      priceMin: 800,
      priceMax: 1500,
      minSquareMeters: 60,
      parkingSpots: 1,
      createdAt: hoursAgo(30),
    },
    {
      buyer: buyers[0],
      operationType: "ALQUILAR",
      propertyType: "CASA",
      provincia: "Azuay",
      ciudad: "Cuenca",
      priceMin: 600,
      priceMax: 900,
      bedrooms: 3,
      bathrooms: 2,
      features: { furnished: "true" },
      createdAt: hoursAgo(50),
      purchasedBy: agents[2],
      purchaseStatus: "RESPONDED",
    },
    {
      buyer: buyers[1],
      operationType: "ALQUILAR",
      propertyType: "LOCAL_COMERCIAL",
      provincia: "Guayas",
      ciudad: "Guayaquil",
      sector: "Urdesa",
      priceMin: 1200,
      priceMax: 2000,
      minSquareMeters: 80,
      createdAt: hoursAgo(60),
    },
    {
      buyer: buyers[2],
      operationType: "COMPRAR",
      propertyType: "DEPARTAMENTO",
      provincia: "Pichincha",
      ciudad: "Quito",
      sector: "González Suárez",
      priceMin: 200000,
      priceMax: 280000,
      bedrooms: 2,
      bathrooms: 2,
      features: { furnished: "true", hasSecurity: "true" },
      createdAt: hoursAgo(70),
    },
    {
      buyer: buyers[3],
      operationType: "COMPRAR",
      propertyType: "BODEGA",
      provincia: "Guayas",
      ciudad: "Durán",
      priceMin: 60000,
      priceMax: 90000,
      minSquareMeters: 300,
      parkingSpots: 3,
      createdAt: hoursAgo(90),
    },
    {
      buyer: buyers[4],
      operationType: "COMPRAR",
      propertyType: "CASA",
      provincia: "El Oro",
      ciudad: "Machala",
      priceMin: 130000,
      priceMax: 180000,
      bedrooms: 3,
      bathrooms: 2,
      features: { hasPatio: "true" },
      createdAt: hoursAgo(100),
      purchasedBy: agents[4],
      purchaseStatus: "REFUND_REQUESTED",
    },
  ];

  for (const s of requestSeeds) {
    const request = await prisma.propertyRequest.create({
      data: {
        buyerId: s.buyer.profile.id,
        operationType: s.operationType,
        propertyType: s.propertyType,
        provincia: s.provincia,
        ciudad: s.ciudad,
        sector: s.sector,
        priceMin: s.priceMin,
        priceMax: s.priceMax,
        bedrooms: s.bedrooms,
        bathrooms: s.bathrooms,
        minSquareMeters: s.minSquareMeters,
        parkingSpots: s.parkingSpots,
        moveInDate: s.moveInDate,
        occupation: s.occupation,
        searchReason: s.searchReason,
        additionalNotes: s.additionalNotes,
        contactName: s.buyer.user.name,
        contactPhone: s.buyer.user.phone!,
        contactEmail: s.buyer.user.email,
        contactPreference: "WHATSAPP",
        dataSharingConsent: true,
        maxAgents: 3,
        leadPrice: 15,
        createdAt: s.createdAt,
        updatedAt: s.createdAt,
        features: s.features
          ? { create: Object.entries(s.features).map(([key, value]) => ({ key, value })) }
          : undefined,
      },
    });

    if (s.purchasedBy) {
      const cost = s.operationType === "COMPRAR" ? 10 : 2;
      const payment = await prisma.payment.create({
        data: {
          agentId: s.purchasedBy.profile.id,
          requestId: request.id,
          amount: cost,
          currency: "credit",
          status: "SUCCEEDED",
          confirmedAt: s.createdAt,
          createdAt: s.createdAt,
        },
      });
      const status = s.purchaseStatus ?? "PURCHASED";
      const contactedAt =
        status === "CONTACTED" ||
        status === "RESPONDED" ||
        status === "REFUND_REQUESTED" ||
        status === "APPOINTMENT_SCHEDULED"
          ? new Date(s.createdAt.getTime() + 60 * 60 * 1000)
          : null;
      const leadPurchase = await prisma.leadPurchase.create({
        data: {
          requestId: request.id,
          agentId: s.purchasedBy.profile.id,
          paymentId: payment.id,
          pricePaid: cost,
          creditsUsed: cost,
          status,
          purchasedAt: s.createdAt,
          contactedAt,
          refundRequestedAt: status === "REFUND_REQUESTED" ? hoursAgo(1) : null,
        },
      });
      await prisma.contactExchange.create({
        data: {
          requestId: request.id,
          leadPurchaseId: leadPurchase.id,
          buyerId: s.buyer.user.id,
          agentId: s.purchasedBy.user.id,
        },
      });
      await prisma.propertyRequest.update({
        where: { id: request.id },
        data: { status: "EN_PROCESO" },
      });

      // Descontar el crédito y dejarlo en el ledger, igual que haría
      // purchaseWithCredits, para que el balance y el ledger coincidan.
      const agentAfter = await prisma.agentProfile.update({
        where: { id: s.purchasedBy.profile.id },
        data: { creditsBalance: { decrement: cost } },
      });
      await prisma.creditLedgerEntry.create({
        data: {
          agentId: s.purchasedBy.profile.id,
          amount: -cost,
          balanceAfter: agentAfter.creditsBalance,
          reason: "LEAD_UNLOCK",
          leadPurchaseId: leadPurchase.id,
          createdAt: s.createdAt,
        },
      });

      if (status === "REFUNDED") {
        const refunded = await prisma.agentProfile.update({
          where: { id: s.purchasedBy.profile.id },
          data: { creditsBalance: { increment: cost } },
        });
        await prisma.creditLedgerEntry.create({
          data: {
            agentId: s.purchasedBy.profile.id,
            amount: cost,
            balanceAfter: refunded.creditsBalance,
            reason: "REFUND_APPROVED",
            leadPurchaseId: leadPurchase.id,
          },
        });
      }
    }
  }

  console.log("\nListo. Cuentas demo (contraseña: demo1234):");
  console.log(`  Admin:  ${admin.email}`);
  for (const a of agents) console.log(`  Agente: ${a.user.email} (${a.user.name})`);
  for (const b of buyers) console.log(`  Buyer:  ${b.user.email} (${b.user.name})`);
  console.log(
    "\nCompras de créditos demo: agente4 (0 créditos, pago Starter pendiente), " +
      "agente2 (compra Pro aprobada), agente3 (compra Premium rechazada). Ver /admin/compras-creditos.",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
