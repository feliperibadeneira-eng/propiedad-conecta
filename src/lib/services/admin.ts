import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/services/audit";
import { OCCUPYING_STATUSES } from "@/lib/services/constants";
import type { RequestStatus } from "@/generated/prisma/enums";

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
