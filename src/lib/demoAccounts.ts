import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";

// Emails fijos y reservados para /demo (dominio .test, no registrable de
// verdad). NO incluye ADMIN a propósito: ese rol tiene poder real sobre
// datos reales (aprobar compras de crédito, editar métodos de pago,
// activar/desactivar usuarios), así que no existe una versión "de mentira"
// segura de dárselo a un visitante anónimo con un solo click.
export const DEMO_EMAILS = {
  BUYER: "demo-comprador@propiedadconecta.test",
  AGENT: "demo-agente@propiedadconecta.test",
} as const;

// Nunca se usa para loguearse por el form real — solo satisface el NOT
// NULL de passwordHash. Mismo valor que ya documentaba prisma/seed.ts para
// las cuentas demo, por si alguien la usa manualmente desde /login.
const DEMO_PASSWORD = "demo1234";

const DEMO_NAMES: Record<keyof typeof DEMO_EMAILS, string> = {
  BUYER: "Comprador Demo",
  AGENT: "Agente Demo",
};

// Reemplaza la dependencia de `npm run db:seed` (destructivo, nunca debe
// correr en producción) para que /demo funcione ahí también: busca la
// cuenta demo y, si no existe, la crea — upsert por email/userId, así que
// es idempotente y no puede duplicar ni pisar nada si dos visitantes
// clickean al mismo tiempo. Nunca toca ninguna otra fila de la tabla User.
export async function ensureDemoUser(role: keyof typeof DEMO_EMAILS) {
  const email = DEMO_EMAILS[role];

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: DEMO_NAMES[role],
      passwordHash: await hashPassword(DEMO_PASSWORD),
      role,
    },
  });

  if (role === "BUYER") {
    await prisma.buyerProfile.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
    });
  } else {
    await prisma.agentProfile.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
    });
  }

  return user;
}
