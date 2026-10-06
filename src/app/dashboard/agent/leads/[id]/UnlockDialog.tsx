"use client";

import { useActionState, useRef } from "react";
import { unlockLeadAction, type UnlockState } from "./actions";
import { Button } from "@/components/ui/Button";

const initialState: UnlockState = {};

export function UnlockDialog({
  requestId,
  propertyId,
  creditsBalance,
  unlockCost,
}: {
  requestId: string;
  propertyId?: string;
  creditsBalance: number;
  unlockCost: number;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, formAction, pending] = useActionState(
    unlockLeadAction.bind(null, requestId, propertyId),
    initialState,
  );
  const plural = unlockCost !== 1 ? "s" : "";

  return (
    <>
      <Button size="lg" className="w-full" onClick={() => dialogRef.current?.showModal()}>
        Desbloquear contacto — {unlockCost} crédito{plural}
      </Button>

      <dialog
        ref={dialogRef}
        className="w-full max-w-sm rounded-2xl border border-border p-0 backdrop:bg-black/40"
      >
        <form action={formAction} className="p-6">
          <h2 className="text-lg font-bold">Desbloquear esta solicitud</h2>
          <p className="mt-2 text-sm text-muted">
            Vas a usar {unlockCost} crédito{plural} de tu cuenta. Recibirás
            los datos de contacto del interesado, y el interesado recibirá
            tus datos de contacto.
          </p>
          <div className="mt-4 flex items-center justify-between rounded-xl bg-surface-hover px-4 py-3">
            <span className="text-sm text-muted">Créditos disponibles</span>
            <span className="text-lg font-bold">{creditsBalance}</span>
          </div>
          {state.error && (
            <p className="mt-3 text-sm text-danger">{state.error}</p>
          )}
          <div className="mt-5 flex gap-2">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => dialogRef.current?.close()}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending} className="flex-1">
              {pending ? "Desbloqueando..." : `Usar ${unlockCost} crédito${plural} y desbloquear`}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
