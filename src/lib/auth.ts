import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import type { UserRole } from "@/generated/prisma/enums";

export { hashPassword, verifyPassword } from "@/lib/password";

// Cómo funciona esto, en simple:
// - La contraseña nunca se guarda tal cual (bcrypt).
// - Al iniciar sesión creamos una fila en Session con un id al azar; ese id
//   (no la contraseña) es lo único que guarda la cookie del navegador.
// - Compradores, agentes y admin usan el mismo mecanismo de sesión; todos
//   tienen contraseña real (sección 1: el comprador debe registrarse antes
//   de poder solicitar información).

const COOKIE_NAME = "session";
const SESSION_DAYS = 90;

export async function createSession(userId: string): Promise<void> {
  const session = await prisma.session.create({
    data: {
      id: randomUUID(),
      userId,
      expiresAt: new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000),
    },
  });
  const jar = await cookies();
  jar.set(COOKIE_NAME, session.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: session.expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const sessionId = jar.get(COOKIE_NAME)?.value;
  if (sessionId) {
    await prisma.session.deleteMany({ where: { id: sessionId } });
  }
  jar.delete(COOKIE_NAME);
}

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  buyerProfileId: string | null;
  agentProfileId: string | null;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const jar = await cookies();
  const sessionId = jar.get(COOKIE_NAME)?.value;
  if (!sessionId) return null;

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      user: { include: { buyerProfile: true, agentProfile: true } },
    },
  });
  if (!session || session.expiresAt <= new Date() || !session.user.active) {
    return null;
  }
  const { user } = session;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    buyerProfileId: user.buyerProfile?.id ?? null,
    agentProfileId: user.agentProfile?.id ?? null,
  };
}

export async function requireRole(role: UserRole): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user || user.role !== role) {
    redirect("/login");
  }
  return user;
}

export async function requireBuyer(): Promise<CurrentUser> {
  return requireRole("BUYER");
}

export async function requireAgent(): Promise<CurrentUser> {
  return requireRole("AGENT");
}

export async function requireAdmin(): Promise<CurrentUser> {
  return requireRole("ADMIN");
}
