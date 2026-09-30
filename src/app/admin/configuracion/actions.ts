"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { SETTINGS, setSetting } from "@/lib/settings";
import { parseImageFormFile } from "@/lib/imageUpload";
import { logAudit } from "@/lib/services/audit";

export async function updateSettingsAction(formData: FormData) {
  const admin = await requireAdmin();

  // El input de archivo llega como File (no string), así que el loop
  // genérico de abajo ya lo ignora solo — se procesa aparte. Si no se
  // adjuntó un archivo nuevo, se mantiene el QR actual sin tocarlo; si se
  // adjuntó algo inválido (no es imagen, o pesa de más), se ignora en vez
  // de romper el guardado del resto de la configuración.
  try {
    const qrFile = await parseImageFormFile(formData.get(SETTINGS.deunaQrImage.key));
    if (qrFile) {
      await setSetting(
        SETTINGS.deunaQrImage,
        `data:${qrFile.mimeType};base64,${Buffer.from(qrFile.data).toString("base64")}`,
      );
    }
  } catch (err) {
    console.error("No se pudo actualizar el QR de Deuna", err);
  }

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
