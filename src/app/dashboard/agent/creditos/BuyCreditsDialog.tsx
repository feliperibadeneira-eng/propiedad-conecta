"use client";

import { useActionState, useRef } from "react";
import { submitCreditPurchaseAction, type SubmitPurchaseState } from "./actions";
import { Button, buttonClasses } from "@/components/ui/Button";
import { formatUSD } from "@/lib/format";
import type { CreditPackageType } from "@/generated/prisma/enums";

const initialState: SubmitPurchaseState = {};

export function BuyCreditsDialog({
  packageKey,
  name,
  price,
  credits,
  paymentInstructions,
  payphoneLink,
}: {
  packageKey: CreditPackageType;
  name: string;
  price: number;
  credits: number;
  paymentInstructions: string;
  payphoneLink: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, formAction, pending] = useActionState(
    submitCreditPurchaseAction.bind(null, packageKey),
    initialState,
  );

  return (
    <>
      <Button className="w-full" onClick={() => dialogRef.current?.showModal()}>
        Comprar {name}
      </Button>

      <dialog
        ref={dialogRef}
        className="w-full max-w-md rounded-2xl border border-border p-0 backdrop:bg-black/40"
      >
        {state.success ? (
          <div className="p-6 text-center">
            <h2 className="text-lg font-bold">Pago enviado a revisión</h2>
            <p className="mt-2 text-sm text-muted">
              {`Un administrador va a revisar tu pago. Cuando lo apruebe, los ${credits} créditos del paquete ${name} se acreditan automáticamente a tu cuenta. Puedes seguir el estado en "Mis compras", más abajo en esta página.`}
            </p>
            <Button
              type="button"
              className="mt-5 w-full"
              onClick={() => {
                dialogRef.current?.close();
                window.location.reload();
              }}
            >
              Entendido
            </Button>
          </div>
        ) : (
          <form action={formAction} className="p-6" encType="multipart/form-data">
            <h2 className="text-lg font-bold">Completa tu pago</h2>
            <div className="mt-3 flex items-center justify-between rounded-xl bg-surface-hover px-4 py-3">
              <span className="text-sm text-muted">
                Paquete {name} · {credits} créditos
              </span>
              <span className="text-lg font-bold">{formatUSD(price)}</span>
            </div>

            {payphoneLink && (
              <a
                href={payphoneLink}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClasses("accent2", "md", "mt-4 w-full")}
              >
                Pagar con PayPhone
              </a>
            )}

            <div className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted">
              {paymentInstructions ? (
                <p className="whitespace-pre-line">{paymentInstructions}</p>
              ) : (
                <p>
                  El administrador todavía no configuró las instrucciones de
                  pago. Contáctalo directamente para coordinar tu compra de
                  créditos.
                </p>
              )}
            </div>

            <div className="mt-4">
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Comprobante de pago
              </label>
              <input
                name="receipt"
                type="file"
                accept="image/*"
                required
                className="block w-full text-sm text-muted file:mr-3 file:rounded-xl file:border-0 file:bg-surface-hover file:px-3.5 file:py-2 file:text-sm file:font-medium file:text-foreground"
              />
              <p className="mt-1 text-xs text-muted-2">
                Sube una captura o foto del comprobante de pago (PayPhone o
                Deuna). Es obligatorio para enviar la solicitud.
              </p>
            </div>

            <p className="mt-4 text-sm font-medium">¿Ya realizaste el pago?</p>
            {state.error && (
              <p className="mt-2 text-sm text-danger">{state.error}</p>
            )}
            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={() => dialogRef.current?.close()}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={pending} className="flex-1">
                {pending ? "Enviando..." : "Enviar pago para revisión"}
              </Button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
