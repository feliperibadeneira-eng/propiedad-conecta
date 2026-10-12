"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  sendConversationTextMessageAction,
  listConversationMessagesAction,
  type SendConversationMessageState,
} from "./actions";
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
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ConversationMessage[]>(initialMessages ?? []);
  const [state, formAction, pending] = useActionState(
    sendConversationTextMessageAction.bind(null, leadPurchaseId),
    initialState,
  );
  const wasPending = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [, startRefresh] = useTransition();

  useEffect(() => {
    if (wasPending.current && !pending && !state.error) {
      formRef.current?.reset();
      startRefresh(async () => {
        const page = await listConversationMessagesAction(leadPurchaseId);
        setMessages(page.messages);
      });
    }
    wasPending.current = pending;
  }, [pending, state, leadPurchaseId]);

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

  const ordered = [...messages].reverse();

  return (
    <div className="mt-4 border-t border-border pt-4">
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
          <div className="flex max-h-96 flex-col gap-3 overflow-y-auto">
            {ordered.length === 0 ? (
              <p className="text-sm text-muted-2">
                Todavía no hay mensajes. Envía el primero para iniciar la conversación.
              </p>
            ) : (
              ordered.map((m) => {
                const isOwn = m.senderUserId === currentUserId;
                return (
                  <div key={m.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[75%] rounded-xl px-3.5 py-2.5 text-sm ${
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
