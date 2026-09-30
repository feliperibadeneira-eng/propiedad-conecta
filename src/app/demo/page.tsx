import { PublicNav } from "@/components/PublicNav";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { demoLoginAction } from "./actions";

export const metadata = { title: "Modo demo — Propiedad Conecta" };

export default function DemoPage() {
  return (
    <>
      <PublicNav />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
        <h1 className="text-2xl font-bold tracking-tight">Modo demo</h1>
        <p className="mt-2 text-sm text-muted">
          Prueba el flujo completo con créditos, sin pagos reales: comprador
          se registra y publica su solicitud → agente la ve en el
          marketplace y la desbloquea (consume 1 crédito) → ambos reciben
          los datos de contacto → si el usuario no responde, el agente puede
          pedir la devolución de su crédito.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <Card className="p-5 text-center">
            <h2 className="font-semibold">Comprador demo</h2>
            <p className="mt-1 text-xs text-muted">
              Ya tiene solicitudes publicadas.
            </p>
            <form action={demoLoginAction.bind(null, "BUYER")} className="mt-4">
              <Button type="submit" className="w-full">
                Entrar
              </Button>
            </form>
          </Card>
          <Card className="p-5 text-center">
            <h2 className="font-semibold">Agente demo</h2>
            <p className="mt-1 text-xs text-muted">
              Ya tiene créditos cargados para desbloquear leads.
            </p>
            <form action={demoLoginAction.bind(null, "AGENT")} className="mt-4">
              <Button type="submit" className="w-full">
                Entrar
              </Button>
            </form>
          </Card>
          <Card className="p-5 text-center">
            <h2 className="font-semibold">Admin demo</h2>
            <p className="mt-1 text-xs text-muted">
              Ve métricas, usuarios y configuración.
            </p>
            <form action={demoLoginAction.bind(null, "ADMIN")} className="mt-4">
              <Button type="submit" className="w-full">
                Entrar
              </Button>
            </form>
          </Card>
        </div>

      </main>
    </>
  );
}
