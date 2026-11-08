"use server";

import { revalidatePath } from "next/cache";
import { requireAgent } from "@/lib/auth";
import {
  markAgentContacted,
  markAppointmentScheduled,
  releaseLead,
  requestRefund,
  PurchaseError,
} from "@/lib/services/purchase";
import { shareProperty } from "@/lib/services/propertyShares";
import {
  sendTextMessageAsAgent,
  sendPropertyShareMessage,
  listMessagesForAgent,
  pollMessagesForAgent,
  ConversationError,
  type MessageCursor,
} from "@/lib/services/conversation";
import { pollLeadPurchaseIdSchema, pollCursorSchema } from "@/lib/validators/conversation";

export async function markContactedAction(leadPurchaseId: string) {
  const user = await requireAgent();
  await markAgentContacted(user.agentProfileId!, leadPurchaseId);
  revalidatePath("/dashboard/agent/leads/purchased");
}

export async function markAppointmentAction(leadPurchaseId: string) {
  const user = await requireAgent();
  await markAppointmentScheduled(user.agentProfileId!, leadPurchaseId);
  revalidatePath("/dashboard/agent/leads/purchased");
}

export async function releaseLeadAction(leadPurchaseId: string, formData: FormData) {
  const user = await requireAgent();
  const reason = String(formData.get("reason") || "Otro");
  await releaseLead(user.agentProfileId!, leadPurchaseId, reason);
  revalidatePath("/dashboard/agent/leads/purchased");
}

export async function sharePropertyAction(leadPurchaseId: string, propertyId: string) {
  const user = await requireAgent();
  await shareProperty(user.agentProfileId!, leadPurchaseId, propertyId);
  revalidatePath("/dashboard/agent/leads/purchased");
}

export type RequestRefundState = { error?: string };

// Sección 8: pide la devolución del crédito de este lead. Queda pendiente
// de revisión por un admin, no se acredita nada todavía.
export async function requestRefundAction(
  leadPurchaseId: string,
  _prev: RequestRefundState,
  _formData: FormData,
): Promise<RequestRefundState> {
  const user = await requireAgent();
  try {
    await requestRefund(user.agentProfileId!, leadPurchaseId);
  } catch (e) {
    if (e instanceof PurchaseError) return { error: e.message };
    throw e;
  }
  revalidatePath("/dashboard/agent/leads/purchased");
  return {};
}

// ---------- Chat de la conversación (PR #17) ----------
//
// Sin página ni componente de chat todavía (ver auditoría previa a este
// PR) — por eso ninguna de las tres llama a revalidatePath: no existe
// hoy ninguna ruta que muestre estos datos.

export type SendConversationMessageState = { error?: string };

export async function sendConversationTextMessageAction(
  leadPurchaseId: string,
  _prev: SendConversationMessageState,
  formData: FormData,
): Promise<SendConversationMessageState> {
  const user = await requireAgent();
  try {
    await sendTextMessageAsAgent({
      agentUserId: user.id,
      agentProfileId: user.agentProfileId!,
      leadPurchaseId,
      body: String(formData.get("body") || ""),
    });
  } catch (e) {
    if (e instanceof ConversationError) return { error: e.message };
    throw e;
  }
  return {};
}

export async function sendConversationPropertyShareMessageAction(
  leadPurchaseId: string,
  propertyId: string,
  body?: string,
) {
  const user = await requireAgent();
  await sendPropertyShareMessage({
    agentUserId: user.id,
    agentProfileId: user.agentProfileId!,
    leadPurchaseId,
    propertyId,
    body,
  });
}

export async function listConversationMessagesAction(
  leadPurchaseId: string,
  cursor?: MessageCursor,
  limit?: number,
) {
  const user = await requireAgent();
  return listMessagesForAgent(user.agentProfileId!, leadPurchaseId, { cursor, limit });
}

// Polling (fase 1 de tiempo real): ver el comentario equivalente en
// dashboard/buyer/solicitudes/[id]/actions.ts — mismo contrato, otro rol.
//
// Validación (fase 1.1): rechaza una forma inválida de leadPurchaseId/after
// ANTES de tocar la base de datos. No reemplaza la autorización real —
// pollMessagesForAgent sigue resolviendo la conversación exclusivamente vía
// getConversationForAgent, filtrado por el agentProfileId de la sesión.
export async function pollConversationAction(leadPurchaseId: string, after: MessageCursor | null) {
  const user = await requireAgent();
  const parsedLeadPurchaseId = pollLeadPurchaseIdSchema.parse(leadPurchaseId);
  const parsedAfter = pollCursorSchema.parse(after);
  return pollMessagesForAgent(user.agentProfileId!, user.id, parsedLeadPurchaseId, parsedAfter);
}
