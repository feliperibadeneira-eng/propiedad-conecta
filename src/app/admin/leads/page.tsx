import { requireAdmin } from "@/lib/auth";
import { listLeadPurchases } from "@/lib/services/admin";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/format";
import { LEAD_PURCHASE_STATUS_LABELS, PROPERTY_TYPE_LABELS } from "@/lib/enums";
import { ADMIN_NAV_LINKS } from "../nav";

export const dynamic = "force-dynamic";

export default async function AdminLeadsPage() {
  const user = await requireAdmin();
  const purchases = await listLeadPurchases();

  return (
    <>
      <DashboardHeader userName={user.name} links={ADMIN_NAV_LINKS} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-bold tracking-tight">Leads vendidos</h1>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-2">
              <tr>
                <th className="pb-2">Buyer</th>
                <th className="pb-2">Agente</th>
                <th className="pb-2">Solicitud</th>
                <th className="pb-2">Crédito</th>
                <th className="pb-2">Fecha</th>
                <th className="pb-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="py-2.5">{p.request.buyer.user.name}</td>
                  <td className="py-2.5">{p.agent.user.name}</td>
                  <td className="py-2.5">
                    {PROPERTY_TYPE_LABELS[p.request.propertyType]} en {p.request.ciudad}
                  </td>
                  <td className="py-2.5">{p.creditsUsed}</td>
                  <td className="py-2.5">{formatDate(p.purchasedAt)}</td>
                  <td className="py-2.5">
                    <Badge tone="neutral">{LEAD_PURCHASE_STATUS_LABELS[p.status]}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {purchases.length === 0 && (
            <Card className="mt-4 p-8 text-center text-sm text-muted">
              Todavía no hay leads vendidos.
            </Card>
          )}
        </div>
      </main>
    </>
  );
}
