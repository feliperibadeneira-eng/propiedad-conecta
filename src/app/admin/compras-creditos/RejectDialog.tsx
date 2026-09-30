"use client";

import { useRef } from "react";
import { rejectCreditPurchaseAction } from "./actions";
import { Button } from "@/components/ui/Button";
import { inputBase } from "@/components/ui/Field";

export function RejectDialog({ requestId }: { requestId: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => dialogRef.current?.showModal()}
      >
        Rechazar
      </Button>
      <dialog
        ref={dialogRef}
        className="w-full max-w-sm rounded-2xl border border-border p-0 backdrop:bg-black/40"
      >
        <form action={rejectCreditPurchaseAction.bind(null, requestId)} className="p-5">
          <h3 className="font-semibold">Rechazar este pago</h3>
          <label className="mt-3 block text-sm">
            <span className="mb-1.5 block font-medium">Motivo (opcional)</span>
            <input name="reason" maxLength={200} className={inputBase} />
          </label>
          <div className="mt-4 flex gap-2">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => dialogRef.current?.close()}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="danger" className="flex-1">
              Confirmar rechazo
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
