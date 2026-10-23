"use client";

import { useRef } from "react";
import { releaseLeadAction } from "./actions";
import { Button } from "@/components/ui/Button";
import { dialogClasses } from "@/components/ui/Modal";
import { inputBase } from "@/components/ui/Field";
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
        className={dialogClasses()}
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
          <select name="reason" className={`mt-3 ${inputBase}`}>
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
