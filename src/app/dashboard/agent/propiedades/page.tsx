import Link from "next/link";
import { ImageOff } from "lucide-react";
import { requireAgent } from "@/lib/auth";
import { listAgentProperties } from "@/lib/services/properties";
import { getCreditsBalance } from "@/lib/services/agentProfile";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { formatUSD } from "@/lib/format";
import { OPERATION_TYPE_LABELS, PROPERTY_TYPE_LABELS, PROPERTY_STATUS_LABELS } from "@/lib/enums";
import { propertyPhotoUrl } from "@/lib/propertyPhotos";
import { AGENT_NAV_LINKS } from "../nav";
import type { PropertyStatus } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<PropertyStatus, "success" | "warning" | "neutral"> = {
  DISPONIBLE: "success",
  PAUSADA: "warning",
  CERRADA: "neutral",
};

export default async function AgentPropertiesPage() {
  const user = await requireAgent();
  const [properties, creditsBalance] = await Promise.all([
    listAgentProperties(user.agentProfileId!),
    getCreditsBalance(user.agentProfileId!),
  ]);

  return (
    <>
      <DashboardHeader userName={user.name} links={AGENT_NAV_LINKS} creditsBalance={creditsBalance} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Mis propiedades</h1>
            <p className="mt-1 text-sm text-muted">
              Tu catálogo privado — solo tú puedes verlo y administrarlo.
            </p>
          </div>
          <Link href="/dashboard/agent/propiedades/nueva" className={buttonClasses("primary", "md")}>
            + Nueva propiedad
          </Link>
        </div>

        {properties.length === 0 ? (
          <Card className="mt-6 p-8 text-center text-sm text-muted">
            Todavía no tienes propiedades publicadas.
          </Card>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {properties.map((p) => (
              <Link key={p.id} href={`/dashboard/agent/propiedades/${p.id}`}>
                <Card interactive className="h-full overflow-hidden p-0">
                  <div className="flex h-36 items-center justify-center bg-surface-hover">
                    {p.images[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={propertyPhotoUrl(p.images[0].id)}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <ImageOff className="text-muted-2" size={28} />
                    )}
                  </div>
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="font-semibold">{p.title}</h2>
                      <Badge tone={STATUS_TONE[p.status]}>{PROPERTY_STATUS_LABELS[p.status]}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {OPERATION_TYPE_LABELS[p.operationType]} · {PROPERTY_TYPE_LABELS[p.propertyType]}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {[p.provincia, p.ciudad, p.sector].filter(Boolean).join(" · ")}
                    </p>
                    <p className="mt-3 text-lg font-bold">{formatUSD(p.price)}</p>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
