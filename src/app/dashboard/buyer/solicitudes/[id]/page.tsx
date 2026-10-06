import { notFound } from "next/navigation";
import { ImageOff } from "lucide-react";
import { requireBuyer } from "@/lib/auth";
import { getBuyerRequestDetail } from "@/lib/services/requests";
import { BRAND_NAME } from "@/lib/brand";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonClasses } from "@/components/ui/Button";
import { formatUSD, formatDate } from "@/lib/format";
import { propertyPhotoUrl } from "@/lib/propertyPhotos";
import {
  PROPERTY_TYPE_LABELS,
  OPERATION_TYPE_LABELS,
  REQUEST_STATUS_LABELS,
  LEAD_PURCHASE_STATUS_LABELS,
  PROPERTY_STATUS_LABELS,
  BUYER_OUTCOME_OPTIONS,
} from "@/lib/enums";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import {
  updateMaxAgentsAction,
  pauseRequestAction,
  resumeRequestAction,
  closeRequestAction,
  markOutcomeAction,
} from "./actions";
import { OCCUPYING_STATUSES } from "@/lib/services/constants";

export const dynamic = "force-dynamic";

export default async function BuyerRequestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { id } = await params;
  const { created } = await searchParams;
  const user = await requireBuyer();
  const request = await getBuyerRequestDetail(user.buyerProfileId!, id);
  if (!request) notFound();

  const activePurchases = request.purchases.filter((p) =>
    OCCUPYING_STATUSES.includes(p.status),
  );

  return (
    <>
      <DashboardHeader
        userName={user.name}
        links={[{ href: "/dashboard/buyer", label: "Mis solicitudes" }]}
      />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        {created === "1" && (
          <Card className="mb-6 border-success/30 bg-success-bg p-4 text-sm text-success">
            <p className="font-semibold">¡Solicitud publicada!</p>
            <p className="mt-1 text-success/90">
              Los agentes podrán encontrar tu solicitud si tienen una
              propiedad que coincida con lo que buscas.
            </p>
          </Card>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">
            {PROPERTY_TYPE_LABELS[request.propertyType]} en {request.ciudad}
          </h1>
          <Badge tone="accent">{REQUEST_STATUS_LABELS[request.status]}</Badge>
        </div>

        <Card className="mt-5 grid gap-4 p-6 sm:grid-cols-2">
          <Info label="Operación" value={OPERATION_TYPE_LABELS[request.operationType]} />
          <Info
            label="Ubicación"
            value={[request.provincia, request.ciudad, request.sector].filter(Boolean).join(" · ")}
          />
          <Info label="Presupuesto" value={`${formatUSD(request.priceMin)} – ${formatUSD(request.priceMax)}`} />
          <Info label="Publicada" value={formatDate(request.createdAt)} />
          {request.bedrooms != null && <Info label="Habitaciones" value={String(request.bedrooms)} />}
          {request.minSquareMeters != null && (
            <Info label="Metros cuadrados mínimos" value={`${request.minSquareMeters} m²`} />
          )}
        </Card>

        <Card className="mt-5 space-y-4 p-6">
          <h2 className="font-semibold">Configuración</h2>
          <form action={updateMaxAgentsAction.bind(null, request.id)} className="flex items-center gap-3">
            <span className="text-sm text-muted">Máximo de agentes:</span>
            <select name="maxAgents" defaultValue={request.maxAgents} className="rounded-lg border border-border px-2 py-1 text-sm">
              {[1, 3, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <button type="submit" className={buttonClasses("secondary", "sm")}>
              Guardar
            </button>
          </form>
          <div className="flex flex-wrap gap-2">
            {request.status === "PAUSADA" ? (
              <form action={resumeRequestAction.bind(null, request.id)}>
                <Button size="sm" variant="secondary">Reanudar búsqueda</Button>
              </form>
            ) : (
              request.status !== "CERRADA" && (
                <form action={pauseRequestAction.bind(null, request.id)}>
                  <Button size="sm" variant="secondary">Pausar</Button>
                </form>
              )
            )}
            {request.status !== "CERRADA" && (
              <form action={closeRequestAction.bind(null, request.id)}>
                <Button size="sm" variant="danger">Ya encontré una propiedad / cerrar</Button>
              </form>
            )}
          </div>
        </Card>

        <h2 className="mt-8 font-semibold">
          Agentes conectados ({activePurchases.length}/{request.maxAgents})
        </h2>
        {request.purchases.length === 0 ? (
          <Card className="mt-3 p-6 text-sm text-muted">
            Todavía ningún agente desbloqueó tu solicitud.
          </Card>
        ) : (
          <div className="mt-3 space-y-3">
            {request.purchases.map((p) => (
              <Card key={p.id} className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{p.agent.user.name}</p>
                    {p.agent.company && (
                      <p className="text-sm text-muted">{p.agent.company}</p>
                    )}
                  </div>
                  <Badge tone="neutral">{LEAD_PURCHASE_STATUS_LABELS[p.status]}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-sm">
                  <a
                    href={buildWhatsAppLink(
                      p.agent.whatsapp || p.agent.user.phone || "",
                      `Hola ${p.agent.user.name}, te contacto por ${BRAND_NAME}.`,
                    )}
                    target="_blank"
                    className={buttonClasses("accent2", "sm")}
                  >
                    WhatsApp
                  </a>
                  <a href={`tel:${p.agent.user.phone}`} className={buttonClasses("secondary", "sm")}>
                    Llamar
                  </a>
                  {p.agent.user.email && (
                    <a href={`mailto:${p.agent.user.email}`} className={buttonClasses("secondary", "sm")}>
                      Email
                    </a>
                  )}
                </div>
                {p.propertyShares.length > 0 && (
                  <div className="mt-4 border-t border-border pt-4">
                    <p className="text-sm font-medium">Propiedades que te compartió</p>
                    <div className="mt-2 grid gap-3 sm:grid-cols-2">
                      {p.propertyShares.map((share) => (
                        <div
                          key={share.id}
                          className="flex gap-3 rounded-xl border border-border p-3"
                        >
                          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-hover">
                            {share.property?.images[0] ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={propertyPhotoUrl(share.property.images[0].id)}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <ImageOff className="text-muted-2" size={18} />
                            )}
                          </div>
                          <div className="min-w-0">
                            {share.property ? (
                              <>
                                <div className="flex items-center gap-2">
                                  <p className="truncate text-sm font-medium">
                                    {share.property.title}
                                  </p>
                                  {share.property.status !== "DISPONIBLE" && (
                                    <Badge tone="neutral">
                                      {PROPERTY_STATUS_LABELS[share.property.status]}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted">
                                  {formatUSD(share.property.price)}
                                </p>
                                <p className="truncate text-xs text-muted-2">
                                  {[share.property.provincia, share.property.ciudad, share.property.sector]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </p>
                              </>
                            ) : (
                              <p className="text-sm text-muted-2">
                                Esta propiedad ya no está disponible.
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {OCCUPYING_STATUSES.includes(p.status) && (
                  <form
                    action={markOutcomeAction.bind(null, request.id)}
                    className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4"
                  >
                    <input type="hidden" name="leadPurchaseId" value={p.id} />
                    <span className="text-sm text-muted">¿Qué ocurrió?</span>
                    <select name="outcome" className="rounded-lg border border-border px-2 py-1 text-sm">
                      {BUYER_OUTCOME_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className={buttonClasses("secondary", "sm")}>
                      Confirmar
                    </button>
                  </form>
                )}
              </Card>
            ))}
          </div>
        )}
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
