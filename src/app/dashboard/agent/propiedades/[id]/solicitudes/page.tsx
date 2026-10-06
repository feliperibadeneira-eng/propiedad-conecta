import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAgent } from "@/lib/auth";
import { getAgentPropertyDetail } from "@/lib/services/properties";
import { listCompatibleRequestsForProperty } from "@/lib/services/propertyMatching";
import { getCreditsBalance } from "@/lib/services/agentProfile";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Card } from "@/components/ui/Card";
import { PropertyMatchCard } from "@/components/PropertyMatchCard";
import { AGENT_NAV_LINKS } from "../../../nav";

export const dynamic = "force-dynamic";

export default async function PropertyCompatibleRequestsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireAgent();
  const [property, creditsBalance] = await Promise.all([
    getAgentPropertyDetail(user.agentProfileId!, id),
    getCreditsBalance(user.agentProfileId!),
  ]);
  if (!property) notFound();

  const matches = await listCompatibleRequestsForProperty(user.agentProfileId!, id);

  return (
    <>
      <DashboardHeader userName={user.name} links={AGENT_NAV_LINKS} creditsBalance={creditsBalance} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <Link
          href={`/dashboard/agent/propiedades/${property.id}`}
          className="text-sm text-muted hover:text-foreground"
        >
          ← {property.title}
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Solicitudes compatibles</h1>
        <p className="mt-1 text-sm text-muted">
          Compradores cuya solicitud podría encajar con esta propiedad. El nombre, teléfono y
          email del comprador permanecen ocultos hasta que desbloquees el contacto.
        </p>

        {property.status !== "DISPONIBLE" ? (
          <Card className="mt-6 p-8 text-center text-sm text-muted">
            Esta propiedad no está disponible, así que no se buscan solicitudes compatibles.
            Márcala como disponible desde el detalle para activar el matching.
          </Card>
        ) : matches.length === 0 ? (
          <Card className="mt-6 p-8 text-center text-sm text-muted">
            Todavía no hay solicitudes compatibles con esta propiedad.
          </Card>
        ) : (
          <div className="mt-6 space-y-4">
            {matches.map((m) => (
              <PropertyMatchCard key={m.id} {...m} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
