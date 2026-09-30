"use client";

import { useActionState } from "react";
import { updateProfileAction, type ProfileState } from "./actions";
import { Field, inputBase } from "@/components/ui/Field";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PROPERTY_TYPE_LABELS } from "@/lib/enums";
import type { PropertyType } from "@/generated/prisma/enums";

const initialState: ProfileState = {};

export function ProfileForm({
  defaults,
}: {
  defaults: {
    name: string;
    phone: string;
    whatsapp: string;
    company: string;
    city: string;
    yearsExperience: number | null;
    workAreas: string[];
    propertyTypes: PropertyType[];
    description: string;
  };
}) {
  const [state, formAction, pending] = useActionState(
    updateProfileAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-5">
      <Card className="grid gap-4 p-6 sm:grid-cols-2">
        <Field label="Nombre">
          <input name="name" defaultValue={defaults.name} required className={inputBase} />
        </Field>
        <Field label="Teléfono">
          <input name="phone" defaultValue={defaults.phone} required className={inputBase} />
        </Field>
        <Field label="WhatsApp" hint="Si es distinto al teléfono">
          <input name="whatsapp" defaultValue={defaults.whatsapp} className={inputBase} />
        </Field>
        <Field label="Empresa / agencia">
          <input name="company" defaultValue={defaults.company} className={inputBase} />
        </Field>
        <Field label="Ciudad">
          <input name="city" defaultValue={defaults.city} className={inputBase} />
        </Field>
        <Field label="Años de experiencia">
          <input name="yearsExperience" type="number" min={0} defaultValue={defaults.yearsExperience ?? ""} className={inputBase} />
        </Field>
      </Card>

      <Card className="space-y-4 p-6">
        <Field label="Zonas donde trabajas" hint="Separadas por coma, ej: Cumbayá, Tumbaco, Quito">
          <input name="workAreas" defaultValue={defaults.workAreas.join(", ")} className={inputBase} />
        </Field>
        <div>
          <span className="mb-1.5 block text-sm font-medium">Tipos de propiedad que manejas</span>
          <div className="flex flex-wrap gap-3">
            {Object.entries(PROPERTY_TYPE_LABELS).map(([v, l]) => (
              <label key={v} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="propertyTypes"
                  value={v}
                  defaultChecked={defaults.propertyTypes.includes(v as PropertyType)}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                {l}
              </label>
            ))}
          </div>
        </div>
        <Field label="Descripción">
          <textarea
            name="description"
            defaultValue={defaults.description}
            rows={4}
            className={inputBase}
          />
        </Field>
      </Card>

      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      {state.success && <p className="text-sm text-success">Perfil actualizado.</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Guardando..." : "Guardar cambios"}
      </Button>
    </form>
  );
}
