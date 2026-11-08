"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  sendConversationTextMessageAction,
  listConversationMessagesAction,
  pollConversationAction,
  type SendConversationMessageState,
} from "../actions";
import { useConversationPolling } from "@/hooks/useConversationPolling";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { inputBase } from "@/components/ui/Field";
import { formatRelativeTime } from "@/lib/format";

type MessagesPage = Awaited<ReturnType<typeof listConversationMessagesAction>>;
type ConversationMessage = MessagesPage["messages"][number];

const initialState: SendConversationMessageState = {};

export function ChatPanel({
  leadPurchaseId,
  currentUserId,
  initialMessages,
}: {
  leadPurchaseId: string;
  currentUserId: string;
  initialMessages: ConversationMessage[] | null;
}) {
  // initialMessages llega en orden descendente (igual que listMessagesPage);
  // se guarda ascendente desde el principio para que el polling solo anexe.
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
  const [, startRefresh] = useTransition();

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

  // Polling (fase 1 de tiempo real): este panel siempre está expandido
  // (ver auditoría), así que el polling corre mientras la página esté
  // montada y la pestaña visible. Marca como leído en el mismo viaje.
  useConversationPolling({
    enabled: initialMessages !== null,
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

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  if (initialMessages === null) {
    return (
      <Card className="mt-6 p-6">
        <h2 className="font-semibold">Chat</h2>
        <p className="mt-2 text-sm text-muted-2">
          Todavía no hay una conversación disponible para este lead.
        </p>
      </Card>
    );
  }

  return (
    <Card className="mt-6 p-6">
      <h2 className="font-semibold">Chat</h2>

      <div ref={listRef} className="mt-4 flex max-h-96 flex-col gap-3 overflow-y-auto">
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
        className="mt-4 flex items-start gap-2"
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
    </Card>
  );
}
