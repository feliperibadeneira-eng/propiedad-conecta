import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/services/audit";
import { OCCUPYING_STATUSES } from "@/lib/services/constants";
import type { RequestStatus, UserRole, OperationType } from "@/generated/prisma/enums";

export async function listUsers(role?: "BUYER" | "AGENT" | "ADMIN") {
  return prisma.user.findMany({
    where: role ? { role } : undefined,
    orderBy: { createdAt: "desc" },
    include: { buyerProfile: true, agentProfile: true },
  });
}

export async function setUserActive(
  adminUserId: string,
  userId: string,
  active: boolean,
) {
  await prisma.user.update({ where: { id: userId }, data: { active } });
  await logAudit({
    userId: adminUserId,
    action: active ? "USER_ACTIVATED" : "USER_BLOCKED",
    entityType: "User",
    entityId: userId,
  });
}

export async function listAllRequests(filters: {
  status?: RequestStatus;
  search?: string;
}) {
  const requests = await prisma.propertyRequest.findMany({
    where: {
      status: filters.status,
      OR: filters.search
        ? [
            { ciudad: { contains: filters.search, mode: "insensitive" } },
            { sector: { contains: filters.search, mode: "insensitive" } },
            { contactName: { contains: filters.search, mode: "insensitive" } },
          ]
        : undefined,
    },
    include: { purchases: true, buyer: { include: { user: true } } },
    orderBy: { createdAt: "desc" },
  });
  return requests.map((r) => ({
    ...r,
    connectedAgents: r.purchases.filter((p) =>
      OCCUPYING_STATUSES.includes(p.status),
    ).length,
  }));
}

export async function adminSetRequestStatus(
  adminUserId: string,
  requestId: string,
  status: RequestStatus,
) {
  await prisma.propertyRequest.update({ where: { id: requestId }, data: { status } });
  await logAudit({
    userId: adminUserId,
    action: "REQUEST_STATUS_CHANGED",
    entityType: "PropertyRequest",
    entityId: requestId,
    metadata: { status },
  });
}

export async function listLeadPurchases() {
  return prisma.leadPurchase.findMany({
    include: {
      request: { include: { buyer: { include: { user: true } } } },
      agent: { include: { user: true } },
      payment: true,
    },
    orderBy: { purchasedAt: "desc" },
  });
}

