import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import type { Prisma } from "@/generated/prisma/client";

// Una sola instancia de PrismaClient por proceso. En desarrollo, Next.js
// recarga los módulos en cada cambio; la guardamos en globalThis para no
// abrir un pool de conexiones nuevo en cada recarga.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// Cliente o `tx` de una transacción abierta: firma compartida para que las
// funciones con efectos colaterales (recordStatusChange, logAudit) puedan
// ejecutarse dentro de la misma transacción de negocio que las origina, sin
// duplicar este tipo en cada archivo que lo necesita.
export type Db = typeof prisma | Prisma.TransactionClient;
