"use server";

import { revalidatePath } from "next/cache";
import { requireAgent } from "@/lib/auth";
import { createCreditPurchaseRequest } from "@/lib/services/creditPurchases";
import { parseImageFormFile } from "@/lib/imageUpload";
import type { CreditPackageType } from "@/generated/prisma/enums";

export type SubmitPurchaseState = { error?: string; success?: boolean };

// Sección 5: esto SOLO crea el registro PENDING. No toca creditsBalance —
// eso únicamente ocurre cuando un admin aprueba (ver creditPurchases.ts).
// El comprobante es obligatorio: sin una imagen válida, no se crea la
// solicitud (el <input required> ya lo exige en el cliente, esto es el
// check server-side real).
export async function submitCreditPurchaseAction(
  packageKey: CreditPackageType,
  _prev: SubmitPurchaseState,
  formData: FormData,
): Promise<SubmitPurchaseState> {
  const user = await requireAgent();

  let receipt;
  try {
    receipt = await parseImageFormFile(formData.get("receipt"));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Comprobante inválido." };
  }
  if (!receipt) {
    return { error: "Debes adjuntar una imagen del comprobante de pago." };
  }

  await createCreditPurchaseRequest(user.agentProfileId!, packageKey, receipt);
  revalidatePath("/dashboard/agent/creditos");
  return { success: true };
}
