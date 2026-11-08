"use server";

import { getCurrentUser } from "@/lib/auth";
import {
  countUnreadMessagesForAgent,
  countUnreadMessagesForBuyer,
} from "@/lib/services/conversation";

// Contador global del badge de DashboardHeader (fase 1 de tiempo real).
// Se autentica a sí misma vía sesión (igual que requireX()) en vez de
// recibir el perfil por prop — así DashboardHeader no necesita saber el
// rol de quien lo renderiza, solo llama a esto. Admin (sin conversaciones)
// y cualquier caso sin perfil devuelven 0 sin error.
export async function getUnreadConversationCountAction(): Promise<number> {
  const user = await getCurrentUser();
  if (!user) return 0;
  if (user.role === "AGENT" && user.agentProfileId) {
    return countUnreadMessagesForAgent(user.agentProfileId, user.id);
  }
  if (user.role === "BUYER" && user.buyerProfileId) {
    return countUnreadMessagesForBuyer(user.buyerProfileId, user.id);
  }
  return 0;
}
