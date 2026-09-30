"use client";

import { useRef } from "react";
import { releaseLeadAction } from "./actions";
import { Button } from "@/components/ui/Button";
import { RELEASE_REASONS } from "@/lib/enums";

export function ReleaseLeadDialog({ leadPurchaseId }: { leadPurchaseId: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => dialogRef.current?.showModal()}
      >
        Liberar lead
      </Button>
      <dialog
        ref={dialogRef}
        className="w-full max-w-sm rounded-2xl border border-border p-0 backdrop:bg-black/40"
      >
        <form
          action={releaseLeadAction.bind(null, leadPurchaseId)}
          className="p-5"
        >
          <h3 className="font-semibold">No puedo atender esta solicitud</h3>
          <p className="mt-1 text-sm text-muted">
            Se libera el cupo para que otro agente pueda comprarlo. Esta
            acción queda registrada.
          </p>
          <select name="reason" className="mt-3 w-full rounded-xl border border-border px-3 py-2 text-sm">
            {RELEASE_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
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
              Confirmar
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
