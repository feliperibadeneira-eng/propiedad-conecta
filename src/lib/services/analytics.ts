import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

export type AnalyticsEventType =
  | "request_created"
  | "lead_viewed"
  | "lead_unlock_started"
  | "lead_purchased"
  | "contact_revealed"
  | "lead_contacted"
  | "lead_reactivated"
  | "lead_released"
  | "request_closed";

export async function logEvent(
  type: AnalyticsEventType,
  data: {
    userId?: string;
    requestId?: string;
    agentId?: string;
    metadata?: Record<string, unknown>;
  } = {},
): Promise<void> {
  await prisma.analyticsEvent.create({
    data: {
      type,
      userId: data.userId,
      requestId: data.requestId,
      agentId: data.agentId,
      metadata: data.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}
