import { requireAdmin } from "@/lib/auth";
import { listPayments } from "@/lib/services/admin";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/format";
import { PAYMENT_STATUS_LABELS } from "@/lib/enums";
import { ADMIN_NAV_LINKS } from "../nav";
import type { PaymentStatus } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

const TONE: Record<PaymentStatus, "success" | "warning" | "danger" | "neutral"> = {
  SUCCEEDED: "success",
  PENDING: "warning",
  FAILED: "danger",
  REFUNDED: "neutral",
};

export default async function AdminPaymentsPage() {
  const user = await requireAdmin();
  const payments = await listPayments();

  return (
    <>
      <DashboardHeader userName={user.name} links={ADMIN_NAV_LINKS} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-bold tracking-tight">Pagos</h1>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-2">
              <tr>
                <th className="pb-2">Transacción</th>
                <th className="pb-2">Agente</th>
                <th className="pb-2">Monto</th>
                <th className="pb-2">Estado</th>
                <th className="pb-2">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="py-2.5 font-mono text-xs">{p.id.slice(0, 8)}</td>
                  <td className="py-2.5">{p.agent.user.name}</td>
                  <td className="py-2.5">
                    {p.currency === "credit"
                      ? `${p.amount} crédito${Number(p.amount) > 1 ? "s" : ""}`
                      : `$${p.amount}`}
                  </td>
                  <td className="py-2.5">
                    <Badge tone={TONE[p.status]}>{PAYMENT_STATUS_LABELS[p.status]}</Badge>
                  </td>
                  <td className="py-2.5">{formatDate(p.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {payments.length === 0 && (
            <Card className="mt-4 p-8 text-center text-sm text-muted">
              Todavía no hay pagos.
            </Card>
          )}
        </div>
      </main>
    </>
  );
}
