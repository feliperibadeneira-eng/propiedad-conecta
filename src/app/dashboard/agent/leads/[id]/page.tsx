import Link from "next/link";
import { notFound } from "next/navigation";
import { Check } from "lucide-react";
import { requireAgent } from "@/lib/auth";
import { getRequestForAgentDetail } from "@/lib/services/leads";
import { logEvent } from "@/lib/services/analytics";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { formatUSD, formatDate, formatRelativeTime } from "@/lib/format";
import {
  PROPERTY_TYPE_LABELS,
  OPERATION_TYPE_LABELS,
  formatFeatureBadge,
} from "@/lib/enums";
import { matchLabel } from "@/lib/services/matching";
import { AGENT_NAV_LINKS } from "../../nav";
import { UnlockDialog } from "./UnlockDialog";

export const dynamic = "force-dynamic";

export default async function AgentLeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireAgent();
  const request = await getRequestForAgentDetail(user.agentProfileId!, id);
  if (!request) notFound();

  await logEvent("lead_viewed", {
    userId: user.id,
    requestId: request.id,
    agentId: user.agentProfileId!,
  });

  return (
    <>
      <DashboardHeader
        userName={user.name}
        links={AGENT_NAV_LINKS}
        creditsBalance={request.agentCreditsBalance}
      />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">
            {PROPERTY_TYPE_LABELS[request.propertyType]} en {request.ciudad}
          </h1>
          <Badge tone="accent">
            {request.matchScore}% · {matchLabel(request.matchScore)}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted-2">
          Publicado {formatRelativeTime(request.createdAt)}
        </p>

        <Card className="mt-5 grid gap-4 p-6 sm:grid-cols-2">
          <Info label="Operación" value={OPERATION_TYPE_LABELS[request.operationType]} />
          <Info
            label="Ubicación"
            value={[request.provincia, request.ciudad, request.sector].filter(Boolean).join(" · ")}
          />
          <Info label="Presupuesto" value={`${formatUSD(request.priceMin)} – ${formatUSD(request.priceMax)}`} />
          <Info label="Cupos disponibles" value={`${request.availableSlots} / ${request.maxAgents}`} />
          {request.bedrooms != null && <Info label="Habitaciones" value={String(request.bedrooms)} />}
          {request.bathrooms != null && <Info label="Baños" value={String(request.bathrooms)} />}
          {request.minSquareMeters != null && (
            <Info label="Metros cuadrados mínimos" value={`${request.minSquareMeters} m²`} />
          )}
          {request.parkingSpots != null && (
            <Info label="Parqueaderos" value={String(request.parkingSpots)} />
          )}
          {request.moveInDate && (
            <Info label="Fecha aproximada" value={formatDate(request.moveInDate)} />
          )}
        </Card>

        {request.features.length > 0 && (
          <Card className="mt-5 p-6">
            <h2 className="font-semibold">Características adicionales</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {request.features.map((f) => (
                <Badge key={f.id} tone="neutral">
                  {formatFeatureBadge(f.key, f.value)}
                </Badge>
              ))}
            </div>
          </Card>
        )}

        {(request.occupation || request.searchReason || request.additionalNotes) && (
          <Card className="mt-5 p-6">
            <h2 className="font-semibold">Información de la solicitud</h2>
            <div className="mt-3 space-y-2 text-sm text-muted">
              {request.occupation && <p>💼 {request.occupation}</p>}
              {request.searchReason && <p>🔎 {request.searchReason}</p>}
              {request.additionalNotes && <p>📝 {request.additionalNotes}</p>}
            </div>
          </Card>
        )}

        {request.trustSignals.length > 0 && (
          <Card className="mt-5 p-6">
            <h2 className="font-semibold">Señales de confianza</h2>
            <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
              {request.trustSignals.map((s) => (
                <span key={s.key} className="flex items-center gap-1.5 text-sm text-accent-2">
                  <Check size={14} /> {s.label}
                </span>
              ))}
            </div>
          </Card>
        )}

        <Card className="mt-5 border-dashed p-6 text-center text-sm text-muted">
          El nombre, teléfono y email del interesado permanecen ocultos
          hasta que desbloquees el contacto.
        </Card>

        <div className="mt-6">
          {request.alreadyPurchasedByThisAgent ? (
            <p className="text-center text-sm text-muted">
              Ya compraste el contacto de esta solicitud.{" "}
              <Link href="/dashboard/agent/leads/purchased" className="text-accent hover:underline">
                Ver en Mis leads
              </Link>
            </p>
          ) : !request.isPurchasable ? (
            <p className="text-center text-sm text-muted">
              Esta solicitud ya no está disponible.
            </p>
          ) : request.agentCreditsBalance < request.unlockCost ? (
            <Card className="p-6 text-center">
              <p className="font-semibold text-danger">
                No tienes suficientes créditos
              </p>
              <p className="mt-1 text-sm text-muted">
                Esta solicitud requiere {request.unlockCost} créditos. Tienes{" "}
                {request.agentCreditsBalance} créditos.
              </p>
              <Link
                href="/dashboard/agent/creditos"
                className={buttonClasses("primary", "md", "mt-4")}
              >
                Comprar créditos
              </Link>
            </Card>
          ) : (
            <UnlockDialog
              requestId={request.id}
              creditsBalance={request.agentCreditsBalance}
              unlockCost={request.unlockCost}
            />
          )}
        </div>
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
