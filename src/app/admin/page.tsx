import { requireAdmin } from "@/lib/auth";
import { getDashboardMetrics } from "@/lib/services/admin";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Card } from "@/components/ui/Card";
import { ADMIN_NAV_LINKS } from "./nav";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const user = await requireAdmin();
  const m = await getDashboardMetrics();

  return (
    <>
      <DashboardHeader userName={user.name} links={ADMIN_NAV_LINKS} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-bold tracking-tight">Resumen</h1>
        <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Stat label="Compradores" value={m.buyers} />
          <Stat label="Agentes" value={m.agents} />
          <Stat label="Agentes activos" value={m.activeAgents} />
          <Stat label="Solicitudes creadas" value={m.requestsCreated} />
          <Stat label="Solicitudes activas" value={m.requestsActive} />
          <Stat label="Leads vendidos" value={m.leadsSold} />
          <Stat label="Créditos consumidos" value={m.creditsConsumed} />
          <Stat label="Devoluciones pendientes" value={m.pendingRefunds} />
          <Stat label="Conversión (solicitud → venta)" value={`${(m.conversionRate * 100).toFixed(0)}%`} />
          <Stat label="Agentes promedio / solicitud" value={m.avgAgentsPerRequest.toFixed(2)} />
          <Stat
            label="Tiempo prom. hasta 1ra compra"
            value={m.avgTimeToFirstPurchaseHours != null ? `${m.avgTimeToFirstPurchaseHours.toFixed(1)} h` : "—"}
          />
        </div>
      </main>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-5">
      <p className="text-2xl font-bold">{value}</p>
      <p className="mt-1 text-xs text-muted">{label}</p>
    </Card>
  );
}
