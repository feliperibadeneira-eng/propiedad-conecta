"use server";

import { revalidatePath } from "next/cache";
import { requireBuyer } from "@/lib/auth";
import {
  updateMaxAgents,
  setBuyerRequestStatus,
} from "@/lib/services/requests";
import { markBuyerOutcome } from "@/lib/services/purchase";
import { buyerOutcomeSchema } from "@/lib/validators/profile";
import {
  sendTextMessageAsBuyer,
  listMessagesForBuyer,
  ConversationError,
  type MessageCursor,
} from "@/lib/services/conversation";

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

// ---------- Chat de la conversación (PR #17) ----------
//
// Sin página ni componente de chat todavía (ver auditoría previa a este
// PR) — por eso ninguna de las dos llama a revalidatePath: no existe hoy
// ninguna ruta que muestre estos datos. El comprador no tiene equivalente
// a sendPropertyShareMessage: compartir propiedades es exclusivo del
// agente, igual que en el resto del sistema.

export type SendConversationMessageState = { error?: string };

export async function sendConversationTextMessageAction(
  leadPurchaseId: string,
  _prev: SendConversationMessageState,
  formData: FormData,
): Promise<SendConversationMessageState> {
  const user = await requireBuyer();
  try {
    await sendTextMessageAsBuyer({
      buyerUserId: user.id,
      buyerProfileId: user.buyerProfileId!,
      leadPurchaseId,
      body: String(formData.get("body") || ""),
    });
  } catch (e) {
    if (e instanceof ConversationError) return { error: e.message };
    throw e;
  }
  return {};
}

export async function listConversationMessagesAction(
  leadPurchaseId: string,
  cursor?: MessageCursor,
  limit?: number,
) {
  const user = await requireBuyer();
  return listMessagesForBuyer(user.buyerProfileId!, leadPurchaseId, { cursor, limit });
}
