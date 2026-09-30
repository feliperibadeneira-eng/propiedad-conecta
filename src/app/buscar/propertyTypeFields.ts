import type { PropertyType } from "@/generated/prisma/enums";

// Qué campos de características mostrar según el tipo de propiedad, para
// no mostrar un formulario larguísimo con campos que no aplican (sección 7).
export type FieldKey =
  | "bedrooms"
  | "bathrooms"
  | "minSquareMeters"
  | "parkingSpots"
  | "furnished"
  | "hasElevator"
  | "hasTerrace"
  | "hasPatio"
  | "hasPool"
  | "hasSecurity"
  | "propertyAgeYears"
  | "otherFeature";

const FIELDS_BY_TYPE: Record<PropertyType, FieldKey[]> = {
  DEPARTAMENTO: [
    "bedrooms",
    "bathrooms",
    "minSquareMeters",
    "parkingSpots",
    "furnished",
    "hasElevator",
    "hasPool",
    "hasSecurity",
    "propertyAgeYears",
  ],
  CASA: [
    "bedrooms",
    "bathrooms",
    "minSquareMeters",
    "parkingSpots",
    "furnished",
    "hasTerrace",
    "hasPatio",
    "hasPool",
    "hasSecurity",
    "propertyAgeYears",
  ],
  OFICINA: [
    "minSquareMeters",
    "parkingSpots",
    "hasElevator",
    "hasSecurity",
  ],
  LOCAL_COMERCIAL: ["minSquareMeters", "parkingSpots", "hasSecurity"],
  BODEGA: ["minSquareMeters", "parkingSpots", "hasSecurity"],
  TERRENO: ["minSquareMeters"],
  OTRO: ["bedrooms", "bathrooms", "minSquareMeters", "parkingSpots"],
};

// "Otro" está disponible para cualquier tipo de propiedad: no tiene sentido
// limitar el tipo de característica extra que alguien quiera describir.
export function visibleFieldsFor(type: PropertyType): Set<FieldKey> {
  return new Set([...FIELDS_BY_TYPE[type], "otherFeature"]);
}
