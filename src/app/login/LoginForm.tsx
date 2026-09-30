"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction, type LoginState } from "./actions";
import { Field, inputBase } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <Field label="Email">
        <input name="email" type="email" required className={inputBase} />
      </Field>
      <Field label="Contraseña">
        <input name="password" type="password" required className={inputBase} />
      </Field>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Ingresando..." : "Ingresar"}
      </Button>
      <p className="text-center text-sm text-muted">
        ¿Buscas una propiedad y no tienes cuenta?{" "}
        <Link href="/registro" className="text-accent hover:underline">
          Regístrate
        </Link>
      </p>
      <p className="text-center text-sm text-muted">
        ¿Eres agente y no tienes cuenta?{" "}
        <Link href="/agente/registro" className="text-accent hover:underline">
          Regístrate
        </Link>
      </p>
    </form>
  );
}
