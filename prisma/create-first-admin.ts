// Crea la primera cuenta de administrador en una base de datos vacía
// (típicamente producción, recién desplegada — el seed.ts de datos de
// ejemplo NO corre ahí porque borra usuarios existentes).
//
// Uso:
//   DATABASE_URL="postgres://..." npx tsx prisma/create-first-admin.ts \
//     "Tu nombre" "tu@email.com"
//
// Es seguro correrlo: si ya existe un administrador, no hace nada y te
// avisa (para no crear cuentas admin duplicadas por error o por accidente).
import "dotenv/config";
import { randomBytes } from "crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/lib/password";

if (!process.env.DATABASE_URL) {
  console.error(
    "Falta DATABASE_URL. Ejecuta: DATABASE_URL=\"...\" npx tsx prisma/create-first-admin.ts \"Tu nombre\" \"tu@email.com\"",
  );
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const SAFE_CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
function generatePassword(): string {
  const bytes = randomBytes(10);
  let out = "";
  for (let i = 0; i < 10; i++) out += SAFE_CHARS[bytes[i] % SAFE_CHARS.length];
  return `${out.slice(0, 5)}-${out.slice(5)}`;
}

async function main() {
  const [adminName, rawEmail] = process.argv.slice(2);
  if (!adminName || !rawEmail) {
    console.error(
      'Uso: npx tsx prisma/create-first-admin.ts "Tu nombre" "tu@email.com"',
    );
    process.exit(1);
  }
  const adminEmail = rawEmail.trim().toLowerCase();
  if (!adminEmail.includes("@") || !adminEmail.includes(".")) {
    console.error(`"${rawEmail}" no parece un email válido.`);
    process.exit(1);
  }

  // Regla principal: esto no es una pantalla de "promover a admin" — es un
  // arranque de una sola vez. Si ya existe cualquier administrador, nos
  // negamos a crear otro acá (evita que este script se use para ir
  // sumando admins sin control). Para admins adicionales, hacerlo a mano.
  const existingAdmin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
  });
  if (existingAdmin) {
    console.error(
      `Ya existe un administrador ("${existingAdmin.email}") — no se creó nada nuevo. Este script es solo para el primer admin; para sumar otro, hacelo manualmente por ahora.`,
    );
    process.exit(1);
  }

  const existingEmail = await prisma.user.findUnique({
    where: { email: adminEmail },
  });
  if (existingEmail) {
    console.error(
      `Ya existe una cuenta con el email "${adminEmail}" (rol ${existingEmail.role}) — usa otro email.`,
    );
    process.exit(1);
  }

  const password = generatePassword();
  await prisma.user.create({
    data: {
      name: adminName,
      email: adminEmail,
      passwordHash: await hashPassword(password),
      role: "ADMIN",
    },
  });

  console.log("Administrador creado:");
  console.log("");
  console.log(`  Email:      ${adminEmail}`);
  console.log(`  Contraseña: ${password}`);
  console.log("");
  console.log(
    "Guarda esta contraseña ahora — no se vuelve a mostrar. Entra en /login con estas credenciales.",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
