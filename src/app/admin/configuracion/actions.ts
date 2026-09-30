"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { SETTINGS, setSetting } from "@/lib/settings";
import { logAudit } from "@/lib/services/audit";

export async function updateSettingsAction(formData: FormData) {
  const admin = await requireAdmin();

  for (const def of Object.values(SETTINGS)) {
    const value = formData.get(def.key);
    if (typeof value === "string" && value.trim() !== "") {
      await setSetting(def, value.trim());
    }
  }

  await logAudit({
    userId: admin.id,
    action: "SETTINGS_UPDATED",
    entityType: "AdminSetting",
  });
  revalidatePath("/admin/configuracion");
}
