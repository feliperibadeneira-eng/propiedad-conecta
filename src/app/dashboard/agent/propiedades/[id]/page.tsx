import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAgent } from "@/lib/auth";
import { getAgentPropertyDetail } from "@/lib/services/properties";
import { getCreditsBalance } from "@/lib/services/agentProfile";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonClasses } from "@/components/ui/Button";
import { formatUSD, formatDate } from "@/lib/format";
import {
  OPERATION_TYPE_LABELS,
  PROPERTY_TYPE_LABELS,
  PROPERTY_STATUS_LABELS,
} from "@/lib/enums";
import { propertyPhotoUrl } from "@/lib/propertyPhotos";
import { AGENT_NAV_LINKS } from "../../nav";
import { activatePropertyAction, pausePropertyAction, closePropertyAction } from "./actions";
import type { PropertyStatus } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<PropertyStatus, "success" | "warning" | "neutral"> = {
  DISPONIBLE: "success",
  PAUSADA: "warning",
  CERRADA: "neutral",
};

export default async function AgentPropertyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; updated?: string; photoError?: string }>;
}) {
  const { id } = await params;
  const { created, updated, photoError } = await searchParams;
  const user = await requireAgent();
  const [property, creditsBalance] = await Promise.all([
    getAgentPropertyDetail(user.agentProfileId!, id),
    getCreditsBalance(user.agentProfileId!),
  ]);
  if (!property) notFound();

  const primaryPhoto = property.images.find((img) => img.isPrimary) ?? property.images[0];
  const otherPhotos = property.images.filter((img) => img.id !== primaryPhoto?.id);

  return (
    <>
      <DashboardHeader userName={user.name} links={AGENT_NAV_LINKS} creditsBalance={creditsBalance} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        {created === "1" && (
          <Card className="mb-6 border-success/30 bg-success-bg p-4 text-sm text-success">
            ¡Propiedad publicada!
          </Card>
        )}
        {updated === "1" && (
          <Card className="mb-6 border-success/30 bg-success-bg p-4 text-sm text-success">
            Cambios guardados.
          </Card>
        )}
        {photoError === "1" && (
          <Card className="mb-6 border-warning/30 bg-warning-bg p-4 text-sm text-warning">
            La propiedad se publicó, pero hubo un problema guardando las fotos. Intenta de nuevo
            desde &quot;Editar&quot;.
          </Card>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{property.title}</h1>
          <Badge tone={STATUS_TONE[property.status]}>{PROPERTY_STATUS_LABELS[property.status]}</Badge>
        </div>

        {primaryPhoto ? (
          <div className="mt-5">
            <div className="aspect-[4/3] w-full overflow-hidden rounded-2xl border border-border bg-surface-hover">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={propertyPhotoUrl(primaryPhoto.id)}
                alt={property.title}
                className="h-full w-full object-cover"
              />
            </div>
            {otherPhotos.length > 0 && (
              <div className="mt-3 flex gap-2 overflow-x-auto">
                {otherPhotos.map((img) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={img.id}
                    src={propertyPhotoUrl(img.id)}
                    alt=""
                    className="h-20 w-20 shrink-0 rounded-lg border border-border object-cover"
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <Card className="mt-5 flex h-40 items-center justify-center p-6 text-sm text-muted">
            Esta propiedad todavía no tiene fotos.
          </Card>
        )}

        <Card className="mt-5 grid gap-4 p-6 sm:grid-cols-2">
          <Info label="Operación" value={OPERATION_TYPE_LABELS[property.operationType]} />
          <Info label="Tipo" value={PROPERTY_TYPE_LABELS[property.propertyType]} />
          <Info
            label="Ubicación"
            value={[property.provincia, property.ciudad, property.sector].filter(Boolean).join(" · ")}
          />
          <Info label="Precio" value={formatUSD(property.price)} />
          <Info label="Metros cuadrados" value={`${property.squareMeters} m²`} />
          {property.bedrooms != null && <Info label="Habitaciones" value={String(property.bedrooms)} />}
          {property.bathrooms != null && <Info label="Baños" value={String(property.bathrooms)} />}
          <Info label="Publicada" value={formatDate(property.createdAt)} />
        </Card>

        {property.description && (
          <Card className="mt-5 p-6">
            <h2 className="font-semibold">Descripción</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{property.description}</p>
          </Card>
        )}

        <Card className="mt-5 space-y-4 p-6">
          <h2 className="font-semibold">Administrar</h2>
          <div className="flex flex-wrap gap-2">
            <Link href={`/dashboard/agent/propiedades/${property.id}/editar`} className={buttonClasses("secondary", "sm")}>
              Editar
            </Link>
            <Link href={`/dashboard/agent/propiedades/${property.id}/solicitudes`} className={buttonClasses("accent2", "sm")}>
              Ver solicitudes compatibles
            </Link>
            {property.status !== "DISPONIBLE" && (
              <form action={activatePropertyAction.bind(null, property.id)}>
                <Button size="sm" variant="secondary">Marcar disponible</Button>
              </form>
            )}
            {property.status !== "PAUSADA" && property.status !== "CERRADA" && (
              <form action={pausePropertyAction.bind(null, property.id)}>
                <Button size="sm" variant="secondary">Pausar</Button>
              </form>
            )}
            {property.status !== "CERRADA" && (
              <form action={closePropertyAction.bind(null, property.id)}>
                <Button size="sm" variant="danger">Cerrar</Button>
              </form>
            )}
          </div>
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
