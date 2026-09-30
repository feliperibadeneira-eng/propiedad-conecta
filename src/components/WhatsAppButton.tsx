"use client";

import { useRef, useState } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { buildWhatsAppLink } from "@/lib/whatsapp";

export function WhatsAppButton({
  phone,
  defaultMessage,
}: {
  phone: string;
  defaultMessage: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [message, setMessage] = useState(defaultMessage);

  return (
    <>
      <Button
        type="button"
        variant="accent2"
        size="sm"
        onClick={() => dialogRef.current?.showModal()}
      >
        <MessageCircle size={15} /> Contactar por WhatsApp
      </Button>
      <dialog
        ref={dialogRef}
        className="w-full max-w-sm rounded-2xl border border-border p-0 backdrop:bg-black/40"
      >
        <div className="p-5">
          <h3 className="font-semibold">Edita el mensaje antes de enviar</h3>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            className="mt-3 w-full rounded-xl border border-border bg-background-alt p-3 text-sm outline-none focus:border-accent"
          />
          <div className="mt-4 flex gap-2">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => dialogRef.current?.close()}
            >
              Cancelar
            </Button>
            <a
              href={buildWhatsAppLink(phone, message)}
              target="_blank"
              rel="noreferrer"
              className="flex-1"
              onClick={() => dialogRef.current?.close()}
            >
              <Button type="button" variant="accent2" className="w-full">
                Abrir WhatsApp
              </Button>
            </a>
          </div>
        </div>
      </dialog>
    </>
  );
}
