import Link from "next/link";
import { requireAgent } from "@/lib/auth";
import { getPurchasedLeadsForAgent } from "@/lib/services/leads";
import { getAgentLeadDashboard } from "@/lib/services/agentProfile";
import { getRefundEligibleHours } from "@/lib/settings";
import { isEligibleForRefundRequest } from "@/lib/services/purchase";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { formatDate } from "@/lib/format";
import {
  PROPERTY_TYPE_LABELS,
  LEAD_PURCHASE_STATUS_LABELS,
} from "@/lib/enums";
import { agentToBuyerMessage } from "@/lib/whatsapp";
import { OCCUPYING_STATUSES } from "@/lib/services/constants";
import { AGENT_NAV_LINKS } from "../../nav";
import { markContactedAction, markAppointmentAction } from "./actions";
import { ReleaseLeadDialog } from "./ReleaseLeadDialog";
import { RequestRefundDialog } from "./RequestRefundDialog";
import type { LeadPurchaseStatus } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

const FILTERS: { value: string; label: string; statuses?: LeadPurchaseStatus[] }[] = [
  { value: "", label: "Todos" },
  { value: "nuevos", label: "Nuevos", statuses: ["PURCHASED"] },
  { value: "contactados", label: "Contactados", statuses: ["CONTACTED"] },
  { value: "respondieron", label: "Respondieron", statuses: ["RESPONDED"] },
  {
    value: "citas",
    label: "Citas agendadas",
    statuses: ["APPOINTMENT_SCHEDULED"],
  },
  {
    value: "devolucion_pendiente",
    label: "Devolución pendiente",
    statuses: ["REFUND_REQUESTED"],
  },
  { value: "devueltos", label: "Devueltos", statuses: ["REFUNDED"] },
];

export default async function PurchasedLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await requireAgent();
  const { status } = await searchParams;
  const [purchases, dashboard, refundEligibleHours] = await Promise.all([
    getPurchasedLeadsForAgent(user.agentProfileId!),
    getAgentLeadDashboard(user.agentProfileId!),
    getRefundEligibleHours(),
  ]);

  const activeFilter = FILTERS.find((f) => f.value === (status ?? "")) ?? FILTERS[0];
  const filtered = activeFilter.statuses
    ? purchases.filter((p) => activeFilter.statuses!.includes(p.status))
    : purchases;

  return (
    <>
      <DashboardHeader
        userName={user.name}
        links={AGENT_NAV_LINKS}
        creditsBalance={dashboard.creditsBalance}
      />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-bold tracking-tight">Mis leads</h1>

        <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-6">
          <Stat label="Créditos disponibles" value={dashboard.creditsBalance} />
          <Stat label="Leads recibidos" value={dashboard.total} />
          <Stat label="Contactados" value={dashboard.contactados} />
          <Stat label="Respondieron" value={dashboard.respondieron} />
          <Stat label="Devolución pendiente" value={dashboard.devolucionPendiente} />
          <Stat label="Devueltos" value={dashboard.devueltos} />
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Link
              key={f.value}
              href={f.value ? `?status=${f.value}` : "?"}
              className={buttonClasses(
                activeFilter.value === f.value ? "primary" : "secondary",
                "sm",
              )}
            >
              {f.label}
            </Link>
          ))}
        </div>

        {filtered.length === 0 ? (
          <Card className="mt-6 p-8 text-center text-sm text-muted">
            {purchases.length === 0 ? (
              <>
                Todavía no compraste ningún lead.{" "}
                <Link href="/dashboard/agent/leads" className="text-accent hover:underline">
                  Ver marketplace
                </Link>
              </>
            ) : (
              "No hay leads en este filtro."
            )}
          </Card>
        ) : (
          <div className="mt-6 space-y-3">
            {filtered.map((p) => {
              const active = OCCUPYING_STATUSES.includes(p.status);
              const canRequestRefund = isEligibleForRefundRequest(
                p,
                refundEligibleHours,
              );
              return (
                <Card key={p.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-muted-2">
                        LEAD #{p.id.slice(0, 8).toUpperCase()}
                      </p>
                      <p className="font-semibold">{p.request.contactName}</p>
                      <p className="text-sm text-muted">
                        Solicitó información sobre:{" "}
                        {PROPERTY_TYPE_LABELS[p.request.propertyType]} en{" "}
                        {p.request.ciudad}
                        {p.request.sector ? ` · ${p.request.sector}` : ""}
                      </p>
                      <p className="mt-1 text-xs text-muted-2">
                        {formatDate(p.purchasedAt)} · {p.creditsUsed} crédito
                        {p.creditsUsed > 1 ? "s" : ""} utilizado
                        {p.creditsUsed > 1 ? "s" : ""}
                      </p>
                    </div>
                    <Badge tone={active ? "accent" : "neutral"}>
                      {LEAD_PURCHASE_STATUS_LABELS[p.status]}
                    </Badge>
                  </div>

                  <div className="mt-3 grid gap-1 text-sm text-muted sm:grid-cols-3">
                    <span>📞 {p.request.contactPhone}</span>
                    {p.request.contactEmail && <span>✉️ {p.request.contactEmail}</span>}
                    <span>Prefiere: {p.request.contactPreference}</span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <WhatsAppButton
                      phone={p.request.contactPhone}
                      defaultMessage={agentToBuyerMessage({
                        buyerName: p.request.contactName,
                        agentName: user.name,
                        propertyType: PROPERTY_TYPE_LABELS[p.request.propertyType].toLowerCase(),
                        zone: p.request.sector || p.request.ciudad,
                      })}
                    />
                    {p.request.contactEmail && (
                      <a href={`mailto:${p.request.contactEmail}`} className={buttonClasses("secondary", "sm")}>
                        Email
                      </a>
                    )}
                    {p.status === "PURCHASED" && (
                      <form action={markContactedAction.bind(null, p.id)}>
                        <button type="submit" className={buttonClasses("secondary", "sm")}>
                          Contacté al lead
                        </button>
                      </form>
                    )}
                    {(p.status === "PURCHASED" || p.status === "CONTACTED" || p.status === "RESPONDED") && (
                      <form action={markAppointmentAction.bind(null, p.id)}>
                        <button type="submit" className={buttonClasses("secondary", "sm")}>
                          Marcar cita agendada
                        </button>
                      </form>
                    )}
                    {active && <ReleaseLeadDialog leadPurchaseId={p.id} />}
                    {canRequestRefund && <RequestRefundDialog leadPurchaseId={p.id} />}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-3 text-center">
      <p className="text-xl font-bold">{value}</p>
      <p className="mt-1 text-xs text-muted">{label}</p>
    </Card>
  );
}
