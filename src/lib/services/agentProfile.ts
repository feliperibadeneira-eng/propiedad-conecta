import { prisma } from "@/lib/db";
import type { AgentProfileInput } from "@/lib/validators/profile";
import { OCCUPYING_STATUSES } from "@/lib/services/constants";

export async function updateAgentProfile(
  userId: string,
  agentProfileId: string,
  input: AgentProfileInput,
) {
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { name: input.name, phone: input.phone },
    }),
    prisma.agentProfile.update({
      where: { id: agentProfileId },
      data: {
        whatsapp: input.whatsapp || null,
        company: input.company || null,
        city: input.city || null,
        yearsExperience: input.yearsExperience,
        workAreas: input.workAreas,
        propertyTypes: input.propertyTypes,
        description: input.description || null,
      },
    }),
  ]);
}

export async function getAgentStats(agentProfileId: string) {
  const purchases = await prisma.leadPurchase.findMany({
    where: { agentId: agentProfileId },
  });
  const total = purchases.length;
  const contacted = purchases.filter((p) => p.status === "CONTACTED").length;
  const released = purchases.filter((p) => p.status === "RELEASED").length;
  const active = purchases.filter((p) =>
    OCCUPYING_STATUSES.includes(p.status),
  ).length;

  return {
    totalPurchased: total,
    totalContacted: contacted,
    totalReleased: released,
    activeLeads: active,
    contactRate: total > 0 ? contacted / total : 0,
  };
}

// Resumen para "Mis leads" (sección 11 de la garantía de créditos).
// `creditsBalance` ya no es parte de este resultado — el único caller lo
// toma de la sesión (requireAgent()), que ya lo trae; evita la consulta de
// AgentProfile que esto hacía solo por ese campo.
export async function getAgentLeadDashboard(agentProfileId: string) {
  const purchases = await prisma.leadPurchase.findMany({
    where: { agentId: agentProfileId },
  });

  return {
    total: purchases.length,
    nuevos: purchases.filter((p) => p.status === "PURCHASED").length,
    contactados: purchases.filter((p) => p.status === "CONTACTED").length,
    respondieron: purchases.filter((p) => p.status === "RESPONDED").length,
    devolucionPendiente: purchases.filter(
      (p) => p.status === "REFUND_REQUESTED",
    ).length,
    devueltos: purchases.filter((p) => p.status === "REFUNDED").length,
  };
}

export async function getCreditsBalance(agentProfileId: string): Promise<number> {
  const agent = await prisma.agentProfile.findUniqueOrThrow({
    where: { id: agentProfileId },
    select: { creditsBalance: true },
  });
  return agent.creditsBalance;
}
