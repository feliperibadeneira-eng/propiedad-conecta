import { requireAdmin } from "@/lib/auth";
import { listRefundRequests } from "@/lib/services/admin";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { inputBase } from "@/components/ui/Field";
import { formatDate } from "@/lib/format";
import {
  PROPERTY_TYPE_LABELS,
  REFUND_CATEGORY_LABELS,
  REFUND_REQUEST_STATUS_LABELS,
} from "@/lib/enums";
import { ADMIN_NAV_LINKS } from "../nav";
import { approveRefundAction, rejectRefundAction } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_TONE = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "neutral",
} as const;

export default async function AdminRefundsPage() {
  const user = await requireAdmin();
  const refunds = await listRefundRequests();

  return (
    <>
      <DashboardHeader userName={user.name} links={ADMIN_NAV_LINKS} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-bold tracking-tight">
          Solicitudes de devolución
        </h1>
        <p className="mt-1 text-sm text-muted">
          Cada intento queda registrado por separado, incluidos los ya
          decididos — un lead puede tener varios a lo largo del tiempo.
        </p>

        {refunds.length === 0 ? (
          <Card className="mt-6 p-8 text-center text-sm text-muted">
            No hay solicitudes de devolución.
          </Card>
        ) : (
          <div className="mt-6 space-y-3">
            {refunds.map((r) => (
              <Card key={r.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-2">
                      LEAD #{r.leadPurchaseId.slice(0, 8).toUpperCase()}
                    </p>
                    <p className="font-semibold">
                      {PROPERTY_TYPE_LABELS[r.leadPurchase.request.propertyType]} en{" "}
                      {r.leadPurchase.request.ciudad}
                    </p>
                    <p className="text-sm text-muted">
                      Agente: {r.leadPurchase.agent.user.name} · Usuario:{" "}
                      {r.leadPurchase.request.buyer.user.name}
                    </p>
                    <p className="mt-1 text-xs text-muted-2">
                      Solicitada el {formatDate(r.requestedAt)} · Motivo:{" "}
                      {REFUND_CATEGORY_LABELS[r.category]}
                    </p>
                  </div>
                  <Badge tone={STATUS_TONE[r.status]}>
                    {REFUND_REQUEST_STATUS_LABELS[r.status]}
                  </Badge>
                </div>

                <p className="mt-3 text-sm text-foreground">{r.reason}</p>
                {r.evidence && (
                  <p className="mt-1 text-sm text-muted">Evidencia: {r.evidence}</p>
                )}

                {r.status !== "PENDING" && (
                  <p className="mt-2 text-xs text-muted-2">
                    Decidida el {r.decidedAt ? formatDate(r.decidedAt) : "—"}
                    {r.decidedBy ? ` por ${r.decidedBy.name}` : ""}
                    {r.decisionReason ? ` · Motivo de la decisión: ${r.decisionReason}` : ""}
                  </p>
                )}

                {r.status === "PENDING" && (
                  <div className="mt-4 flex flex-wrap gap-3">
                    <form
                      action={approveRefundAction.bind(null, r.id)}
                      className="flex min-w-[240px] flex-1 gap-2"
                    >
                      <textarea
                        name="decisionReason"
                        required
                        maxLength={1000}
                        rows={1}
                        placeholder="Motivo de la decisión"
                        className={`${inputBase} flex-1`}
                      />
                      <button type="submit" className={buttonClasses("primary", "sm")}>
                        Aprobar (+{r.leadPurchase.creditsUsed} crédito
                        {r.leadPurchase.creditsUsed > 1 ? "s" : ""})
                      </button>
                    </form>
                    <form
                      action={rejectRefundAction.bind(null, r.id)}
                      className="flex min-w-[240px] flex-1 gap-2"
                    >
                      <textarea
                        name="decisionReason"
                        required
                        maxLength={1000}
                        rows={1}
                        placeholder="Motivo de la decisión"
                        className={`${inputBase} flex-1`}
                      />
                      <button type="submit" className={buttonClasses("secondary", "sm")}>
                        Rechazar
                      </button>
                    </form>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
