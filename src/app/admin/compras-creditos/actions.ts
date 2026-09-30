"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  approveCreditPurchase,
  rejectCreditPurchase,
} from "@/lib/services/creditPurchases";
import { PurchaseError } from "@/lib/services/purchase";

export async function approveCreditPurchaseAction(requestId: string) {
  const admin = await requireAdmin();
  try {
    await approveCreditPurchase(admin.id, requestId);
  } catch (e) {
    if (!(e instanceof PurchaseError)) throw e;
    // Ya fue procesado (ej. doble clic): no hacer nada más.
  }
  revalidatePath("/admin/compras-creditos");
}

export async function rejectCreditPurchaseAction(requestId: string, formData: FormData) {
  const admin = await requireAdmin();
  const reason = String(formData.get("reason") || "").trim() || undefined;
  try {
    await rejectCreditPurchase(admin.id, requestId, reason);
  } catch (e) {
    if (!(e instanceof PurchaseError)) throw e;
  }
  revalidatePath("/admin/compras-creditos");
}
