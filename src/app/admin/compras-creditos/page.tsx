import { requireAdmin } from "@/lib/auth";
import { listAllCreditPurchases } from "@/lib/services/creditPurchases";
import { CREDIT_PACKAGES } from "@/lib/services/creditPackages";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { formatDate, formatUSD } from "@/lib/format";
import { CREDIT_PURCHASE_STATUS_LABELS } from "@/lib/enums";
import { ADMIN_NAV_LINKS } from "../nav";
import { approveCreditPurchaseAction } from "./actions";
import { RejectDialog } from "./RejectDialog";

export const dynamic = "force-dynamic";

const STATUS_TONE = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
} as const;

export default async function AdminCreditPurchasesPage() {
  const user = await requireAdmin();
  const purchases = await listAllCreditPurchases();
  const pending = purchases.filter((p) => p.status === "PENDING");

  return (
    <>
      <DashboardHeader userName={user.name} links={ADMIN_NAV_LINKS} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-bold tracking-tight">
          Compras de créditos
        </h1>
        <p className="mt-1 text-sm text-muted">
          Pago manual: revisa que el agente haya pagado antes de aprobar —
          eso es lo único que acredita los créditos.
        </p>

        <h2 className="mt-6 font-semibold">
          Pagos pendientes ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <Card className="mt-3 p-6 text-center text-sm text-muted">
            No hay pagos pendientes de revisión.
          </Card>
        ) : (
          <div className="mt-3 space-y-3">
            {pending.map((p) => (
              <Card key={p.id} className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{p.agent.user.name}</p>
                    <p className="text-sm text-muted">
                      Paquete {CREDIT_PACKAGES[p.package].name} ·{" "}
                      {formatUSD(p.amount)} · {p.credits} créditos
                    </p>
                    <p className="mt-1 text-xs text-muted-2">
                      Enviado el {formatDate(p.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {p.receiptImageMimeType && (
                      <a
                        href={`/api/comprobantes/${p.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={buttonClasses("secondary", "sm")}
                      >
                        Ver comprobante
                      </a>
                    )}
                    <form action={approveCreditPurchaseAction.bind(null, p.id)}>
                      <button type="submit" className={buttonClasses("primary", "sm")}>
                        Aprobar
                      </button>
                    </form>
                    <RejectDialog requestId={p.id} />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        <h2 className="mt-8 font-semibold">Historial completo</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-2">
              <tr>
                <th className="pb-2">Agente</th>
                <th className="pb-2">Paquete</th>
                <th className="pb-2">Precio</th>
                <th className="pb-2">Créditos</th>
                <th className="pb-2">Fecha</th>
                <th className="pb-2">Estado</th>
                <th className="pb-2">Comprobante</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="py-2.5">{p.agent.user.name}</td>
                  <td className="py-2.5">{CREDIT_PACKAGES[p.package].name}</td>
                  <td className="py-2.5">{formatUSD(p.amount)}</td>
                  <td className="py-2.5">{p.credits}</td>
                  <td className="py-2.5">{formatDate(p.createdAt)}</td>
                  <td className="py-2.5">
                    <Badge tone={STATUS_TONE[p.status]}>
                      {CREDIT_PURCHASE_STATUS_LABELS[p.status]}
                    </Badge>
                  </td>
                  <td className="py-2.5">
                    {p.receiptImageMimeType ? (
                      <a
                        href={`/api/comprobantes/${p.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent underline underline-offset-2"
                      >
                        Ver
                      </a>
                    ) : (
                      <span className="text-muted-2">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {purchases.length === 0 && (
            <Card className="mt-4 p-8 text-center text-sm text-muted">
              Todavía no hay compras de créditos.
            </Card>
          )}
        </div>
      </main>
    </>
  );
}
