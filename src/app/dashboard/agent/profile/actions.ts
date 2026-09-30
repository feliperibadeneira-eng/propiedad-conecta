"use server";

import { revalidatePath } from "next/cache";
import { requireAgent } from "@/lib/auth";
import { agentProfileSchema } from "@/lib/validators/profile";
import { updateAgentProfile } from "@/lib/services/agentProfile";

export type ProfileState = { error?: string; success?: boolean };

export async function updateProfileAction(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const user = await requireAgent();

  const parsed = agentProfileSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
    whatsapp: formData.get("whatsapp"),
    company: formData.get("company"),
    city: formData.get("city"),
    yearsExperience: formData.get("yearsExperience") || undefined,
    workAreas: String(formData.get("workAreas") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    propertyTypes: formData.getAll("propertyTypes"),
    description: formData.get("description"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa los datos." };
  }

  await updateAgentProfile(user.id, user.agentProfileId!, parsed.data);
  revalidatePath("/dashboard/agent/profile");
  return { success: true };
}
