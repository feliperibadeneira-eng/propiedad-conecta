"use client";

import { useActionState, useState } from "react";
import { createRequestAction, type CreateRequestState } from "./actions";
import { visibleFieldsFor, type FieldKey } from "./propertyTypeFields";
import { Field, inputBase } from "@/components/ui/Field";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PROVINCIAS_ECUADOR } from "@/lib/ecuador";
import {
  OPERATION_TYPE_LABELS,
  PROPERTY_TYPE_LABELS,
  CONTACT_PREFERENCE_LABELS,
} from "@/lib/enums";
import type { PropertyType } from "@/generated/prisma/enums";

const initialState: CreateRequestState = {};

const checkboxFeatures: { key: FieldKey; label: string }[] = [
  { key: "furnished", label: "Amoblado" },
  { key: "hasElevator", label: "Ascensor" },
  { key: "hasTerrace", label: "Terraza" },
  { key: "hasPatio", label: "Patio" },
  { key: "hasPool", label: "Piscina" },
  { key: "hasSecurity", label: "Seguridad" },
];

export function RequestForm() {
  const [state, formAction, pending] = useActionState(
    createRequestAction,
    initialState,
  );
  const [propertyType, setPropertyType] = useState<PropertyType>("DEPARTAMENTO");
  const visible = visibleFieldsFor(propertyType);
  const err = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-6">
      <Card className="space-y-5 p-6">
        <h2 className="font-semibold">¿Qué estás buscando?</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tipo de operación" error={err.operationType}>
            <select name="operationType" className={inputBase} defaultValue="COMPRAR">
              {Object.entries(OPERATION_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tipo de propiedad" error={err.propertyType}>
            <select
              name="propertyType"
              className={inputBase}
              value={propertyType}
              onChange={(e) => setPropertyType(e.target.value as PropertyType)}
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
        <h2 className="font-semibold">Ubicación</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Provincia" error={err.provincia}>
            <select name="provincia" className={inputBase} defaultValue="Pichincha">
              {PROVINCIAS_ECUADOR.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Ciudad" error={err.ciudad}>
            <input name="ciudad" className={inputBase} placeholder="Quito" required />
          </Field>
          <Field label="Sector / zona" error={err.sector} hint="Opcional">
            <input name="sector" className={inputBase} placeholder="Cumbayá" />
          </Field>
        </div>
      </Card>

      <Card className="space-y-5 p-6">
        <h2 className="font-semibold">Presupuesto (USD)</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Precio mínimo" error={err.priceMin}>
            <input
              name="priceMin"
              type="number"
              min={0}
              step={1000}
              className={inputBase}
              placeholder="120000"
              required
            />
          </Field>
          <Field label="Precio máximo" error={err.priceMax}>
            <input
              name="priceMax"
              type="number"
              min={0}
              step={1000}
              className={inputBase}
              placeholder="160000"
              required
            />
          </Field>
        </div>
      </Card>

      <Card className="space-y-5 p-6">
        <h2 className="font-semibold">Características</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {visible.has("bedrooms") && (
            <Field label="Habitaciones" error={err.bedrooms}>
              <input name="bedrooms" type="number" min={0} max={20} className={inputBase} />
            </Field>
          )}
          {visible.has("bathrooms") && (
            <Field label="Baños" error={err.bathrooms}>
              <input name="bathrooms" type="number" min={0} max={20} className={inputBase} />
            </Field>
          )}
          {visible.has("minSquareMeters") && (
            <Field label="Metros cuadrados mínimos" error={err.minSquareMeters}>
              <input name="minSquareMeters" type="number" min={0} className={inputBase} />
            </Field>
          )}
          {visible.has("parkingSpots") && (
            <Field label="Parqueaderos" error={err.parkingSpots}>
              <input name="parkingSpots" type="number" min={0} max={20} className={inputBase} />
            </Field>
          )}
          {visible.has("propertyAgeYears") && (
            <Field label="Antigüedad máxima (años)" hint="Opcional">
              <input name="propertyAgeYears" type="number" min={0} max={200} className={inputBase} />
            </Field>
          )}
          <Field label="Fecha aproximada en que la necesitas" hint="Opcional" error={err.moveInDate}>
            <input name="moveInDate" type="date" className={inputBase} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-4 pt-1">
          {checkboxFeatures
            .filter((f) => visible.has(f.key))
            .map((f) => (
              <label key={f.key} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name={f.key} className="h-4 w-4 rounded border-border accent-[var(--accent)]" />
                {f.label}
              </label>
            ))}
        </div>
        <Field label="Otra característica" error={err.otherFeature} hint="Opcional: algo que no esté en la lista de arriba">
          <input
            name="otherFeature"
            maxLength={200}
            placeholder="Ej: acepta mascotas, vista al mar, cerca del colegio..."
            className={inputBase}
          />
        </Field>
      </Card>

      <Card className="space-y-5 p-6">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">Cuéntales un poco sobre ti</h2>
            <span className="rounded-full bg-surface-hover px-2 py-0.5 text-xs text-muted">
              Opcional
            </span>
          </div>
          <p className="mt-1.5 text-sm text-muted">
            Los agentes quieren saber quién está detrás de cada solicitud.
            Compartir un poco más sobre ti puede ayudarles a confiar más en
            tu solicitud y ofrecerte opciones más adecuadas.
          </p>
          <p className="mt-1 text-xs text-muted-2">
            Esta sección es opcional. Comparte únicamente la información con
            la que te sientas cómodo.
          </p>
        </div>
        <Field label="¿A qué te dedicas?" hint="Opcional" error={err.occupation}>
          <input
            name="occupation"
            maxLength={300}
            placeholder="Ej.: Soy ingeniero y trabajo en una empresa privada en Quito."
            className={inputBase}
          />
        </Field>
        <Field label="¿Por qué estás buscando esta propiedad?" hint="Opcional" error={err.searchReason}>
          <input
            name="searchReason"
            maxLength={300}
            placeholder="Ej.: Estoy buscando mi primera vivienda porque quiero independizarme."
            className={inputBase}
          />
        </Field>
        <Field label="¿Hay algo más que quieras contarle al agente?" hint="Opcional" error={err.additionalNotes}>
          <textarea
            name="additionalNotes"
            maxLength={500}
            rows={3}
            placeholder="Ej.: Me gustaría mudarme en los próximos 2 meses y ya tengo aprobado un crédito hipotecario."
            className={inputBase}
          />
        </Field>
      </Card>

      <Card className="space-y-5 p-6">
        <h2 className="font-semibold">Tus datos de contacto</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre" error={err.contactName}>
            <input name="contactName" className={inputBase} required />
          </Field>
          <Field label="Teléfono / WhatsApp" error={err.contactPhone}>
            <input name="contactPhone" className={inputBase} placeholder="0991234567" required />
          </Field>
          <Field label="Email" error={err.contactEmail} hint="Opcional">
            <input name="contactEmail" type="email" className={inputBase} />
          </Field>
          <Field label="Preferencia de contacto" error={err.contactPreference}>
            <select name="contactPreference" className={inputBase} defaultValue="WHATSAPP">
              {Object.entries(CONTACT_PREFERENCE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Quiero recibir contacto de hasta X agentes" error={err.maxAgents}>
          <div className="flex gap-3">
            {[1, 3, 5].map((n) => (
              <label key={n} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="maxAgents"
                  value={n}
                  defaultChecked={n === 3}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                {n} agente{n > 1 ? "s" : ""}
              </label>
            ))}
          </div>
        </Field>
      </Card>

      {state.error && (
        <p className="rounded-xl bg-danger-bg px-4 py-3 text-sm text-danger">
          {state.error}
        </p>
      )}

      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Publicando..." : "Publicar solicitud"}
      </Button>
    </form>
  );
}
