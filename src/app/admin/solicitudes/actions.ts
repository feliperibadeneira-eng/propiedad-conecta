"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { adminSetRequestStatus } from "@/lib/services/admin";
import { reactivateLeadPurchase, PurchaseError } from "@/lib/services/purchase";
import type { RequestStatus } from "@/generated/prisma/enums";

export async function adminSetStatusAction(requestId: string, status: RequestStatus) {
  const admin = await requireAdmin();
  await adminSetRequestStatus(admin.id, requestId, status);
  revalidatePath("/admin/solicitudes");
}

export async function adminReactivateAction(leadPurchaseId: string) {
  const admin = await requireAdmin();
  try {
    await reactivateLeadPurchase(admin.id, leadPurchaseId);
  } catch (e) {
    if (e instanceof PurchaseError) return; // se ignora silenciosamente en esta acción rápida
    throw e;
  }
  revalidatePath("/admin/solicitudes");
}
