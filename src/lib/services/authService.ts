import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword, createSession } from "@/lib/auth";
import { getStartingCredits } from "@/lib/settings";
import type { AgentRegisterInput, BuyerRegisterInput } from "@/lib/validators/auth";

export class AuthError extends Error {}

export async function registerAgent(input: AgentRegisterInput) {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AuthError("Ya existe una cuenta con ese email.");
  }

  const startingCredits = await getStartingCredits();
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email,
        passwordHash: await hashPassword(input.password),
        name: input.name,
        phone: input.phone,
        role: "AGENT",
      },
    });
    const profile = await tx.agentProfile.create({
      data: {
        userId: created.id,
        company: input.company || null,
        city: input.city || null,
        creditsBalance: startingCredits,
      },
    });
    // El saldo inicial también queda en el ledger, para que balance y
    // ledger siempre coincidan desde el primer movimiento.
    await tx.creditLedgerEntry.create({
      data: {
        agentId: profile.id,
        amount: startingCredits,
        balanceAfter: startingCredits,
        reason: "STARTING_BALANCE",
        description: "Saldo inicial de bienvenida",
      },
    });
    return created;
  });

  await createSession(user.id);
  return user;
}

// Registro de compradores (sección 1): deben crear una cuenta antes de
// poder solicitar información sobre una propiedad (sección 2).
export async function registerBuyer(input: BuyerRegisterInput) {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AuthError("Ya existe una cuenta con ese email.");
  }

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email,
        passwordHash: await hashPassword(input.password),
        name: `${input.firstName.trim()} ${input.lastName.trim()}`,
        phone: input.phone,
        role: "BUYER",
      },
    });
    await tx.buyerProfile.create({
      data: {
        userId: created.id,
        whatsapp: input.phone,
        contactConsent: input.contactConsent,
      },
    });
    return created;
  });

  await createSession(user.id);
  return user;
}

export async function loginWithPassword(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
  });
  if (!user || !user.active) {
    throw new AuthError("Email o contraseña incorrectos.");
  }
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw new AuthError("Email o contraseña incorrectos.");
  }
  await createSession(user.id);
  return user;
}
