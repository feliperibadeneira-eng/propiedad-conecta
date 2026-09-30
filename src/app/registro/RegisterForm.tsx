"use client";

import { useActionState } from "react";
import { registerBuyerAction, type BuyerRegisterState } from "./actions";
import { Field, inputBase } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

const initialState: BuyerRegisterState = {};

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(
    registerBuyerAction,
    initialState,
  );

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre">
          <input name="firstName" required className={inputBase} />
        </Field>
        <Field label="Apellido">
          <input name="lastName" required className={inputBase} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email">
          <input name="email" type="email" required className={inputBase} />
        </Field>
        <Field label="Contraseña" hint="Mínimo 8 caracteres">
          <input name="password" type="password" required minLength={8} className={inputBase} />
        </Field>
      </div>
      <Field label="Teléfono / WhatsApp">
        <input name="phone" required className={inputBase} placeholder="0991234567" />
      </Field>

      <label className="flex items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          name="contactConsent"
          required
          className="mt-0.5 h-4 w-4 rounded border-border accent-[var(--accent)]"
        />
        <span>
          Autorizo a los agentes inmobiliarios a contactarme respecto a las
          propiedades que solicite.
        </span>
      </label>

      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creando cuenta..." : "Crear cuenta"}
      </Button>
    </form>
  );
}
