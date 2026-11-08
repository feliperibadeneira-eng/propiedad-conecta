"use client";

import { useState } from "react";
import { ChevronDown, ImageOff, MessageCircle } from "lucide-react";
import { markOutcomeAction } from "./actions";
import { ConversationPanel } from "./ConversationPanel";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { inputBase } from "@/components/ui/Field";
import { formatUSD, formatRelativeTime } from "@/lib/format";
import { propertyPhotoUrl } from "@/lib/propertyPhotos";
import { PROPERTY_STATUS_LABELS, LEAD_PURCHASE_STATUS_LABELS, BUYER_OUTCOME_OPTIONS } from "@/lib/enums";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { BRAND_NAME } from "@/lib/brand";
import { OCCUPYING_STATUSES } from "@/lib/services/constants";
import type { LeadPurchaseStatus, PropertyStatus } from "@/generated/prisma/enums";
import type { listConversationMessagesAction } from "./actions";

type MessagesPage = Awaited<ReturnType<typeof listConversationMessagesAction>>;
type ConversationMessage = MessagesPage["messages"][number];

export type AgentConnectionViewModel = {
  id: string;
  status: LeadPurchaseStatus;
  statusTone: "accent" | "success" | "warning" | "neutral";
  agentName: string;
  agentCompany: string | null;
  agentWhatsapp: string | null;
  agentPhone: string | null;
  agentEmail: string | null;
  unreadCount: number;
  lastActivityAt: Date;
  initialMessages: ConversationMessage[] | null;
  propertyShares: {
    id: string;
    property: {
      id: string;
      title: string;
      price: string;
      status: PropertyStatus;
      provincia: string;
      ciudad: string;
      sector: string | null;
      imageId: string | null;
    } | null;
  }[];
};

// Fase de rediseño "Mis solicitudes" — antes, cada agente conectado era una
// tarjeta siempre expandida con su chat completo adentro; con hasta 5
// agentes (maxAgents) eso significaba hasta 5 paneles de chat montados y
// pollenado a la vez. Acá cada agente es una fila compacta que se expande
// al tocarla, con como mucho UNA abierta a la vez — mismo contenido de
// siempre (botones de contacto, propiedades compartidas, ConversationPanel,
// formulario de resultado), solo que no todo desplegado al mismo tiempo.
// El polling/lectura/envío de mensajes no cambia en nada: sigue siendo
// exactamente el mismo ConversationPanel de la fase 1/1.1.
export function AgentConnectionsList({
  requestId,
  currentUserId,
  connections,
  defaultOpenId,
}: {
  requestId: string;
  currentUserId: string;
  connections: AgentConnectionViewModel[];
  defaultOpenId: string | null;
}) {
  const [openId, setOpenId] = useState<string | null>(defaultOpenId);

  return (
    <div className="mt-3 space-y-3">
      {connections.map((c) => {
        const isOpen = c.id === openId;
        return (
          <Card key={c.id} className="overflow-hidden p-0">
            <button
              type="button"
              onClick={() => setOpenId(isOpen ? null : c.id)}
              className="flex w-full flex-wrap items-center justify-between gap-3 p-5 text-left"
              aria-expanded={isOpen}
            >
              <div className="min-w-0">
                <p className="font-semibold">{c.agentName}</p>
                {c.agentCompany && (
                  <p className="text-sm text-muted">{c.agentCompany}</p>
                )}
                <p className="mt-0.5 text-xs text-muted-2">
                  {c.unreadCount > 0 ? "Último mensaje " : "Última actividad "}
                  {formatRelativeTime(c.lastActivityAt)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {!!c.unreadCount && (
                  <span
                    className="flex items-center gap-1 bg-accent/10 px-1.5 py-0.5 text-xs text-accent"
                    aria-label={`${c.unreadCount} mensajes sin leer`}
                  >
                    <MessageCircle size={12} /> {c.unreadCount}
                  </span>
                )}
                <Badge tone={c.statusTone}>{LEAD_PURCHASE_STATUS_LABELS[c.status]}</Badge>
                <ChevronDown
                  size={18}
                  className={`shrink-0 text-muted-2 transition-transform ${isOpen ? "rotate-180" : ""}`}
                />
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-border p-5">
                <div className="flex flex-wrap gap-2 text-sm">
                  <a
                    href={buildWhatsAppLink(
                      c.agentWhatsapp || c.agentPhone || "",
                      `Hola ${c.agentName}, te contacto por ${BRAND_NAME}.`,
                    )}
                    target="_blank"
                    className={buttonClasses("accent2", "sm")}
                  >
                    WhatsApp
                  </a>
                  <a href={`tel:${c.agentPhone}`} className={buttonClasses("secondary", "sm")}>
                    Llamar
                  </a>
                  {c.agentEmail && (
                    <a href={`mailto:${c.agentEmail}`} className={buttonClasses("secondary", "sm")}>
                      Email
                    </a>
                  )}
                </div>

                {c.propertyShares.length > 0 && (
                  <div className="mt-4 border-t border-border pt-4">
                    <p className="text-sm font-medium">Propiedades que te compartió</p>
                    <div className="mt-2 grid gap-3 sm:grid-cols-2">
                      {c.propertyShares.map((share) => (
                        <div key={share.id} className="flex gap-3 border border-border p-3">
                          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden bg-surface-hover">
                            {share.property?.imageId ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={propertyPhotoUrl(share.property.imageId)}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <ImageOff className="text-muted-2" size={18} />
                            )}
                          </div>
                          <div className="min-w-0">
                            {share.property ? (
                              <>
                                <div className="flex items-center gap-2">
                                  <p className="truncate text-sm font-medium">
                                    {share.property.title}
                                  </p>
                                  {share.property.status !== "DISPONIBLE" && (
                                    <Badge tone="neutral">
                                      {PROPERTY_STATUS_LABELS[share.property.status]}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted">
                                  {formatUSD(share.property.price)}
                                </p>
                                <p className="truncate text-xs text-muted-2">
                                  {[share.property.provincia, share.property.ciudad, share.property.sector]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </p>
                              </>
                            ) : (
                              <p className="text-sm text-muted-2">
                                Esta propiedad ya no está disponible.
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <ConversationPanel
                  leadPurchaseId={c.id}
                  currentUserId={currentUserId}
                  initialMessages={c.initialMessages}
                />

                {OCCUPYING_STATUSES.includes(c.status) && (
                  <form
                    action={markOutcomeAction.bind(null, requestId)}
                    className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4"
                  >
                    <input type="hidden" name="leadPurchaseId" value={c.id} />
                    <span className="text-sm text-muted">¿Qué ocurrió?</span>
                    <select name="outcome" className={`${inputBase} w-auto`}>
                      {BUYER_OUTCOME_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className={buttonClasses("secondary", "sm")}>
                      Confirmar
                    </button>
                  </form>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
