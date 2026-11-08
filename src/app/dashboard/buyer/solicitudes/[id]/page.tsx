import { notFound } from "next/navigation";
import { requireBuyer } from "@/lib/auth";
import { getBuyerRequestDetail } from "@/lib/services/requests";
import {
  listMessagesForBuyer,
  getUnreadCountsByLeadPurchaseForBuyer,
  ConversationError,
} from "@/lib/services/conversation";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { inputBase } from "@/components/ui/Field";
import { formatUSD, formatDate } from "@/lib/format";
import {
  PROPERTY_TYPE_LABELS,
  OPERATION_TYPE_LABELS,
  REQUEST_STATUS_LABELS,
} from "@/lib/enums";
import {
  updateMaxAgentsAction,
  pauseRequestAction,
  resumeRequestAction,
  closeRequestAction,
} from "./actions";
import { OCCUPYING_STATUSES } from "@/lib/services/constants";
import { AgentConnectionsList, type AgentConnectionViewModel } from "./AgentConnectionsList";
import type { LeadPurchaseStatus } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

// Rediseño "Mis solicitudes" — tono semántico por estado de la conexión con
// el agente, en vez del neutral plano de antes. Mismos 10 valores de
// LeadPurchaseStatus que ya existían, ningún estado nuevo.
const LEAD_PURCHASE_STATUS_TONE: Record<
  LeadPurchaseStatus,
  "accent" | "success" | "warning" | "neutral"
> = {
  PURCHASED: "accent",
  CONTACTED: "accent",
  RESPONDED: "success",
  APPOINTMENT_SCHEDULED: "success",
  REACTIVATED: "accent",
  NO_CONTACT: "warning",
  REFUND_REQUESTED: "warning",
  NO_MATCH: "neutral",
  RELEASED: "neutral",
  REFUNDED: "neutral",
  CLOSED: "neutral",
};

