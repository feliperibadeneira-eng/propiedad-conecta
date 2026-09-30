"use server";

import { redirect } from "next/navigation";
import { buyerRegisterSchema } from "@/lib/validators/auth";
import { registerBuyer, AuthError } from "@/lib/services/authService";

export type BuyerRegisterState = { error?: string };

export async function registerBuyerAction(
  _prev: BuyerRegisterState,
  formData: FormData,
): Promise<BuyerRegisterState> {
  const parsed = buyerRegisterSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    password: formData.get("password"),
    phone: formData.get("phone"),
    contactConsent: formData.get("contactConsent") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa los datos." };
  }
  try {
    await registerBuyer(parsed.data);
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
  redirect("/buscar");
}
