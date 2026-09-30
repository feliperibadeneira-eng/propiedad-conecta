"use client";

import { useActionState, useRef } from "react";
import { requestRefundAction, type RequestRefundState } from "./actions";
import { Button } from "@/components/ui/Button";

const initialState: RequestRefundState = {};

export function RequestRefundDialog({ leadPurchaseId }: { leadPurchaseId: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, formAction, pending] = useActionState(
    requestRefundAction.bind(null, leadPurchaseId),
    initialState,
  );

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => dialogRef.current?.showModal()}
      >
        Solicitar devolución
      </Button>
      <dialog
        ref={dialogRef}
        className="w-full max-w-sm rounded-2xl border border-border p-0 backdrop:bg-black/40"
      >
        <form action={formAction} className="p-5">
          <h3 className="font-semibold">
            ¿El usuario no respondió después de tus intentos de contacto?
          </h3>
          {state.error && (
            <p className="mt-3 text-sm text-danger">{state.error}</p>
          )}
          <div className="mt-4 flex gap-2">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => dialogRef.current?.close()}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending} className="flex-1">
              {pending ? "Enviando..." : "Sí, solicitar devolución"}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