export default async function BuyerRequestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { id } = await params;
  const { created } = await searchParams;
  const user = await requireBuyer();
  const request = await getBuyerRequestDetail(user.buyerProfileId!, id);
  if (!request) notFound();

  const activePurchases = request.purchases.filter((p) =>
    OCCUPYING_STATUSES.includes(p.status),
  );

  // Un fetch independiente por LeadPurchase (N es como mucho maxAgents, 1/3/5)
  // — cada conversación se carga y se aísla por separado, nunca se mezclan.
  // LeadPurchase creados por purchaseWithCredits() siempre traen su
  // Conversation (PR #16, misma transacción); esto solo protege datos
  // legacy sin Conversation.
  const messagesByPurchase = new Map<
    string,
    Awaited<ReturnType<typeof listMessagesForBuyer>>["messages"] | null
  >();
  const [, unreadByLeadPurchase] = await Promise.all([
    Promise.all(
      request.purchases.map(async (p) => {
        try {
          const page = await listMessagesForBuyer(user.buyerProfileId!, p.id);
          messagesByPurchase.set(p.id, page.messages);
        } catch (e) {
          if (!(e instanceof ConversationError)) throw e;
          messagesByPurchase.set(p.id, null);
        }
      }),
    ),
    getUnreadCountsByLeadPurchaseForBuyer(user.buyerProfileId!, user.id),
  ]);

  // Fase 1.1: ya calculamos unreadByLeadPurchase arriba para los badges por
  // agente conectado — su suma es el mismo total que el header pediría por
  // su cuenta, así que se lo pasamos para que no repita esa consulta al
  // montar.
  const totalUnread = Array.from(unreadByLeadPurchase.values()).reduce((a, b) => a + b, 0);

  // Vista-modelo plana para AgentConnectionsList (componente cliente): los
  // Decimal de Prisma (price) no cruzan el límite server->client tal cual,
  // se convierten a string acá. purchases ya viene ordenado por
  // purchasedAt desc (getBuyerRequestDetail), así que el primero es el más
  // reciente.
  const connections: AgentConnectionViewModel[] = request.purchases.map((p) => {
    const messages = messagesByPurchase.get(p.id) ?? null;
    const unreadCount = unreadByLeadPurchase.get(p.id) ?? 0;
    const lastActivityAt = messages && messages.length > 0 ? messages[0].createdAt : p.purchasedAt;
    return {
      id: p.id,
      status: p.status,
      statusTone: LEAD_PURCHASE_STATUS_TONE[p.status],
      agentName: p.agent.user.name,
      agentCompany: p.agent.company,
      agentWhatsapp: p.agent.whatsapp,
      agentPhone: p.agent.user.phone,
      agentEmail: p.agent.user.email,
      unreadCount,
      lastActivityAt,
      initialMessages: messages,
      propertyShares: p.propertyShares.map((share) => ({
        id: share.id,
        property: share.property
          ? {
              id: share.property.id,
              title: share.property.title,
              price: share.property.price.toString(),
              status: share.property.status,
              provincia: share.property.provincia,
              ciudad: share.property.ciudad,
              sector: share.property.sector,
              imageId: share.property.images[0]?.id ?? null,
            }
          : null,
      })),
    };
  });

  // Apertura automática (fase de rediseño): la conexión con más no leídos;
  // si ninguna tiene pendientes, la más reciente (primera del arreglo, ya
  // ordenado desc por purchasedAt).
  const defaultOpenId =
    connections.length === 0
      ? null
      : connections.reduce((best, c) => (c.unreadCount > best.unreadCount ? c : best), connections[0]).id;

  return (
    <>
      <DashboardHeader
        userName={user.name}
        links={[{ href: "/dashboard/buyer", label: "Mis solicitudes" }]}
        initialUnreadCount={totalUnread}
      />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        {created === "1" && (
          <Card className="mb-6 border-success/30 bg-success-bg p-4 text-sm text-success">
            <p className="font-semibold">¡Solicitud publicada!</p>
            <p className="mt-1 text-success/90">
              Los agentes podrán encontrar tu solicitud si tienen una
              propiedad que coincida con lo que buscas.
            </p>
          </Card>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">
            {PROPERTY_TYPE_LABELS[request.propertyType]} en {request.ciudad}
          </h1>
          <Badge tone="accent">{REQUEST_STATUS_LABELS[request.status]}</Badge>
        </div>

        <Card className="mt-5 grid gap-4 p-6 sm:grid-cols-2">
          <Info label="Operación" value={OPERATION_TYPE_LABELS[request.operationType]} />
          <Info
            label="Ubicación"
            value={[request.provincia, request.ciudad, request.sector].filter(Boolean).join(" · ")}
          />
          <Info label="Presupuesto" value={`${formatUSD(request.priceMin)} – ${formatUSD(request.priceMax)}`} />
          <Info label="Publicada" value={formatDate(request.createdAt)} />
          {request.bedrooms != null && <Info label="Habitaciones" value={String(request.bedrooms)} />}
          {request.minSquareMeters != null && (
            <Info label="Metros cuadrados mínimos" value={`${request.minSquareMeters} m²`} />
          )}
        </Card>

        <h2 className="mt-8 font-semibold">
          Agentes conectados ({activePurchases.length}/{request.maxAgents})
        </h2>
        {request.purchases.length === 0 ? (
          <Card className="mt-3 p-6 text-sm text-muted">
            Todavía ningún agente desbloqueó tu solicitud.
          </Card>
        ) : (
          <AgentConnectionsList
            requestId={request.id}
            currentUserId={user.id}
            connections={connections}
            defaultOpenId={defaultOpenId}
          />
        )}

        <details className="mt-8 border border-border bg-surface shadow-sm">
          <summary className="cursor-pointer select-none p-6 font-semibold">
            Ajustes de la solicitud
          </summary>
          <div className="space-y-4 border-t border-border p-6">
            <form action={updateMaxAgentsAction.bind(null, request.id)} className="flex items-center gap-3">
              <span className="text-sm text-muted">Máximo de agentes:</span>
              <select name="maxAgents" defaultValue={request.maxAgents} className={`${inputBase} w-auto`}>
                {[1, 3, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <button type="submit" className={buttonClasses("secondary", "sm")}>
                Guardar
              </button>
            </form>
            <div className="flex flex-wrap gap-2">
              {request.status === "PAUSADA" ? (
                <form action={resumeRequestAction.bind(null, request.id)}>
                  <button type="submit" className={buttonClasses("secondary", "sm")}>
                    Reanudar búsqueda
                  </button>
                </form>
              ) : (
                request.status !== "CERRADA" && (
                  <form action={pauseRequestAction.bind(null, request.id)}>
                    <button type="submit" className={buttonClasses("secondary", "sm")}>
                      Pausar
                    </button>
                  </form>
                )
              )}
              {request.status !== "CERRADA" && (
                <form action={closeRequestAction.bind(null, request.id)}>
                  <button type="submit" className={buttonClasses("danger", "sm")}>
                    Ya encontré una propiedad / cerrar
                  </button>
                </form>
              )}
            </div>
          </div>
        </details>
      </main>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-2">{label}</p>
      <p className="mt-0.5 text-sm font-medium">{value}</p>
    </div>
  );
}
