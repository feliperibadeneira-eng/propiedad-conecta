import { prisma } from "@/lib/db";
import type { OperationType } from "@/generated/prisma/enums";

// Sección 6: el costo de desbloquear un lead depende del tipo de
// operación, no es un precio fijo configurable por el comprador.
const UNLOCK_COST: Record<OperationType, number> = {
  COMPRAR: 10,
  ALQUILAR: 2,
};

export function getUnlockCost(operationType: OperationType): number {
  return UNLOCK_COST[operationType];
}

export async function listCreditLedger(agentProfileId: string, limit = 20) {
  return prisma.creditLedgerEntry.findMany({
    where: { agentId: agentProfileId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