export async function listPayments() {
  return prisma.payment.findMany({
    include: {
      agent: { include: { user: true } },
      request: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

// Sección 8-9: panel de "Solicitudes de devolución" del admin.
export async function listRefundRequests() {
  return prisma.leadPurchase.findMany({
    where: { status: { in: ["REFUND_REQUESTED", "REFUNDED", "CLOSED"] } },
    include: {
      request: { include: { buyer: { include: { user: true } } } },
      agent: { include: { user: true } },
    },
    orderBy: { refundRequestedAt: "desc" },
  });
}

export async function getDashboardMetrics() {
  const [
    buyers,
    agents,
    requestsCreated,
    requestsActive,
    leadsSold,
    creditsAgg,
    pendingRefunds,
    purchasesForAvgTime,
  ] = await Promise.all([
    prisma.user.count({ where: { role: "BUYER" } }),
    prisma.user.count({ where: { role: "AGENT" } }),
    prisma.propertyRequest.count(),
    prisma.propertyRequest.count({
      where: { status: { in: ["BUSCANDO", "EN_PROCESO"] } },
    }),
    prisma.leadPurchase.count(),
    prisma.leadPurchase.aggregate({ _sum: { creditsUsed: true } }),
    prisma.leadPurchase.count({ where: { status: "REFUND_REQUESTED" } }),
    prisma.propertyRequest.findMany({
      where: { purchases: { some: {} } },
      include: { purchases: { orderBy: { purchasedAt: "asc" }, take: 1 } },
    }),
  ]);

  const activeAgents = await prisma.leadPurchase
    .groupBy({ by: ["agentId"] })
    .then((g) => g.length);

  const avgTimeToFirstPurchaseHours = (() => {
    const diffs = purchasesForAvgTime
      .map((r) => {
        const first = r.purchases[0];
        if (!first) return null;
        return (first.purchasedAt.getTime() - r.createdAt.getTime()) / 36e5;
      })
      .filter((v): v is number => v != null);
    if (diffs.length === 0) return null;
    return diffs.reduce((a, b) => a + b, 0) / diffs.length;
  })();

  const avgAgentsPerRequest =
    requestsCreated > 0 ? leadsSold / requestsCreated : 0;

  return {
    buyers,
    agents,
    activeAgents,
    requestsCreated,
    requestsActive,
    leadsSold,
    creditsConsumed: creditsAgg._sum.creditsUsed ?? 0,
    pendingRefunds,
    conversionRate: requestsCreated > 0 ? leadsSold / requestsCreated : 0,
    avgAgentsPerRequest,
    avgTimeToFirstPurchaseHours,
  };
}

function sumCountsByRole(groups: { role: UserRole; _count: number }[]) {
  const result: Record<UserRole, number> = { BUYER: 0, AGENT: 0, ADMIN: 0 };
  for (const g of groups) result[g.role] = g._count;
  return result;
}

function sumCountsByOperation(
  groups: { operationType: OperationType; _count: number }[],
) {
  const result: Record<OperationType, number> = { COMPRAR: 0, ALQUILAR: 0 };
  for (const g of groups) result[g.operationType] = g._count;
  return result;
}

function sumCountsByStatus(groups: { status: RequestStatus; _count: number }[]) {
  const result: Record<RequestStatus, number> = {
    BUSCANDO: 0,
    EN_PROCESO: 0,
    PAUSADA: 0,
    CERRADA: 0,
  };
  for (const g of groups) result[g.status] = g._count;
  return result;
}

// /admin/metricas: agregados de solo lectura para medir si el marketplace
// está funcionando. No llama a requireAdmin() acá — mismo patrón que el
// resto de este archivo (listUsers, getDashboardMetrics, etc.): esto es
// una función plana, no una Server Action ni una ruta API, así que no
// hay forma de invocarla desde el cliente. La protección real vive en
// que admin/metricas/page.tsx (el único caller) llama requireAdmin()
// antes de invocarla — igual que ya protege /admin, /admin/usuarios, etc.
//
// "Compra de créditos" en todo este archivo significa específicamente
// CreditPurchaseRequest con status=APPROVED (pago manual ya confirmado
// por un admin) — nunca PENDING ni REJECTED. CreditLedgerEntry no sirve
// para esto: ahí también están el saldo inicial gratis de cada agente
// nuevo (STARTING_BALANCE) y los descuentos por desbloqueo, que no son
// ingresos reales.
//
// Propiedad Conecta opera en Ecuador (UTC-5 todo el año, sin horario de
// verano) — "Hoy" tiene que ser el día calendario de Ecuador, no el día
// UTC del servidor. No hay ninguna constante de timezone en el proyecto
// (se buscó en lib/format.ts y layout.tsx: no existe), así que se define
// acá, donde se usa.
const ECUADOR_UTC_OFFSET_HOURS = -5;
const ECUADOR_UTC_OFFSET_MS = ECUADOR_UTC_OFFSET_HOURS * 60 * 60 * 1000;

// Medianoche de Ecuador expresada como el instante UTC correcto (ej.
// medianoche del 3 de octubre en Ecuador = 2026-10-03T05:00:00Z, no
// 2026-10-03T00:00:00Z). Técnica estándar sin librerías: se desplaza
// `now` por el offset para leer la fecha-calendario tal como la vería
// alguien en Ecuador con los getters de UTC, y se arma la medianoche de
// ese día para después deshacer el desplazamiento.
export function ecuadorTodayStart(now: Date): Date {
  const shifted = new Date(now.getTime() + ECUADOR_UTC_OFFSET_MS);
  return new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) -
      ECUADOR_UTC_OFFSET_MS,
  );
}

export async function getMarketplaceMetrics() {
  const now = new Date();
  const todayStart = ecuadorTodayStart(now);
  // "Últimos 7/30 días" son ventanas corridas (now − N×24h), no un rango
  // de días-calendario — no dependen de ninguna zona horaria: un evento
  // de hace exactamente 6 días y 23 horas cae dentro sin importar en qué
  // huso se mire el reloj. Solo "Hoy" necesitaba el ajuste de arriba.
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    usersByRoleRaw,
    requestsByOperationRaw,
    requestsByStatusRaw,
    totalRequests,
    totalLeadPurchases,
    agentsWithUnlockGroups,
    totalAgents,
    approvedCreditAgg,
    agentsWithApprovedPurchaseGroups,
    usersToday,
    users7d,
    users30d,
    requestsToday,
    requests7d,
    requests30d,
    leadsToday,
    leads7d,
    leads30d,
    creditPurchasesToday,
    creditPurchases7d,
    creditPurchases30d,
  ] = await Promise.all([
    prisma.user.groupBy({ by: ["role"], _count: true }),
    prisma.propertyRequest.groupBy({ by: ["operationType"], _count: true }),
    prisma.propertyRequest.groupBy({ by: ["status"], _count: true }),
    prisma.propertyRequest.count(),
    prisma.leadPurchase.count(),
    prisma.leadPurchase.groupBy({ by: ["agentId"] }),
    prisma.agentProfile.count(),
    prisma.creditPurchaseRequest.aggregate({
      where: { status: "APPROVED" },
      _sum: { credits: true, amount: true },
      _count: true,
    }),
    prisma.creditPurchaseRequest.groupBy({
      by: ["agentId"],
      where: { status: "APPROVED" },
    }),
    prisma.user.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.propertyRequest.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.propertyRequest.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.propertyRequest.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.leadPurchase.count({ where: { purchasedAt: { gte: todayStart } } }),
    prisma.leadPurchase.count({ where: { purchasedAt: { gte: sevenDaysAgo } } }),
    prisma.leadPurchase.count({ where: { purchasedAt: { gte: thirtyDaysAgo } } }),
    prisma.creditPurchaseRequest.count({
      where: { status: "APPROVED", reviewedAt: { gte: todayStart } },
    }),
    prisma.creditPurchaseRequest.count({
      where: { status: "APPROVED", reviewedAt: { gte: sevenDaysAgo } },
    }),
    prisma.creditPurchaseRequest.count({
      where: { status: "APPROVED", reviewedAt: { gte: thirtyDaysAgo } },
    }),
  ]);

  const roleCounts = sumCountsByRole(usersByRoleRaw);
  const { BUYER: buyers, AGENT: agents, ADMIN: admins } = roleCounts;
  const totalUsers = buyers + agents + admins;

  const operationCounts = sumCountsByOperation(requestsByOperationRaw);
  const { COMPRAR: comprar, ALQUILAR: alquilar } = operationCounts;

  const statusCounts = sumCountsByStatus(requestsByStatusRaw);
  const requestsActive = statusCounts.BUSCANDO + statusCounts.EN_PROCESO;
  const requestsPaused = statusCounts.PAUSADA;
  const requestsClosed = statusCounts.CERRADA;

  const agentsWithUnlock = agentsWithUnlockGroups.length;
  const agentsWithoutUnlock = Math.max(0, totalAgents - agentsWithUnlock);
  const avgLeadsPerActiveAgent =
    agentsWithUnlock > 0 ? totalLeadPurchases / agentsWithUnlock : null;

  const creditsSold = approvedCreditAgg._sum.credits ?? 0;
  const revenue = approvedCreditAgg._sum.amount ?? 0;
  const approvedCreditPurchases = approvedCreditAgg._count;
  const agentsWhoPurchasedCredits = agentsWithApprovedPurchaseGroups.length;

  return {
    users: { total: totalUsers, buyers, agents, admins },
    requests: {
      total: totalRequests,
      comprar,
      alquilar,
      active: requestsActive,
      paused: requestsPaused,
      closed: requestsClosed,
    },
    leads: {
      unlocked: totalLeadPurchases,
      agentsWithUnlock,
      avgLeadsPerActiveAgent,
    },
    credits: {
      sold: creditsSold,
      revenue,
      approvedPurchases: approvedCreditPurchases,
    },
    funnel: {
      users: totalUsers,
      requests: totalRequests,
      agents: totalAgents,
      leadsUnlocked: totalLeadPurchases,
      creditPurchases: approvedCreditPurchases,
    },
    demandType: { comprar, alquilar, total: comprar + alquilar },
    agentsActivity: {
      total: totalAgents,
      withUnlock: agentsWithUnlock,
      withoutUnlock: agentsWithoutUnlock,
      totalUnlocked: totalLeadPurchases,
      avgLeadsPerActiveAgent,
      whoPurchasedCredits: agentsWhoPurchasedCredits,
    },
    recentActivity: {
      users: { today: usersToday, last7Days: users7d, last30Days: users30d },
      requests: { today: requestsToday, last7Days: requests7d, last30Days: requests30d },
      leadsUnlocked: { today: leadsToday, last7Days: leads7d, last30Days: leads30d },
      creditPurchases: {
        today: creditPurchasesToday,
        last7Days: creditPurchases7d,
        last30Days: creditPurchases30d,
      },
    },
  };
}
