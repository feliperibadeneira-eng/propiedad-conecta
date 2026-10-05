"use server";

import { redirect } from "next/navigation";
import { requireAgent } from "@/lib/auth";
import { createPropertySchema, updatePropertySchema } from "@/lib/validators/property";
import { createProperty, updateProperty } from "@/lib/services/properties";

export type PropertyFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

function parsePropertyFormData(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  return {
    operationType: raw.operationType,
    propertyType: raw.propertyType,
    title: raw.title,
    description: raw.description,
    price: raw.price,
    provincia: raw.provincia,
    ciudad: raw.ciudad,
    sector: raw.sector,
    squareMeters: raw.squareMeters,
    bedrooms: raw.bedrooms || undefined,
    bathrooms: raw.bathrooms || undefined,
  };
}

function fieldErrorsFrom(issues: { path: PropertyKey[]; message: string }[]) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    fieldErrors[String(issue.path[0])] = issue.message;
  }
  return fieldErrors;
}

export async function createPropertyAction(
  _prev: PropertyFormState,
  formData: FormData,
): Promise<PropertyFormState> {
  const user = await requireAgent();
  const parsed = createPropertySchema.safeParse(parsePropertyFormData(formData));

  if (!parsed.success) {
    return {
      error: "Revisa los campos marcados.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  const property = await createProperty(user.agentProfileId!, parsed.data);
  redirect(`/dashboard/agent/propiedades/${property.id}?created=1`);
}

export async function updatePropertyAction(
  propertyId: string,
  _prev: PropertyFormState,
  formData: FormData,
): Promise<PropertyFormState> {
  const user = await requireAgent();
  const parsed = updatePropertySchema.safeParse(parsePropertyFormData(formData));

  if (!parsed.success) {
    return {
      error: "Revisa los campos marcados.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  await updateProperty(user.agentProfileId!, propertyId, parsed.data);
  redirect(`/dashboard/agent/propiedades/${propertyId}?updated=1`);
}
