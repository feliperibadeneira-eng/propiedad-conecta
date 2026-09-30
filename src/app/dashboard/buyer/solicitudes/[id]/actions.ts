"use server";

import { revalidatePath } from "next/cache";
import { requireBuyer } from "@/lib/auth";
import {
  updateMaxAgents,
  setBuyerRequestStatus,
} from "@/lib/services/requests";
import { markBuyerOutcome } from "@/lib/services/purchase";
import { buyerOutcomeSchema } from "@/lib/validators/profile";

export async function updateMaxAgentsAction(requestId: string, formData: FormData) {
  const user = await requireBuyer();
  const maxAgents = Number(formData.get("maxAgents"));
  if (![1, 3, 5].includes(maxAgents)) return;
  await updateMaxAgents(user.buyerProfileId!, requestId, maxAgents);
  revalidatePath(`/dashboard/buyer/solicitudes/${requestId}`);
}

export async function pauseRequestAction(requestId: string) {
  const user = await requireBuyer();
  await setBuyerRequestStatus(user.buyerProfileId!, requestId, "PAUSADA");
  revalidatePath(`/dashboard/buyer/solicitudes/${requestId}`);
}

export async function resumeRequestAction(requestId: string) {
  const user = await requireBuyer();
  await setBuyerRequestStatus(user.buyerProfileId!, requestId, "BUSCANDO");
  revalidatePath(`/dashboard/buyer/solicitudes/${requestId}`);
}

export async function closeRequestAction(requestId: string) {
  const user = await requireBuyer();
  await setBuyerRequestStatus(user.buyerProfileId!, requestId, "CERRADA");
  revalidatePath(`/dashboard/buyer/solicitudes/${requestId}`);
}

export async function markOutcomeAction(requestId: string, formData: FormData) {
  const user = await requireBuyer();
  const parsed = buyerOutcomeSchema.safeParse({
    leadPurchaseId: formData.get("leadPurchaseId"),
    outcome: formData.get("outcome"),
  });
  if (!parsed.success) return;
  await markBuyerOutcome(
    user.buyerProfileId!,
    parsed.data.leadPurchaseId,
    parsed.data.outcome,
  );
  revalidatePath(`/dashboard/buyer/solicitudes/${requestId}`);
}
