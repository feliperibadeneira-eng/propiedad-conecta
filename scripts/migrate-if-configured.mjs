import { execSync } from "node:child_process";

// Decide qué hacer con las migraciones según el entorno, sin ejecutar nada —
// así esta lógica se puede probar de forma aislada, con valores simulados,
// sin tocar ninguna base de datos real. Vercel inyecta VERCEL_ENV
// automáticamente ("production" | "preview" | "development"); en desarrollo
// local (fuera de Vercel) no está definida.
export function decideMigrationAction({ vercelEnv, hasDatabaseUrl }) {
  if (vercelEnv === "preview") {
    // Preview nunca tiene base de datos propia hoy: se omite siempre, sin
    // importar si DATABASE_URL está presente.
    return {
      action: "skip",
      reason: "VERCEL_ENV=preview: Preview no tiene base de datos propia.",
    };
  }

  if (vercelEnv === "production") {
    if (!hasDatabaseUrl) {
      return {
        action: "fail",
        reason: "VERCEL_ENV=production pero DATABASE_URL no está definida.",
      };
    }
    return {
      action: "run",
      reason: "VERCEL_ENV=production con DATABASE_URL definida.",
    };
  }

  // Desarrollo local, o cualquier otro valor de VERCEL_ENV (p. ej.
  // "development"): mismo comportamiento que antes de este cambio.
  return {
    action: "run",
    reason: `Entorno local (VERCEL_ENV=${vercelEnv ?? "sin definir"}).`,
  };
}

function main() {
  const decision = decideMigrationAction({
    vercelEnv: process.env.VERCEL_ENV,
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
  });

  if (decision.action === "skip") {
    console.log(
      `${decision.reason} Se omite prisma migrate deploy; continuando con next build.`,
    );
    return;
  }

  if (decision.action === "fail") {
    console.error(
      `${decision.reason} Deteniendo el build: no se puede aplicar prisma migrate deploy.`,
    );
    process.exit(1);
  }

  console.log(`${decision.reason} Ejecutando prisma migrate deploy.`);
  execSync("npx prisma migrate deploy", { stdio: "inherit" });
}

// Solo corre al ejecutarse directamente (node scripts/migrate-if-configured.mjs),
// nunca al importar decideMigrationAction para probarla de forma aislada.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
