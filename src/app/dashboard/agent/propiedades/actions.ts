"use server";

import { redirect } from "next/navigation";
import { requireAgent } from "@/lib/auth";
import { createPropertySchema, updatePropertySchema } from "@/lib/validators/property";
import { createProperty, updateProperty } from "@/lib/services/properties";
import { parsePropertyPhotos, addPropertyImages } from "@/lib/services/propertyImages";

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

  let photos: Awaited<ReturnType<typeof parsePropertyPhotos>>;
  try {
    photos = await parsePropertyPhotos(formData.getAll("photos"));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudieron procesar las fotos." };
  }

  const property = await createProperty(user.agentProfileId!, parsed.data);

  // La propiedad ya quedó creada en este punto — un fallo al adjuntar
  // fotos (en la práctica, solo podría pasar por una condición de carrera
  // rarísima) no debe perder el resto de los datos que el agente ya
  // ingresó; se lo señalamos para que reintente desde "Editar".
  let photoError = false;
  if (photos.length > 0) {
    try {
      await addPropertyImages(user.agentProfileId!, property.id, photos);
    } catch {
      photoError = true;
    }
  }

  redirect(
    `/dashboard/agent/propiedades/${property.id}?created=1${photoError ? "&photoError=1" : ""}`,
  );
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
