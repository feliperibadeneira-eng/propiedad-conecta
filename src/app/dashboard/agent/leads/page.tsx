import { requireAgent } from "@/lib/auth";
import { getAvailableRequestsForAgent, type LeadSort } from "@/lib/services/leads";
import { getCreditsBalance } from "@/lib/services/agentProfile";
import { DashboardHeader } from "@/components/DashboardHeader";
import { LeadCard } from "@/components/LeadCard";
import { Card } from "@/components/ui/Card";
import { inputBase } from "@/components/ui/Field";
import { buttonClasses } from "@/components/ui/Button";
import { OPERATION_TYPE_LABELS, PROPERTY_TYPE_LABELS } from "@/lib/enums";
import type { OperationType, PropertyType } from "@/generated/prisma/enums";
import { AGENT_NAV_LINKS } from "../nav";

export const dynamic = "force-dynamic";

export default async function AgentLeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireAgent();
  const sp = await searchParams;

  const filters = {
    operationType: sp.operationType as OperationType | undefined,
    propertyType: sp.propertyType as PropertyType | undefined,
    ciudad: sp.ciudad || undefined,
    sector: sp.sector || undefined,
    priceMin: sp.priceMin ? Number(sp.priceMin) : undefined,
    priceMax: sp.priceMax ? Number(sp.priceMax) : undefined,
    bedrooms: sp.bedrooms ? Number(sp.bedrooms) : undefined,
  };
  const sort = (sp.sort as LeadSort) || "recientes";

  const [requests, creditsBalance] = await Promise.all([
    getAvailableRequestsForAgent(user.agentProfileId!, filters, sort),
    getCreditsBalance(user.agentProfileId!),
  ]);

  return (
    <>
      <DashboardHeader
        userName={user.name}
        links={AGENT_NAV_LINKS}
        creditsBalance={creditsBalance}
      />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-bold tracking-tight">
          Marketplace de solicitudes
        </h1>
        <p className="mt-1 text-sm text-muted">
          {requests.length} solicitudes disponibles para desbloquear.
        </p>

        <Card className="mt-5 p-4">
          <form className="flex flex-wrap items-end gap-3" method="get">
            <SelectFilter name="operationType" label="Operación" options={OPERATION_TYPE_LABELS} value={sp.operationType} />
            <SelectFilter name="propertyType" label="Tipo" options={PROPERTY_TYPE_LABELS} value={sp.propertyType} />
            <TextFilter name="ciudad" label="Ciudad" value={sp.ciudad} />
            <TextFilter name="sector" label="Sector" value={sp.sector} />
            <NumberFilter name="bedrooms" label="Habitaciones mín." value={sp.bedrooms} />
            <label className="text-sm">
              <span className="mb-1.5 block font-medium">Ordenar por</span>
              <select name="sort" defaultValue={sort} className={inputBase}>
                <option value="recientes">Más recientes</option>
                <option value="compatibilidad">Mayor compatibilidad</option>
                <option value="intencion">Mayor intención</option>
              </select>
            </label>
            <button type="submit" className={buttonClasses("primary", "sm")}>
              Filtrar
            </button>
          </form>
        </Card>

        {requests.length === 0 ? (
          <Card className="mt-6 p-8 text-center text-sm text-muted">
            No hay solicitudes disponibles con esos filtros.
          </Card>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {requests.map((r) => (
              <LeadCard
                key={r.id}
                id={r.id}
                propertyType={r.propertyType}
                ciudad={r.ciudad}
                sector={r.sector}
                priceMin={r.priceMin}
                priceMax={r.priceMax}
                bedrooms={r.bedrooms}
                minSquareMeters={r.minSquareMeters}
                parkingSpots={r.parkingSpots}
                createdAt={r.createdAt}
                matchScore={r.matchScore}
                unlockCost={r.unlockCost}
                trustSignals={r.trustSignals}
                personalBlurb={r.searchReason || r.occupation}
              />
            ))}
          </div>
        )}
      </main>
    </>
  );
}

function SelectFilter({
  name,
  label,
  options,
  value,
}: {
  name: string;
  label: string;
  options: Record<string, string>;
  value?: string;
}) {
  return (
    <label className="text-sm">
      <span className="mb-1.5 block font-medium">{label}</span>
      <select name={name} defaultValue={value ?? ""} className={inputBase}>
        <option value="">Todos</option>
        {Object.entries(options).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextFilter({ name, label, value }: { name: string; label: string; value?: string }) {
  return (
    <label className="text-sm">
      <span className="mb-1.5 block font-medium">{label}</span>
      <input name={name} defaultValue={value ?? ""} className={inputBase} />
    </label>
  );
}

function NumberFilter({ name, label, value }: { name: string; label: string; value?: string }) {
  return (
    <label className="text-sm">
      <span className="mb-1.5 block font-medium">{label}</span>
      <input name={name} type="number" defaultValue={value ?? ""} className={`${inputBase} w-28`} />
    </label>
  );
}
