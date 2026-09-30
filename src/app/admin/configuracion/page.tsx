import { requireAdmin } from "@/lib/auth";
import { getAllSettings, SETTINGS } from "@/lib/settings";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Card } from "@/components/ui/Card";
import { Field, inputBase } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { ADMIN_NAV_LINKS } from "../nav";
import { updateSettingsAction } from "./actions";

export const dynamic = "force-dynamic";

// Los settings numéricos que se renderizan en la grilla genérica de abajo.
// Los de métodos de pago (links, QR, instrucciones) tienen su propia
// sección porque no son números — ver el Card "Métodos de pago".
const NUMERIC_SETTINGS = [
  "maxAgentsDefault",
  "reactivationHours",
  "refundEligibleHours",
  "startingCredits",
] as const;

const LABELS: Record<(typeof NUMERIC_SETTINGS)[number], string> = {
  maxAgentsDefault: "Máximo de agentes por defecto",
  reactivationHours: "Horas sin contacto antes de poder reactivar",
  refundEligibleHours: "Horas mínimas para pedir devolución de crédito",
  startingCredits: "Créditos iniciales para agentes nuevos",
};

export default async function AdminSettingsPage() {
  const user = await requireAdmin();
  const values = await getAllSettings();

  return (
    <>
      <DashboardHeader userName={user.name} links={ADMIN_NAV_LINKS} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-bold tracking-tight">Configuración</h1>
        <p className="mt-1 text-sm text-muted">
          Ajustes generales del marketplace: límites de agentes por
          solicitud, ventanas de reactivación y devolución de créditos, y
          los métodos de pago para comprar créditos.
        </p>

        <form action={updateSettingsAction} className="mt-6" encType="multipart/form-data">
          <Card className="grid gap-4 p-6 sm:grid-cols-2">
            {NUMERIC_SETTINGS.map((name) => (
              <Field key={SETTINGS[name].key} label={LABELS[name]}>
                <input
                  name={SETTINGS[name].key}
                  type="number"
                  min={0}
                  defaultValue={values[name]}
                  className={inputBase}
                />
              </Field>
            ))}
          </Card>

          <Card className="mt-4 p-6">
            <h2 className="font-semibold">Métodos de pago</h2>
            <p className="mt-1 text-sm text-muted">
              Lo que ve el agente en la pantalla de compra de créditos.
            </p>

            <div className="mt-4 space-y-4">
              <Field label="Link PayPhone — paquete 10 créditos ($10)">
                <input
                  name={SETTINGS.payphoneLink10Credits.key}
                  type="url"
                  defaultValue={values.payphoneLink10Credits}
                  className={inputBase}
                />
              </Field>
              <Field label="Link PayPhone — paquete 50 créditos ($40)">
                <input
                  name={SETTINGS.payphoneLink50Credits.key}
                  type="url"
                  defaultValue={values.payphoneLink50Credits}
                  className={inputBase}
                />
              </Field>
              <Field label="Link PayPhone — paquete 100 créditos ($75)">
                <input
                  name={SETTINGS.payphoneLink100Credits.key}
                  type="url"
                  defaultValue={values.payphoneLink100Credits}
                  className={inputBase}
                />
              </Field>

              <Field
                label="QR de Deuna"
                hint="Subí una imagen para reemplazar la actual. Si dejás esto vacío, se mantiene la que ya está configurada."
              >
                {values.deunaQrImage && (
                  // eslint-disable-next-line @next/next/no-img-element -- data URI, no un asset estático
                  <img
                    src={values.deunaQrImage}
                    alt="QR de Deuna actual"
                    className="mb-3 h-40 w-40 rounded-xl border border-border object-contain"
                  />
                )}
                <input
                  name={SETTINGS.deunaQrImage.key}
                  type="file"
                  accept="image/*"
                  className={inputBase}
                />
              </Field>

              <Field
                label="Instrucciones adicionales"
                hint="Se muestra tal cual al agente en la pantalla de pago. No inventes datos bancarios: dejá esto vacío hasta tener el método real."
              >
                <textarea
                  name={SETTINGS.paymentInstructions.key}
                  rows={4}
                  defaultValue={values.paymentInstructions}
                  className={inputBase}
                  placeholder="Ej: Transferencia a la cuenta X del banco Y a nombre de..."
                />
              </Field>
            </div>
          </Card>

          <Button type="submit" className="mt-5">
            Guardar configuración
          </Button>
        </form>
      </main>
    </>
  );
}
