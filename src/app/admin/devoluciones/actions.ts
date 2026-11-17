"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { approveRefund, rejectRefund, PurchaseError } from "@/lib/services/purchase";

// Opera directamente sobre refundRequestId (Etapa 2.1) — ya no infiere la
// solicitud pendiente desde LeadPurchase.status, porque la página ahora
// lista por RefundRequest y cada fila ya conoce su propio id.
export async function approveRefundAction(refundRequestId: string, formData: FormData) {
  const admin = await requireAdmin();
  const decisionReason = String(formData.get("decisionReason") || "");
  try {
    await approveRefund({ adminUserId: admin.id, refundRequestId, decisionReason });
  } catch (e) {
    if (!(e instanceof PurchaseError)) throw e;
    // Ya fue procesada (ej. doble clic) o el motivo quedó vacío tras
    // trim(): no hay más que hacer, el `required` del textarea cubre el
    // caso normal.
  }
  revalidatePath("/admin/devoluciones");
}

export async function rejectRefundAction(refundRequestId: string, formData: FormData) {
  const admin = await requireAdmin();
  const decisionReason = String(formData.get("decisionReason") || "");
  try {
    await rejectRefund({ adminUserId: admin.id, refundRequestId, decisionReason });
  } catch (e) {
    if (!(e instanceof PurchaseError)) throw e;
  }
  revalidatePath("/admin/devoluciones");
}
