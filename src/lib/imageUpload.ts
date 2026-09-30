export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB

// Extrae y valida una imagen de un campo de FormData. Devuelve `null` si no
// se adjuntó ningún archivo (el caller decide si eso es un error o no —
// ej. el comprobante de pago es obligatorio, el QR de Deuna al reemplazar
// la configuración no lo es). Tira un Error con mensaje en español si se
// adjuntó algo que no es una imagen válida o supera el límite de tamaño.
export async function parseImageFormFile(
  value: FormDataEntryValue | null,
): Promise<{ data: Uint8Array<ArrayBuffer>; mimeType: string } | null> {
  if (!(value instanceof File) || value.size === 0) return null;

  if (!value.type.startsWith("image/")) {
    throw new Error("El archivo debe ser una imagen.");
  }
  if (value.size > MAX_IMAGE_BYTES) {
    throw new Error("La imagen no puede pesar más de 5MB.");
  }

  const data = new Uint8Array(await value.arrayBuffer());
  return { data, mimeType: value.type };
}
