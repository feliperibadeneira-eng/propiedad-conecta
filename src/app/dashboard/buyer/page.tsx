import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { requireBuyer } from "@/lib/auth";
import { listBuyerRequests } from "@/lib/services/requests";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { formatUSD, formatDate } from "@/lib/format";
import { PROPERTY_TYPE_LABELS, REQUEST_STATUS_LABELS } from "@/lib/enums";
import type { RequestStatus } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<RequestStatus, "accent" | "success" | "warning" | "neutral"> = {
  BUSCANDO: "accent",
  EN_PROCESO: "success",
  PAUSADA: "warning",
  CERRADA: "neutral",
};

export default async function BuyerDashboardPage() {
  const user = await requireBuyer();
  const requests = await listBuyerRequests(user.buyerProfileId!, user.id);
  // Ya tenemos el no leído de cada solicitud (ver listBuyerRequests) — su
  // suma es el mismo total que el header pediría por su cuenta, así que se
  // lo pasamos para evitar esa consulta redundante al montar (mismo patrón
  // ya usado en las otras 2 páginas del comprador desde la fase 1.1).
  const totalUnread = requests.reduce((sum, r) => sum + r.unreadCount, 0);

  return (
    <>
      <DashboardHeader
        userName={user.name}
        links={[{ href: "/dashboard/buyer", label: "Mis solicitudes" }]}
        initialUnreadCount={totalUnread}
      />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Mis solicitudes</h1>
          <Link href="/buscar" className={buttonClasses("primary", "sm")}>
            Nueva solicitud
          </Link>
        </div>

        {requests.length === 0 ? (
          <Card className="mt-6 p-8 text-center text-sm text-muted">
            Todavía no publicaste ninguna solicitud.
          </Card>
        ) : (
          <div className="mt-6 space-y-3">
            {requests.map((r) => (
              <Link key={r.id} href={`/dashboard/buyer/solicitudes/${r.id}`}>
                <Card interactive className="flex flex-wrap items-center justify-between gap-3 p-5">
                  <div>
                    <p className="font-semibold">
                      {PROPERTY_TYPE_LABELS[r.propertyType]} en {r.ciudad}
                    </p>
                    <p className="text-sm text-muted">
                      {formatUSD(r.priceMin)} – {formatUSD(r.priceMax)} ·{" "}
                      {formatDate(r.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {!!r.unreadCount && (
                      <span
                        className="flex items-center gap-1 bg-accent/10 px-2 py-1 text-xs font-medium text-accent"
                        aria-label={`${r.unreadCount} mensaje${r.unreadCount === 1 ? "" : "s"} sin leer`}
                      >
                        <MessageCircle size={12} /> {r.unreadCount}
                      </span>
                    )}
                    <span className="text-sm text-muted">
                      {r.connectedAgents}/{r.maxAgents} agentes
                    </span>
                    <Badge tone={STATUS_TONE[r.status]}>
                      {REQUEST_STATUS_LABELS[r.status]}
                    </Badge>
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
