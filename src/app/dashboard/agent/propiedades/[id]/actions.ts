"use server";

import { revalidatePath } from "next/cache";
import { requireAgent } from "@/lib/auth";
import { setPropertyStatus } from "@/lib/services/properties";
import {
  parsePropertyPhotos,
  addPropertyImages,
  deletePropertyImage,
  setPrimaryPropertyImage,
  reorderPropertyImages,
} from "@/lib/services/propertyImages";

export async function activatePropertyAction(propertyId: string) {
  const user = await requireAgent();
  await setPropertyStatus(user.agentProfileId!, propertyId, "DISPONIBLE");
  revalidatePath(`/dashboard/agent/propiedades/${propertyId}`);
}

export async function pausePropertyAction(propertyId: string) {
  const user = await requireAgent();
  await setPropertyStatus(user.agentProfileId!, propertyId, "PAUSADA");
  revalidatePath(`/dashboard/agent/propiedades/${propertyId}`);
}

export async function closePropertyAction(propertyId: string) {
  const user = await requireAgent();
  await setPropertyStatus(user.agentProfileId!, propertyId, "CERRADA");
  revalidatePath(`/dashboard/agent/propiedades/${propertyId}`);
}

export type PhotoActionState = { error?: string };

export async function addPropertyPhotosAction(
  propertyId: string,
  _prev: PhotoActionState,
  formData: FormData,
): Promise<PhotoActionState> {
  const user = await requireAgent();

  let photos;
  try {
    photos = await parsePropertyPhotos(formData.getAll("photos"));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudieron procesar las fotos." };
  }
  if (photos.length === 0) {
    return { error: "Selecciona al menos una foto." };
  }

  try {
    await addPropertyImages(user.agentProfileId!, propertyId, photos);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudieron guardar las fotos." };
  }

  revalidatePath(`/dashboard/agent/propiedades/${propertyId}/editar`);
  return {};
}

export async function deletePropertyPhotoAction(propertyId: string, imageId: string) {
  const user = await requireAgent();
  await deletePropertyImage(user.agentProfileId!, propertyId, imageId);
  revalidatePath(`/dashboard/agent/propiedades/${propertyId}/editar`);
}

export async function setPrimaryPropertyPhotoAction(propertyId: string, imageId: string) {
  const user = await requireAgent();
  await setPrimaryPropertyImage(user.agentProfileId!, propertyId, imageId);
  revalidatePath(`/dashboard/agent/propiedades/${propertyId}/editar`);
}

export async function movePropertyPhotoLeftAction(propertyId: string, imageId: string) {
  const user = await requireAgent();
  await reorderPropertyImages(user.agentProfileId!, propertyId, imageId, "left");
  revalidatePath(`/dashboard/agent/propiedades/${propertyId}/editar`);
}

export async function movePropertyPhotoRightAction(propertyId: string, imageId: string) {
  const user = await requireAgent();
  await reorderPropertyImages(user.agentProfileId!, propertyId, imageId, "right");
  revalidatePath(`/dashboard/agent/propiedades/${propertyId}/editar`);
}
