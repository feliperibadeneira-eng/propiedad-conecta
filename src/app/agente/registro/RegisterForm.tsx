"use client";

import { useActionState } from "react";
import { registerAgentAction, type RegisterState } from "./actions";
import { Field, inputBase } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

const initialState: RegisterState = {};

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(
    registerAgentAction,
    initialState,
  );

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <Field label="Nombre completo">
        <input name="name" required className={inputBase} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email">
          <input name="email" type="email" required className={inputBase} />
        </Field>
        <Field label="Contraseña" hint="Mínimo 8 caracteres">
          <input name="password" type="password" required minLength={8} className={inputBase} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Teléfono / WhatsApp">
          <input name="phone" required className={inputBase} />
        </Field>
        <Field label="Ciudad" hint="Opcional">
          <input name="city" className={inputBase} />
        </Field>
      </div>
      <Field label="Empresa / agencia" hint="Opcional">
        <input name="company" className={inputBase} />
      </Field>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creando cuenta..." : "Crear cuenta de agente"}
      </Button>
    </form>
  );
}
