"use client";

import { useActionState } from "react";
import {
  createPropertyAction,
  updatePropertyAction,
  type PropertyFormState,
} from "./actions";
import { Field, inputBase } from "@/components/ui/Field";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PROVINCIAS_ECUADOR } from "@/lib/ecuador";
import { PROPERTY_TYPE_LABELS } from "@/lib/enums";
import type { OperationType, PropertyType } from "@/generated/prisma/enums";

const initialState: PropertyFormState = {};

export type PropertyFormDefaults = {
  operationType: OperationType;
  propertyType: PropertyType;
  title: string;
  description: string;
  price: number;
  provincia: string;
  ciudad: string;
  sector: string;
  squareMeters: number;
  bedrooms: number | null;
  bathrooms: number | null;
};

export function PropertyForm({
  mode,
  propertyId,
  defaults,
}: {
  mode: "create" | "edit";
  propertyId?: string;
  defaults?: PropertyFormDefaults;
}) {
  const action =
    mode === "edit" ? updatePropertyAction.bind(null, propertyId!) : createPropertyAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const err = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-6">
      <Card className="space-y-5 p-6">
        <h2 className="font-semibold">¿Qué ofreces?</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Operación" error={err.operationType}>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="operationType"
                  value="COMPRAR"
                  required
                  defaultChecked={defaults?.operationType === "COMPRAR"}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                En venta
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="operationType"
                  value="ALQUILAR"
                  required
                  defaultChecked={defaults?.operationType === "ALQUILAR"}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                En alquiler
              </label>
            </div>
          </Field>
          <Field label="Tipo de propiedad" error={err.propertyType}>
            <select
              name="propertyType"
              className={inputBase}
              defaultValue={defaults?.propertyType ?? "DEPARTAMENTO"}
            >
              {Object.entries(PROPERTY_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Card>

      <Card className="space-y-5 p-6">
        <h2 className="font-semibold">Detalles de la publicación</h2>
        <Field label="Título" error={err.title}>
          <input
            name="title"
            defaultValue={defaults?.title}
            placeholder="Departamento moderno en Cumbayá"
            className={inputBase}
            required
          />
        </Field>
        <Field label="Descripción" error={err.description} hint="Opcional">
          <textarea
            name="description"
            defaultValue={defaults?.description}
            rows={4}
            placeholder="Cuéntale al comprador sobre la propiedad: acabados, estado, lo que la hace especial..."
            className={inputBase}
          />
        </Field>
        <Field label="Precio (USD)" error={err.price}>
          <input
            name="price"
            type="number"
            min={1}
            defaultValue={defaults?.price}
            placeholder="95000"
            className={inputBase}
            required
          />
        </Field>
      </Card>

      <Card className="space-y-5 p-6">
        <h2 className="font-semibold">Ubicación</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Provincia" error={err.provincia}>
            <select
              name="provincia"
              className={inputBase}
              defaultValue={defaults?.provincia ?? "Pichincha"}
            >
              {PROVINCIAS_ECUADOR.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Ciudad" error={err.ciudad}>
            <input
              name="ciudad"
              defaultValue={defaults?.ciudad}
              placeholder="Quito"
              className={inputBase}
              required
            />
          </Field>
          <Field label="Sector / zona" error={err.sector} hint="Opcional">
            <input
              name="sector"
              defaultValue={defaults?.sector}
              placeholder="Cumbayá"
              className={inputBase}
            />
          </Field>
        </div>
      </Card>

      <Card className="space-y-5 p-6">
        <h2 className="font-semibold">Características</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Metros cuadrados" error={err.squareMeters}>
            <input
              name="squareMeters"
              type="number"
              min={1}
              defaultValue={defaults?.squareMeters}
              className={inputBase}
              required
            />
          </Field>
          <Field label="Habitaciones" error={err.bedrooms} hint="Opcional">
            <input
              name="bedrooms"
              type="number"
              min={0}
              max={20}
              defaultValue={defaults?.bedrooms ?? undefined}
              className={inputBase}
            />
          </Field>
          <Field label="Baños" error={err.bathrooms} hint="Opcional">
            <input
              name="bathrooms"
              type="number"
              min={0}
              max={20}
              defaultValue={defaults?.bathrooms ?? undefined}
              className={inputBase}
            />
          </Field>
        </div>
      </Card>

      {state.error && (
        <p className="rounded-xl bg-danger-bg px-4 py-3 text-sm text-danger">{state.error}</p>
      )}

      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending
          ? "Guardando..."
          : mode === "create"
            ? "Publicar propiedad"
            : "Guardar cambios"}
      </Button>
    </form>
  );
}
