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
  | "request_closed"
  // Protección de contacto (ver ContactExchange.protectedUntil en
  // purchase.ts). Deliberadamente "access_granted", no "released" /
  // "liberado" — ese vocabulario ya significa "el agente devuelve el lead
  // al pool" (lead_released / releaseLead). Ninguno de estos tres se
  // dispara todavía: quedan reservados para cuando exista el punto real de
  // acceso al contacto (bloqueo efectivo + consentimiento), fuera de
  // alcance de este cambio.
  | "contact_protection_started"
  | "contact_access_granted_by_timeout"
  | "contact_access_granted_by_consent";

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
