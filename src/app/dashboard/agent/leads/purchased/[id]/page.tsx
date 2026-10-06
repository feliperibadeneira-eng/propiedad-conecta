import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { requireAgent } from "@/lib/auth";
import { getPurchasedLeadDetail } from "@/lib/services/leads";
import { getCreditsBalance } from "@/lib/services/agentProfile";
import { listAgentProperties } from "@/lib/services/properties";
import { listSharedPropertiesForAgent } from "@/lib/services/propertyShares";
import { getRefundEligibleHours } from "@/lib/settings";
import { isEligibleForRefundRequest } from "@/lib/services/purchase";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { formatDate, formatUSD } from "@/lib/format";
import { PROPERTY_TYPE_LABELS, LEAD_PURCHASE_STATUS_LABELS } from "@/lib/enums";
import { agentToBuyerMessage } from "@/lib/whatsapp";
import { OCCUPYING_STATUSES } from "@/lib/services/constants";
import { AGENT_NAV_LINKS } from "../../../nav";
import { markContactedAction, markAppointmentAction, sharePropertyAction } from "../actions";
import { ReleaseLeadDialog } from "../ReleaseLeadDialog";
import { RequestRefundDialog } from "../RequestRefundDialog";

export const dynamic = "force-dynamic";

export default async function PurchasedLeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: requestId } = await params;
  const user = await requireAgent();
  const [purchase, creditsBalance, refundEligibleHours] = await Promise.all([
    getPurchasedLeadDetail(user.agentProfileId!, requestId),
    getCreditsBalance(user.agentProfileId!),
    getRefundEligibleHours(),
  ]);
  if (!purchase) notFound();

  const [myProperties, sharedProperties] = await Promise.all([
    listAgentProperties(user.agentProfileId!),
    listSharedPropertiesForAgent(user.agentProfileId!, purchase.id),
  ]);
  const availableProperties = myProperties.filter((p) => p.status === "DISPONIBLE");
  const sharedPropertyIds = new Set(sharedProperties.map((s) => s.propertyId));

  const active = OCCUPYING_STATUSES.includes(purchase.status);
  const canRequestRefund = isEligibleForRefundRequest(purchase, refundEligibleHours);

  return (
    <>
      <DashboardHeader
        userName={user.name}
        links={AGENT_NAV_LINKS}
        creditsBalance={creditsBalance}
      />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <p className="text-xs text-muted-2">
          LEAD #{purchase.id.slice(0, 8).toUpperCase()}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">
            {purchase.request.contactName}
          </h1>
          <Badge tone={active ? "accent" : "neutral"}>
            {LEAD_PURCHASE_STATUS_LABELS[purchase.status]}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted">
          Solicitó información sobre:{" "}
          {PROPERTY_TYPE_LABELS[purchase.request.propertyType]} en{" "}
          {purchase.request.ciudad}
          {purchase.request.sector ? ` · ${purchase.request.sector}` : ""}
        </p>

        <Card className="mt-5 grid gap-4 p-6 sm:grid-cols-2">
          <Info label="Teléfono / WhatsApp" value={purchase.request.contactPhone} />
          {purchase.request.contactEmail && (
            <Info label="Email" value={purchase.request.contactEmail} />
          )}
          <Info label="Fecha de solicitud" value={formatDate(purchase.purchasedAt)} />
          <Info
            label="Crédito utilizado"
            value={`${purchase.creditsUsed} crédito${purchase.creditsUsed > 1 ? "s" : ""}`}
          />
        </Card>

        {(purchase.request.occupation ||
          purchase.request.searchReason ||
          purchase.request.additionalNotes) && (
          <Card className="mt-5 p-6">
            <h2 className="font-semibold">Sobre el solicitante</h2>
            <div className="mt-3 space-y-2 text-sm text-muted">
              {purchase.request.occupation && <p>💼 {purchase.request.occupation}</p>}
              {purchase.request.searchReason && <p>🔎 {purchase.request.searchReason}</p>}
              {purchase.request.additionalNotes && <p>📝 {purchase.request.additionalNotes}</p>}
            </div>
          </Card>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <WhatsAppButton
            phone={purchase.request.contactPhone}
            defaultMessage={agentToBuyerMessage({
              buyerName: purchase.request.contactName,
              agentName: user.name,
              propertyType: PROPERTY_TYPE_LABELS[purchase.request.propertyType].toLowerCase(),
              zone: purchase.request.sector || purchase.request.ciudad,
            })}
          />
          {purchase.request.contactEmail && (
            <a href={`mailto:${purchase.request.contactEmail}`} className={buttonClasses("secondary", "sm")}>
              Email
            </a>
          )}
          {purchase.status === "PURCHASED" && (
            <form action={markContactedAction.bind(null, purchase.id)}>
              <button type="submit" className={buttonClasses("secondary", "sm")}>
                Contacté al lead
              </button>
            </form>
          )}
          {(purchase.status === "PURCHASED" ||
            purchase.status === "CONTACTED" ||
            purchase.status === "RESPONDED") && (
            <form action={markAppointmentAction.bind(null, purchase.id)}>
              <button type="submit" className={buttonClasses("secondary", "sm")}>
                Marcar cita agendada
              </button>
            </form>
          )}
          {active && <ReleaseLeadDialog leadPurchaseId={purchase.id} />}
        </div>

        <Card className="mt-6 p-6">
          <h2 className="font-semibold">Tus propiedades</h2>
          <p className="mt-1 text-sm text-muted">
            Comparte una propiedad disponible con este comprador. Solo tú la ves hasta que la
            envías.
          </p>
          {availableProperties.length === 0 ? (
            <p className="mt-4 text-sm text-muted-2">
              No tienes propiedades disponibles para compartir ahora mismo.
            </p>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {availableProperties.map((p) => {
                const alreadyShared = sharedPropertyIds.has(p.id);
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{p.title}</p>
                      <p className="text-xs text-muted-2">{formatUSD(p.price)}</p>
                    </div>
                    {alreadyShared ? (
                      <Badge tone="success">Compartida</Badge>
                    ) : (
                      <form action={sharePropertyAction.bind(null, purchase.id, p.id)}>
                        <button type="submit" className={buttonClasses("secondary", "sm")}>
                          Enviar
                        </button>
                      </form>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="mt-6 p-6">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-accent" />
            <h2 className="font-semibold">Protección del lead</h2>
          </div>
          <p className="mt-2 text-sm text-muted">
            Si el usuario no responde después de tus intentos de contacto,
            puedes solicitar la devolución del crédito utilizado para este
            lead. La garantía únicamente cubre que el usuario no haya
            respondido — no garantiza que comprará, agendará una visita o
            cerrará una venta.
          </p>
          {purchase.status === "REFUND_REQUESTED" ? (
            <p className="mt-4 text-sm text-muted-2">
              Ya solicitaste la devolución de este lead. Está pendiente de
              revisión por un administrador.
            </p>
          ) : purchase.status === "REFUNDED" ? (
            <p className="mt-4 text-sm text-success">
              Este lead ya fue devuelto: recuperaste el crédito.
            </p>
          ) : canRequestRefund ? (
            <div className="mt-4">
              <RequestRefundDialog leadPurchaseId={purchase.id} />
            </div>
          ) : purchase.status === "CONTACTED" ? (
            <p className="mt-4 text-sm text-muted-2">
              Vas a poder solicitar la devolución {refundEligibleHours}h
              después de marcar &quot;Contacté al lead&quot;, si el usuario
              no responde.
            </p>
          ) : (
            <p className="mt-4 text-sm text-muted-2">
              Marca &quot;Contacté al lead&quot; primero para habilitar la
              devolución si el usuario no responde.
            </p>
          )}
        </Card>
      </main>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-2">{label}</p>
      <p className="mt-0.5 text-sm font-medium">{value}</p>
    </div>
  );
}
