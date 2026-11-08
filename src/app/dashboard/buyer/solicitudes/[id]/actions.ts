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
  pollMessagesForBuyer,
  ConversationError,
  type MessageCursor,
} from "@/lib/services/conversation";
import { pollLeadPurchaseIdSchema, pollCursorSchema } from "@/lib/validators/conversation";

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

// Polling (fase 1 de tiempo real): trae solo lo nuevo desde `after` y marca
// como leído, en un solo viaje al servidor. `after` null solo pasa en el
// primer tick si el panel no tenía ningún mensaje cargado todavía — en ese
// caso no hay "nuevos" que buscar (listMessagesForBuyer ya trajo el estado
// inicial), pero igual marca leído lo que hubiera.
//
// Validación (fase 1.1): rechaza una forma inválida de leadPurchaseId/after
// ANTES de tocar la base de datos. No reemplaza la autorización real —
// pollMessagesForBuyer sigue resolviendo la conversación exclusivamente vía
// getConversationForBuyer, filtrado por el buyerProfileId de la sesión.
export async function pollConversationAction(leadPurchaseId: string, after: MessageCursor | null) {
  const user = await requireBuyer();
  const parsedLeadPurchaseId = pollLeadPurchaseIdSchema.parse(leadPurchaseId);
  const parsedAfter = pollCursorSchema.parse(after);
  return pollMessagesForBuyer(user.buyerProfileId!, user.id, parsedLeadPurchaseId, parsedAfter);
}
