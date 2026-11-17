import { prisma, type Db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

// `db` acepta un `tx` de una transacción abierta (default: el cliente
// global) para que el registro de auditoría pueda ser atómico con el
// cambio de negocio que lo origina, en vez de una escritura separada
// después del commit.
export async function logAudit(
  params: {
    userId?: string | null;
    action: string;
    entityType: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  },
  db: Db = prisma,
): Promise<void> {
  await db.auditLog.create({
    data: {
      userId: params.userId ?? undefined,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      metadata: params.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}
