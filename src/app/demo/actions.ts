"use server";

import { redirect } from "next/navigation";
import { createSession, requireAdmin } from "@/lib/auth";
import { ensureDemoUser } from "@/lib/demoAccounts";

// Solo BUYER | AGENT a nivel de tipos: no hay ningún valor que se pueda
// pasar acá para terminar con una sesión ADMIN (ver demoAccounts.ts).
//
// requireAdmin() corre server-side en cada invocación, sea que venga del
// botón de /demo o de cualquier otra forma de llamar a esta action
// directamente: si quien la ejecuta no es ADMIN, redirige a /login antes
// de tocar ensureDemoUser/createSession. Esto reemplaza la sesión actual
// por la de la cuenta demo — así es como el admin "entra" al entorno demo.
export async function demoLoginAction(role: "BUYER" | "AGENT") {
  await requireAdmin();
  const user = await ensureDemoUser(role);
  await createSession(user.id);
  redirect(role === "BUYER" ? "/dashboard/buyer" : "/dashboard/agent/leads");
}
