import { prisma } from "@/lib/db";
import { PurchaseError } from "@/lib/services/purchase";
import { getCreditPackage } from "@/lib/services/creditPackages";
import { logAudit } from "@/lib/services/audit";
import { notify } from "@/lib/services/notifications";
import type { CreditPackageType } from "@/generated/prisma/enums";

const PACKAGE_LABELS: Record<CreditPackageType, string> = {
  STARTER: "Starter",
  PRO: "Pro",
  PREMIUM: "Premium",
};

// Sección 4: el agente elige un paquete y lo manda a revisión. NO se
// acredita ningún crédito acá — eso solo pasa en approveCreditPurchase.
// El comprobante es obligatorio para solicitudes nuevas (lo exige la acción
// que llama a esto, no este servicio), pero la columna sigue siendo
// nullable porque las solicitudes previas a este campo no lo tienen.
export async function createCreditPurchaseRequest(
  agentProfileId: string,
  packageKey: CreditPackageType,
  receipt: { data: Uint8Array<ArrayBuffer>; mimeType: string },
) {
  const pkg = getCreditPackage(packageKey);
  const request = await prisma.creditPurchaseRequest.create({
    data: {
      agentId: agentProfileId,
      package: packageKey,
      amount: pkg.price,
      credits: pkg.credits,
      status: "PENDING",
      receiptImageData: receipt.data,
      receiptImageMimeType: receipt.mimeType,
    },
  });
  return request;
}

export async function listCreditPurchasesForAgent(agentProfileId: string) {
  return prisma.creditPurchaseRequest.findMany({
    where: { agentId: agentProfileId },
    orderBy: { createdAt: "desc" },
    omit: { receiptImageData: true },
  });
}

// omit: receiptImageData en los listados — son potencialmente muchas filas
// y no hace falta traer los bytes completos solo para mostrar una tabla.
// La imagen se lee una sola vez, en /api/comprobantes/[id].
export async function listPendingCreditPurchases() {
  return prisma.creditPurchaseRequest.findMany({
    where: { status: "PENDING" },
    include: { agent: { include: { user: true } } },
    orderBy: { createdAt: "asc" },
    omit: { receiptImageData: true },
  });
}

export async function listAllCreditPurchases() {
  return prisma.creditPurchaseRequest.findMany({
    include: { agent: { include: { user: true } } },
    orderBy: { createdAt: "desc" },
    omit: { receiptImageData: true },
  });
}

// Sección 6: aprobar. Todo dentro de una sola transacción — verificar que
// siga PENDING (compare-and-swap, para que dos admins no puedan aprobar el
// mismo pago dos veces), acreditar los créditos, y dejar constancia en el
// ledger, todo o nada.
export async function approveCreditPurchase(
  adminUserId: string,
  requestId: string,
) {
  const admin = await prisma.user.findUnique({ where: { id: adminUserId } });
  if (!admin || admin.role !== "ADMIN") {
    throw new PurchaseError("Solo un administrador puede aprobar pagos.");
  }

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.creditPurchaseRequest.updateMany({
      where: { id: requestId, status: "PENDING" },
      data: { status: "APPROVED", reviewedAt: new Date(), reviewedBy: adminUserId },
    });
    if (updated.count === 0) {
      throw new PurchaseError(
        "Este pago ya fue procesado o no existe.",
      );
    }

    const purchase = await tx.creditPurchaseRequest.findUniqueOrThrow({
      where: { id: requestId },
    });
    const agentAfter = await tx.agentProfile.update({
      where: { id: purchase.agentId },
      data: { creditsBalance: { increment: purchase.credits } },
    });
    await tx.creditLedgerEntry.create({
      data: {
        agentId: purchase.agentId,
        amount: purchase.credits,
        balanceAfter: agentAfter.creditsBalance,
        reason: "CREDIT_PURCHASE_APPROVED",
        description: `Compra de paquete ${PACKAGE_LABELS[purchase.package]}`,
        creditPurchaseRequestId: purchase.id,
      },
    });
    return purchase;
  });

  await logAudit({
    userId: adminUserId,
    action: "CREDIT_PURCHASE_APPROVED",
    entityType: "CreditPurchaseRequest",
    entityId: requestId,
  });

  const agent = await prisma.agentProfile.findUniqueOrThrow({
    where: { id: result.agentId },
    include: { user: true },
  });
  await notify(
    agent.user.id,
    "credit_purchase_approved",
    "Tu compra de créditos fue aprobada",
    `Se acreditaron ${result.credits} créditos a tu cuenta (paquete ${PACKAGE_LABELS[result.package]}).`,
  );

  return result;
}

export async function rejectCreditPurchase(
  adminUserId: string,
  requestId: string,
  reason?: string,
) {
  const admin = await prisma.user.findUnique({ where: { id: adminUserId } });
  if (!admin || admin.role !== "ADMIN") {
    throw new PurchaseError("Solo un administrador puede rechazar pagos.");
  }

  const result = await prisma.creditPurchaseRequest.updateMany({
    where: { id: requestId, status: "PENDING" },
    data: {
      status: "REJECTED",
      reviewedAt: new Date(),
      reviewedBy: adminUserId,
      rejectionReason: reason || null,
    },
  });
  if (result.count === 0) {
    throw new PurchaseError("Este pago ya fue procesado o no existe.");
  }

  await logAudit({
    userId: adminUserId,
    action: "CREDIT_PURCHASE_REJECTED",
    entityType: "CreditPurchaseRequest",
    entityId: requestId,
    metadata: reason ? { reason } : undefined,
  });

  const purchase = await prisma.creditPurchaseRequest.findUniqueOrThrow({
    where: { id: requestId },
    include: { agent: { include: { user: true } } },
  });
  await notify(
    purchase.agent.user.id,
    "credit_purchase_rejected",
    "Tu compra de créditos fue rechazada",
    reason
      ? `Motivo: ${reason}`
      : "Si crees que fue un error, contacta al administrador.",
  );

  return purchase;
}
