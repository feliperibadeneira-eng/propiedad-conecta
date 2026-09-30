"use server";

import { redirect } from "next/navigation";
import { destroySession } from "@/lib/auth";
import { loginSchema } from "@/lib/validators/auth";
import { loginWithPassword, AuthError } from "@/lib/services/authService";

export type LoginState = { error?: string };

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Ingresa un email y contraseña válidos." };
  }
  try {
    const user = await loginWithPassword(parsed.data.email, parsed.data.password);
    redirect(
      user.role === "AGENT"
        ? "/dashboard/agent/leads"
        : user.role === "BUYER"
          ? "/dashboard/buyer"
          : "/admin",
    );
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
}

export async function logoutAction() {
  await destroySession();
  redirect("/");
}
