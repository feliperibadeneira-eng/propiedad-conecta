"use server";

import { redirect } from "next/navigation";
import { agentRegisterSchema } from "@/lib/validators/auth";
import { registerAgent, AuthError } from "@/lib/services/authService";

export type RegisterState = { error?: string };

export async function registerAgentAction(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const parsed = agentRegisterSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    phone: formData.get("phone"),
    company: formData.get("company"),
    city: formData.get("city"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa los datos." };
  }
  try {
    await registerAgent(parsed.data);
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
  redirect("/dashboard/agent/leads");
}
