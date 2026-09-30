"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { setUserActive } from "@/lib/services/admin";

export async function toggleUserActiveAction(
  userId: string,
  active: boolean,
) {
  const admin = await requireAdmin();
  await setUserActive(admin.id, userId, active);
  revalidatePath("/admin/usuarios");
}
