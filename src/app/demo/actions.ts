"use server";

import { redirect } from "next/navigation";
import { createSession } from "@/lib/auth";
import { ensureDemoUser } from "@/lib/demoAccounts";

// Solo BUYER | AGENT a nivel de tipos: no hay ningún valor que se pueda
// pasar acá para terminar con una sesión ADMIN (ver demoAccounts.ts).
export async function demoLoginAction(role: "BUYER" | "AGENT") {
  const user = await ensureDemoUser(role);
  await createSession(user.id);
  redirect(role === "BUYER" ? "/dashboard/buyer" : "/dashboard/agent/leads");
}
