"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { DEMO_EMAILS } from "@/lib/demoAccounts";

export async function demoLoginAction(role: keyof typeof DEMO_EMAILS) {
  const user = await prisma.user.findUnique({
    where: { email: DEMO_EMAILS[role] },
  });
  if (!user) {
    throw new Error(
      "No se encontraron cuentas demo. Corre `npm run db:seed` primero.",
    );
  }
  await createSession(user.id);
  redirect(
    role === "BUYER"
      ? "/dashboard/buyer"
      : role === "AGENT"
        ? "/dashboard/agent/leads"
        : "/admin",
  );
}
