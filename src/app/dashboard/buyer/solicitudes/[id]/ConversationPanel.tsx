"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  sendConversationTextMessageAction,
  listConversationMessagesAction,
  pollConversationAction,
  type SendConversationMessageState,
} from "./actions";
import { useConversationPolling } from "@/hooks/useConversationPolling";
import { Button } from "@/components/ui/Button";
import { inputBase } from "@/components/ui/Field";
import { formatRelativeTime } from "@/lib/format";

type MessagesPage = Awaited<ReturnType<typeof listConversationMessagesAction>>;
type ConversationMessage = MessagesPage["messages"][number];

const initialState: SendConversationMessageState = {};

export function ConversationPanel({
  leadPurchaseId,
  currentUserId,
  initialMessages,
}: {
  leadPurchaseId: string;
  currentUserId: string;
  initialMessages: ConversationMessage[] | null;
}) {
  // Fase 1 (mayor visibilidad): abierto por defecto en vez de detrás de
  // "Ver conversación" — igual que ya era el chat del agente.
  const [open, setOpen] = useState(true);
  // initialMessages llega en orden descendente (más reciente primero, igual
  // que listMessagesPage); acá se guarda en orden ascendente desde el
  // principio para que el polling solo tenga que anexar al final.
  const [messages, setMessages] = useState<ConversationMessage[]>(
    initialMessages ? [...initialMessages].reverse() : [],
  );
  const [state, formAction, pending] = useActionState(
    sendConversationTextMessageAction.bind(null, leadPurchaseId),
    initialState,
  );
  const wasPending = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [, startRefresh] = useTransition();

  // Fase 1.1: un comprador puede tener hasta 5 conversaciones abiertas a la
  // vez en esta página (una por agente conectado, todas abiertas por
  // defecto) — sin esto, cada una pollea cada 4.5s aunque esté fuera de
  // pantalla. Empieza en true (igual que "abierto por defecto") para no
  // perder el primer tick mientras el observer todavía no reportó nada;
  // se corrige solo apenas corre el primer callback, montado o no.
  const [isVisible, setIsVisible] = useState(true);
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setIsVisible(entry.isIntersecting));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (wasPending.current && !pending && !state.error) {
      formRef.current?.reset();
      startRefresh(async () => {
        const page = await listConversationMessagesAction(leadPurchaseId);
        setMessages([...page.messages].reverse());
      });
    }
    wasPending.current = pending;
  }, [pending, state, leadPurchaseId]);

  // Polling (fase 1 de tiempo real): trae solo lo nuevo desde el último
  // mensaje que ya tenemos y lo anexa, sin reemplazar el historial. Marca
  // como leído en el mismo viaje al servidor (ver pollConversationAction).
  useConversationPolling({
    enabled: open && initialMessages !== null && isVisible,
    poll: async () => {
      const last = messages[messages.length - 1];
      const after = last ? { createdAt: last.createdAt, id: last.id } : null;
      const result = await pollConversationAction(leadPurchaseId, after);
      if (result.messages.length === 0) return;
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const fresh = result.messages.filter((m) => !existingIds.has(m.id));
        if (fresh.length === 0) return prev;
        return [...prev, ...fresh];
      });
    },
  });

  // Auto-scroll al último mensaje — así los mensajes nuevos son fáciles de
  // ubicar sin tener que buscarlos manualmente.
  useEffect(() => {
    if (open) listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length, open]);

  if (initialMessages === null) {
    return (
      <div className="mt-4 border-t border-border pt-4">
        <p className="text-sm font-medium">Chat</p>
        <p className="mt-1 text-sm text-muted-2">
          Todavía no hay una conversación disponible con este agente.
        </p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="mt-4 border-t border-border pt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left text-sm font-medium"
      >
        Chat
        <span className="text-xs font-normal text-muted-2">
          {open ? "Ocultar" : "Ver conversación"}
        </span>
      </button>

      {open && (
        <div className="mt-3">
          <div ref={listRef} className="flex max-h-96 flex-col gap-3 overflow-y-auto">
            {messages.length === 0 ? (
              <p className="text-sm text-muted-2">
                Todavía no hay mensajes. Envía el primero para iniciar la conversación.
              </p>
            ) : (
              messages.map((m) => {
                const isOwn = m.senderUserId === currentUserId;
                return (
                  <div key={m.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[75%] px-3.5 py-2.5 text-sm ${
                        isOwn
                          ? "bg-accent text-accent-foreground"
                          : "bg-surface-hover text-foreground"
                      }`}
                    >
                      {!isOwn && (
                        <p className="text-xs font-medium opacity-70">{m.sender.name}</p>
                      )}
                      <p className="whitespace-pre-wrap break-words">
                        {m.type === "TEXT" ? m.body : "Compartió una propiedad."}
                      </p>
                      <p
                        className={`mt-1 text-[11px] ${
                          isOwn ? "text-accent-foreground/70" : "text-muted-2"
                        }`}
                      >
                        {formatRelativeTime(m.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <form
            ref={formRef}
            action={formAction}
            className="mt-3 flex items-start gap-2"
          >
            <input
              name="body"
              placeholder="Escribe un mensaje..."
              required
              maxLength={2000}
              disabled={pending}
              className={inputBase}
            />
            <Button type="submit" disabled={pending}>
              {pending ? "Enviando..." : "Enviar"}
            </Button>
          </form>
          {state.error && <p className="mt-2 text-sm text-danger">{state.error}</p>}
        </div>
      )}
    </div>
  );
}
