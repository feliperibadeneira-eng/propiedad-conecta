"use server";

import { revalidatePath } from "next/cache";
import { requireAgent } from "@/lib/auth";
import { setPropertyStatus } from "@/lib/services/properties";

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
