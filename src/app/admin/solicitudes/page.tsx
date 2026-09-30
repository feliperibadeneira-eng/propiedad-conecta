import { requireAdmin } from "@/lib/auth";
import { listAllRequests } from "@/lib/services/admin";
import { isEligibleForReactivation } from "@/lib/services/purchase";
import { getReactivationHours } from "@/lib/settings";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Field, inputBase } from "@/components/ui/Field";
import { buttonClasses } from "@/components/ui/Button";
import { formatUSD, formatDate } from "@/lib/format";
import {
  PROPERTY_TYPE_LABELS,
  REQUEST_STATUS_LABELS,
  LEAD_PURCHASE_STATUS_LABELS,
} from "@/lib/enums";
import { ADMIN_NAV_LINKS } from "../nav";
import { adminSetStatusAction, adminReactivateAction } from "./actions";
import type { RequestStatus } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

export default async function AdminRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: RequestStatus; search?: string }>;
}) {
  const user = await requireAdmin();
  const sp = await searchParams;
  const requests = await listAllRequests({ status: sp.status, search: sp.search });
  const reactivationHours = await getReactivationHours();

  return (
    <>
      <DashboardHeader userName={user.name} links={ADMIN_NAV_LINKS} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-bold tracking-tight">Solicitudes</h1>

        <Card className="mt-4 p-4">
          <form className="flex flex-wrap items-end gap-3" method="get">
            <Field label="Buscar">
              <input name="search" defaultValue={sp.search} className={inputBase} placeholder="Ciudad, sector, nombre..." />
            </Field>
            <Field label="Estado">
              <select name="status" defaultValue={sp.status ?? ""} className={inputBase}>
                <option value="">Todos</option>
                {Object.entries(REQUEST_STATUS_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <button type="submit" className={buttonClasses("primary", "sm")}>
              Filtrar
            </button>
          </form>
        </Card>

        <div className="mt-5 space-y-3">
          {requests.map((r) => (
            <Card key={r.id} className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">
                    {PROPERTY_TYPE_LABELS[r.propertyType]} en {r.ciudad}
                    {r.sector ? ` · ${r.sector}` : ""}
                  </p>
                  <p className="text-sm text-muted">
                    {r.buyer.user.name} · {formatUSD(r.priceMin)}–{formatUSD(r.priceMax)} ·{" "}
                    {formatDate(r.createdAt)} · {r.connectedAgents}/{r.maxAgents} agentes
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="accent">{REQUEST_STATUS_LABELS[r.status]}</Badge>
                  {r.status !== "CERRADA" && (
                    <form action={adminSetStatusAction.bind(null, r.id, "CERRADA" as RequestStatus)}>
                      <button type="submit" className={buttonClasses("secondary", "sm")}>
                        Cerrar
                      </button>
                    </form>
                  )}
                  {r.status === "PAUSADA" && (
                    <form action={adminSetStatusAction.bind(null, r.id, "BUSCANDO" as RequestStatus)}>
                      <button type="submit" className={buttonClasses("secondary", "sm")}>
                        Reanudar
                      </button>
                    </form>
                  )}
                </div>
              </div>

              {r.purchases.length > 0 && (
                <div className="mt-3 space-y-1.5 border-t border-border pt-3">
                  {r.purchases.map((p) => {
                    const eligible = isEligibleForReactivation(p, reactivationHours);
                    return (
                      <div key={p.id} className="flex items-center justify-between text-sm">
                        <span className="text-muted">
                          {LEAD_PURCHASE_STATUS_LABELS[p.status]} · comprado{" "}
                          {formatDate(p.purchasedAt)}
                        </span>
                        {eligible && (
                          <form action={adminReactivateAction.bind(null, p.id)}>
                            <button type="submit" className={buttonClasses("secondary", "sm")}>
                              Reactivar
                            </button>
                          </form>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          ))}
        </div>
      </main>
    </>
  );
}
