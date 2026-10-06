"use server";

import { redirect } from "next/navigation";
import { requireAgent } from "@/lib/auth";
import { purchaseWithCredits, PurchaseError } from "@/lib/services/purchase";

export type UnlockState = { error?: string };

// Sección 5: desbloquear un lead consume 1 crédito de la cuenta del
// agente. Reemplaza el checkout de Stripe (queda preparado en
// lib/stripe.ts y el webhook por si se reactiva más adelante).
//
// propertyId es opcional: viene del flujo de matching (PR #13/#14) cuando
// el agente llegó desde "Solicitudes compatibles" de una de sus
// propiedades. purchaseWithCredits() valida su ownership dentro de la
// misma transacción atómica del cobro — acá no se hace ningún chequeo
// adicional, solo se propaga.
export async function unlockLeadAction(
  requestId: string,
  propertyId: string | undefined,
  _prev: UnlockState,
  _formData: FormData,
): Promise<UnlockState> {
  const user = await requireAgent();

  try {
    await purchaseWithCredits({
      agentUserId: user.id,
      agentProfileId: user.agentProfileId!,
      requestId,
      propertyId,
    });
  } catch (e) {
    if (e instanceof PurchaseError) return { error: e.message };
    throw e;
  }
  redirect(`/dashboard/agent/leads/purchased/${requestId}?unlocked=1`);
}
