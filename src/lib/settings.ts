import { prisma } from "@/lib/db";

// Configuración editable desde /admin (sección 25). Todo tiene un default
// razonable para que el seed y el modo demo funcionen sin tocar nada.
export const SETTINGS = {
  leadPriceBasic: { key: "lead_price_basic", default: "10" },
  leadPriceQualified: { key: "lead_price_qualified", default: "20" },
  leadPricePremium: { key: "lead_price_premium", default: "35" },
  leadPriceDefault: { key: "lead_price_default", default: "15" },
  maxAgentsDefault: { key: "max_agents_default", default: "3" },
  reactivationHours: { key: "reactivation_hours", default: "48" },
  // Sección 7: horas mínimas desde que el agente marca "Contacté al lead"
  // antes de poder pedir la devolución del crédito.
  refundEligibleHours: { key: "refund_eligible_hours", default: "48" },
  startingCredits: { key: "starting_credits", default: "20" },
  // Sección 4: instrucciones de pago manual para comprar créditos. Vacío
  // por defecto a propósito — nunca inventamos datos bancarios; el admin
  // los carga desde /admin/configuracion cuando los tenga.
  paymentInstructions: { key: "payment_instructions", default: "" },
} as const;

type SettingDef = (typeof SETTINGS)[keyof typeof SETTINGS];

async function getSetting(def: SettingDef): Promise<string> {
  const row = await prisma.adminSetting.findUnique({ where: { key: def.key } });
  return row?.value ?? def.default;
}

export async function getSettingNumber(def: SettingDef): Promise<number> {
  return Number(await getSetting(def));
}

export async function setSetting(def: SettingDef, value: string): Promise<void> {
  await prisma.adminSetting.upsert({
    where: { key: def.key },
    create: { key: def.key, value },
    update: { value },
  });
}

export async function getAllSettings() {
  const entries = await Promise.all(
    Object.entries(SETTINGS).map(async ([name, def]) => [
      name,
      await getSetting(def),
    ]),
  );
  return Object.fromEntries(entries) as Record<keyof typeof SETTINGS, string>;
}

export async function getDefaultLeadPrice(): Promise<number> {
  return getSettingNumber(SETTINGS.leadPriceDefault);
}

export async function getDefaultMaxAgents(): Promise<number> {
  return getSettingNumber(SETTINGS.maxAgentsDefault);
}

export async function getReactivationHours(): Promise<number> {
  return getSettingNumber(SETTINGS.reactivationHours);
}

export async function getRefundEligibleHours(): Promise<number> {
  return getSettingNumber(SETTINGS.refundEligibleHours);
}

export async function getStartingCredits(): Promise<number> {
  return getSettingNumber(SETTINGS.startingCredits);
}

export async function getPaymentInstructions(): Promise<string> {
  return getSetting(SETTINGS.paymentInstructions);
}
