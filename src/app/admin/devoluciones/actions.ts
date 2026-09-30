"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { approveRefund, rejectRefund, PurchaseError } from "@/lib/services/purchase";

export async function approveRefundAction(leadPurchaseId: string) {
  const admin = await requireAdmin();
  try {
    await approveRefund(admin.id, leadPurchaseId);
  } catch (e) {
    if (!(e instanceof PurchaseError)) throw e;
    // Ya fue procesada (ej. doble clic): no hacer nada más.
  }
  revalidatePath("/admin/devoluciones");
}

export async function rejectRefundAction(leadPurchaseId: string) {
  const admin = await requireAdmin();
  try {
    await rejectRefund(admin.id, leadPurchaseId);
  } catch (e) {
    if (!(e instanceof PurchaseError)) throw e;
  }
  revalidatePath("/admin/devoluciones");
}
