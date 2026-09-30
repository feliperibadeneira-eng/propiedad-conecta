"use server";

import { revalidatePath } from "next/cache";
import { requireAgent } from "@/lib/auth";
import { createCreditPurchaseRequest } from "@/lib/services/creditPurchases";
import type { CreditPackageType } from "@/generated/prisma/enums";

export type SubmitPurchaseState = { error?: string; success?: boolean };

// Sección 5: esto SOLO crea el registro PENDING. No toca creditsBalance —
// eso únicamente ocurre cuando un admin aprueba (ver creditPurchases.ts).
export async function submitCreditPurchaseAction(
  packageKey: CreditPackageType,
  _prev: SubmitPurchaseState,
  _formData: FormData,
): Promise<SubmitPurchaseState> {
  const user = await requireAgent();
  await createCreditPurchaseRequest(user.agentProfileId!, packageKey);
  revalidatePath("/dashboard/agent/creditos");
  return { success: true };
}
