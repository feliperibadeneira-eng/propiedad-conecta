import { requireAdmin } from "@/lib/auth";
import { getAllSettings, SETTINGS } from "@/lib/settings";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Card } from "@/components/ui/Card";
import { Field, inputBase } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { ADMIN_NAV_LINKS } from "../nav";
import { updateSettingsAction } from "./actions";

export const dynamic = "force-dynamic";

const LABELS: Record<keyof typeof SETTINGS, string> = {
  maxAgentsDefault: "Máximo de agentes por defecto",
  reactivationHours: "Horas sin contacto antes de poder reactivar",
  refundEligibleHours: "Horas mínimas para pedir devolución de crédito",
  startingCredits: "Créditos iniciales para agentes nuevos",
  paymentInstructions: "Instrucciones de pago para comprar créditos",
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
          las instrucciones de pago para comprar créditos.
        </p>

        <form action={updateSettingsAction} className="mt-6">
          <Card className="grid gap-4 p-6 sm:grid-cols-2">
            {Object.entries(SETTINGS)
              .filter(([name]) => name !== "paymentInstructions")
              .map(([name, def]) => (
                <Field key={def.key} label={LABELS[name as keyof typeof SETTINGS]}>
                  <input
                    name={def.key}
                    type="number"
                    min={0}
                    defaultValue={values[name as keyof typeof SETTINGS]}
                    className={inputBase}
                  />
                </Field>
              ))}
          </Card>

          <Card className="mt-4 p-6">
            <Field
              label={LABELS.paymentInstructions}
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
          </Card>

          <Button type="submit" className="mt-5">
            Guardar configuración
          </Button>
        </form>
      </main>
    </>
  );
}
