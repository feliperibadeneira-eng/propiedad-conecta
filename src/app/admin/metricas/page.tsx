import { Users, FileText, Unlock, Coins, TrendingUp } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getMarketplaceMetrics } from "@/lib/services/admin";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Card } from "@/components/ui/Card";
import { formatUSD } from "@/lib/format";
import { ADMIN_NAV_LINKS } from "../nav";

export const dynamic = "force-dynamic";

export default async function AdminMetricasPage() {
  const user = await requireAdmin();
  const m = await getMarketplaceMetrics();

  const demandTotal = m.demandType.total;
  const comprarPct = demandTotal > 0 ? (m.demandType.comprar / demandTotal) * 100 : 0;
  const alquilarPct = demandTotal > 0 ? (m.demandType.alquilar / demandTotal) * 100 : 0;

  const funnelSteps = [
    { label: "Usuarios registrados", value: m.funnel.users },
    { label: "Solicitudes publicadas", value: m.funnel.requests },
    { label: "Agentes registrados", value: m.funnel.agents },
    { label: "Leads desbloqueados", value: m.funnel.leadsUnlocked },
    { label: "Compras de créditos", value: m.funnel.creditPurchases },
  ];
  const funnelMax = Math.max(1, ...funnelSteps.map((s) => s.value));

  return (
    <>
      <DashboardHeader userName={user.name} links={ADMIN_NAV_LINKS} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-bold tracking-tight">Métricas</h1>
        <p className="mt-1 text-sm text-muted">
          Salud del marketplace: cuánta gente hay, cuánto se publica, cuánto
          se desbloquea y cuánto se cobra de verdad.
        </p>

        {/* Tarjetas principales */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            icon={<Users size={18} />}
            title="Usuarios registrados"
            value={m.users.total}
          >
            <BreakdownLine label="Compradores" value={m.users.buyers} />
            <BreakdownLine label="Agentes" value={m.users.agents} />
            <BreakdownLine label="Administradores" value={m.users.admins} />
          </MetricCard>

          <MetricCard
            icon={<FileText size={18} />}
            title="Solicitudes publicadas"
            value={m.requests.total}
          >
            <BreakdownLine label="Comprar" value={m.requests.comprar} />
            <BreakdownLine label="Alquilar" value={m.requests.alquilar} />
            <div className="mt-2 border-t border-border pt-2">
              <BreakdownLine label="Activas" value={m.requests.active} />
              <BreakdownLine label="Pausadas" value={m.requests.paused} />
              <BreakdownLine label="Cerradas" value={m.requests.closed} />
            </div>
          </MetricCard>

          <MetricCard
            icon={<Unlock size={18} />}
            title="Leads desbloqueados"
            value={m.leads.unlocked}
          >
            <BreakdownLine
              label="Agentes con ≥1 desbloqueo"
              value={m.leads.agentsWithUnlock}
            />
            <BreakdownLine
              label="Promedio por agente activo"
              value={
                m.leads.avgLeadsPerActiveAgent != null
                  ? m.leads.avgLeadsPerActiveAgent.toFixed(1)
                  : "—"
              }
            />
          </MetricCard>

          <MetricCard
            icon={<Coins size={18} />}
            title="Créditos vendidos"
            value={m.credits.sold}
          >
            <BreakdownLine label="Ingresos" value={formatUSD(m.credits.revenue)} />
            <BreakdownLine
              label="Compras aprobadas"
              value={m.credits.approvedPurchases}
            />
            <p className="mt-2 text-xs text-muted-2">
              Solo compras con pago aprobado — nunca pendientes ni rechazadas.
            </p>
          </MetricCard>
        </div>

        {/* Actividad reciente */}
        <Section title="Actividad reciente" className="mt-10">
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-2">
                <tr>
                  <th className="p-4">Métrica</th>
                  <th className="p-4">Hoy</th>
                  <th className="p-4">Últimos 7 días</th>
                  <th className="p-4">Últimos 30 días</th>
                </tr>
              </thead>
              <tbody>
                <ActivityRow
                  label="Usuarios nuevos"
                  row={m.recentActivity.users}
                />
                <ActivityRow
                  label="Solicitudes nuevas"
                  row={m.recentActivity.requests}
                />
                <ActivityRow
                  label="Leads desbloqueados"
                  row={m.recentActivity.leadsUnlocked}
                />
                <ActivityRow
                  label="Compras de créditos aprobadas"
                  row={m.recentActivity.creditPurchases}
                  last
                />
              </tbody>
            </table>
          </Card>
        </Section>

        {/* Embudo del marketplace */}
        <Section title="Embudo del marketplace" className="mt-10">
          <Card className="space-y-3 p-6">
            {funnelSteps.map((step) => (
              <div key={step.label}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium">{step.label}</span>
                  <span className="font-semibold">{step.value}</span>
                </div>
                <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-surface-hover">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${(step.value / funnelMax) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </Card>
        </Section>

        {/* Comprar vs Alquilar */}
        <Section title="Tipo de demanda" className="mt-10">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="p-6">
              <p className="text-sm text-muted">Comprar</p>
              <p className="mt-1 text-3xl font-bold">{m.demandType.comprar}</p>
              <p className="mt-1 text-sm text-muted-2">
                {demandTotal > 0 ? `${comprarPct.toFixed(0)}%` : "—"} de las
                solicitudes
              </p>
            </Card>
            <Card className="p-6">
              <p className="text-sm text-muted">Alquilar</p>
              <p className="mt-1 text-3xl font-bold">{m.demandType.alquilar}</p>
              <p className="mt-1 text-sm text-muted-2">
                {demandTotal > 0 ? `${alquilarPct.toFixed(0)}%` : "—"} de las
                solicitudes
              </p>
            </Card>
          </div>
        </Section>

        {/* Actividad de agentes */}
        <Section title="Actividad de agentes" className="mt-10 mb-10">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <SimpleStat label="Total de agentes" value={m.agentsActivity.total} />
            <SimpleStat
              label="Con ≥1 lead desbloqueado"
              value={m.agentsActivity.withUnlock}
            />
            <SimpleStat
              label="Sin ningún desbloqueo"
              value={m.agentsActivity.withoutUnlock}
            />
            <SimpleStat
              label="Total de leads desbloqueados"
              value={m.agentsActivity.totalUnlocked}
            />
            <SimpleStat
              label="Promedio por agente activo"
              value={
                m.agentsActivity.avgLeadsPerActiveAgent != null
                  ? m.agentsActivity.avgLeadsPerActiveAgent.toFixed(1)
                  : "—"
              }
            />
            <SimpleStat
              label="Agentes que compraron créditos"
              value={m.agentsActivity.whoPurchasedCredits}
            />
          </div>
        </Section>
      </main>
    </>
  );
}

function Section({
  title,
  className = "",
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
        <TrendingUp size={18} className="text-accent" />
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function MetricCard({
  icon,
  title,
  value,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  value: number;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-sm text-muted">
        <span className="text-accent">{icon}</span>
        {title}
      </div>
      <p className="mt-1.5 text-3xl font-bold">{value}</p>
      <div className="mt-3 space-y-1 border-t border-border pt-3">
        {children}
      </div>
    </Card>
  );
}

function BreakdownLine({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function SimpleStat({ label, value }: { label: string; value: number | string }) {
  return (
    <Card className="p-5">
      <p className="text-2xl font-bold">{value}</p>
      <p className="mt-1 text-xs text-muted">{label}</p>
    </Card>
  );
}

function ActivityRow({
  label,
  row,
  last = false,
}: {
  label: string;
  row: { today: number; last7Days: number; last30Days: number };
  last?: boolean;
}) {
  return (
    <tr className={last ? "" : "border-b border-border"}>
      <td className="p-4 font-medium">{label}</td>
      <td className="p-4">{row.today}</td>
      <td className="p-4">{row.last7Days}</td>
      <td className="p-4">{row.last30Days}</td>
    </tr>
  );
}
