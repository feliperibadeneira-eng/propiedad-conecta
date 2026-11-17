"use client";

import { useActionState, useRef } from "react";
import { requestRefundAction, type RequestRefundState } from "./actions";
import { Button } from "@/components/ui/Button";
import { dialogClasses } from "@/components/ui/Modal";
import { inputBase } from "@/components/ui/Field";
import { REFUND_CATEGORY_LABELS } from "@/lib/enums";

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
      <dialog ref={dialogRef} className={dialogClasses("md")}>
        <form action={formAction} className="p-5">
          <h3 className="font-semibold">Solicitar devolución del crédito</h3>
          <p className="mt-1 text-sm text-muted">
            Un administrador revisa cada solicitud antes de acreditar el
            crédito.
          </p>

          <label className="mt-4 block text-sm">
            <span className="mb-1.5 block font-medium">Motivo</span>
            <select name="category" defaultValue="" required className={inputBase}>
              <option value="" disabled hidden>
                Seleccioná un motivo
              </option>
              {Object.entries(REFUND_CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="mt-3 block text-sm">
            <span className="mb-1.5 block font-medium">Contanos qué pasó</span>
            <textarea
              name="reason"
              required
              maxLength={1000}
              rows={3}
              className={inputBase}
            />
          </label>

          <label className="mt-3 block text-sm">
            <span className="mb-1.5 block font-medium">Evidencia (opcional)</span>
            <textarea name="evidence" maxLength={2000} rows={2} className={inputBase} />
          </label>

          {state.error && <p className="mt-3 text-sm text-danger">{state.error}</p>}
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
              {pending ? "Enviando..." : "Solicitar devolución"}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
