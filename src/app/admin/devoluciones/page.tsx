import { requireAdmin } from "@/lib/auth";
import { listRefundRequests } from "@/lib/services/admin";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { formatDate } from "@/lib/format";
import { PROPERTY_TYPE_LABELS } from "@/lib/enums";
import { ADMIN_NAV_LINKS } from "../nav";
import { approveRefundAction, rejectRefundAction } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_LABEL = {
  REFUND_REQUESTED: "Pendiente",
  REFUNDED: "Aprobada",
  CLOSED: "Rechazada",
} as const;

const STATUS_TONE = {
  REFUND_REQUESTED: "warning",
  REFUNDED: "success",
  CLOSED: "neutral",
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
          Un agente pide la devolución de su crédito cuando el usuario no
          respondió después de sus intentos de contacto.
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
                      LEAD #{r.id.slice(0, 8).toUpperCase()}
                    </p>
                    <p className="font-semibold">
                      {PROPERTY_TYPE_LABELS[r.request.propertyType]} en{" "}
                      {r.request.ciudad}
                    </p>
                    <p className="text-sm text-muted">
                      Agente: {r.agent.user.name} · Usuario:{" "}
                      {r.request.buyer.user.name}
                    </p>
                    <p className="mt-1 text-xs text-muted-2">
                      Solicitada el{" "}
                      {r.refundRequestedAt ? formatDate(r.refundRequestedAt) : "—"}
                      {" · "}Motivo: el usuario no respondió
                    </p>
                  </div>
                  <Badge tone={STATUS_TONE[r.status as keyof typeof STATUS_TONE]}>
                    {STATUS_LABEL[r.status as keyof typeof STATUS_LABEL]}
                  </Badge>
                </div>

                {r.status === "REFUND_REQUESTED" && (
                  <div className="mt-4 flex gap-2">
                    <form action={approveRefundAction.bind(null, r.id)}>
                      <button type="submit" className={buttonClasses("primary", "sm")}>
                        Aprobar (+1 crédito)
                      </button>
                    </form>
                    <form action={rejectRefundAction.bind(null, r.id)}>
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
