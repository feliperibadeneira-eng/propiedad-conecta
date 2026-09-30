import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

export type NotificationType =
  | "request_confirmed"
  | "lead_purchased_buyer"
  | "lead_purchased_agent"
  | "lead_reactivated"
  | "credit_purchase_approved"
  | "credit_purchase_rejected";

export async function notify(
  userId: string,
  type: NotificationType,
  title: string,
  message: string,
  data?: Record<string, unknown>,
): Promise<void> {
  await prisma.notification.create({
    data: { userId, type, title, message, data: data as Prisma.InputJsonValue | undefined },
  });
}

export async function listNotifications(userId: string, limit = 20) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function unreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, read: false } });
}

export async function markAllRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId, read: false },
    data: { read: true },
  });
}
