import { prisma } from "@/lib/db";
import { parseImageFormFile } from "@/lib/imageUpload";
import { MAX_IMAGES_PER_PROPERTY, PROPERTY_PHOTO_MIME_TYPES } from "@/lib/propertyPhotoRules";

export { MAX_IMAGES_PER_PROPERTY, PROPERTY_PHOTO_MIME_TYPES };

type ParsedPhoto = { data: Uint8Array; mimeType: string };

// Capa de "almacenamiento/upload": parsea y valida los archivos crudos de
// un FormData. No sabe nada de Property ni de ownership — eso vive en las
// funciones de abajo.
export async function parsePropertyPhotos(
  entries: FormDataEntryValue[],
): Promise<ParsedPhoto[]> {
  if (entries.length > MAX_IMAGES_PER_PROPERTY) {
    throw new Error(`Puedes subir máximo ${MAX_IMAGES_PER_PROPERTY} fotos a la vez.`);
  }

  const photos: ParsedPhoto[] = [];
  for (const entry of entries) {
    const parsed = await parseImageFormFile(entry, { allowedTypes: PROPERTY_PHOTO_MIME_TYPES });
    if (parsed) photos.push(parsed);
  }
  return photos;
}

async function assertOwnsProperty(agentProfileId: string, propertyId: string) {
  const property = await prisma.property.findFirst({
    where: { id: propertyId, agentId: agentProfileId },
    select: { id: true },
  });
  if (!property) throw new Error("Propiedad no encontrada");
}

export async function listPropertyImages(agentProfileId: string, propertyId: string) {
  await assertOwnsProperty(agentProfileId, propertyId);
  return prisma.propertyImage.findMany({
    where: { propertyId },
    orderBy: { sortOrder: "asc" },
    select: { id: true, mimeType: true, isPrimary: true, sortOrder: true, createdAt: true },
  });
}

export async function addPropertyImages(
  agentProfileId: string,
  propertyId: string,
  files: ParsedPhoto[],
) {
  await assertOwnsProperty(agentProfileId, propertyId);
  if (files.length === 0) return [];

  const existing = await prisma.propertyImage.findMany({
    where: { propertyId },
    select: { sortOrder: true, isPrimary: true },
  });
  if (existing.length + files.length > MAX_IMAGES_PER_PROPERTY) {
    throw new Error(
      `Una propiedad admite máximo ${MAX_IMAGES_PER_PROPERTY} fotos (ya tiene ${existing.length}).`,
    );
  }

  const hasPrimary = existing.some((img) => img.isPrimary);
  const maxSortOrder = existing.reduce((max, img) => Math.max(max, img.sortOrder), -1);

  return prisma.$transaction(
    files.map((file, i) =>
      prisma.propertyImage.create({
        data: {
          propertyId,
          data: Buffer.from(file.data),
          mimeType: file.mimeType,
          sortOrder: maxSortOrder + 1 + i,
          // La primera foto que recibe una propiedad sin portada se vuelve
          // la portada automáticamente — nunca deja una propiedad con
          // fotos pero sin ninguna marcada como principal.
          isPrimary: !hasPrimary && i === 0,
        },
        select: { id: true, isPrimary: true, sortOrder: true },
      }),
    ),
  );
}

export async function deletePropertyImage(
  agentProfileId: string,
  propertyId: string,
  imageId: string,
) {
  await assertOwnsProperty(agentProfileId, propertyId);
  const image = await prisma.propertyImage.findFirst({ where: { id: imageId, propertyId } });
  if (!image) throw new Error("Foto no encontrada");

  await prisma.propertyImage.delete({ where: { id: imageId } });

  // Si borramos la portada y quedan otras fotos, promovemos la siguiente
  // en orden — igual que arriba, nunca dejamos fotos sin portada.
  if (image.isPrimary) {
    const next = await prisma.propertyImage.findFirst({
      where: { propertyId },
      orderBy: { sortOrder: "asc" },
    });
    if (next) {
      await prisma.propertyImage.update({ where: { id: next.id }, data: { isPrimary: true } });
    }
  }
}

export async function setPrimaryPropertyImage(
  agentProfileId: string,
  propertyId: string,
  imageId: string,
) {
  await assertOwnsProperty(agentProfileId, propertyId);
  const image = await prisma.propertyImage.findFirst({ where: { id: imageId, propertyId } });
  if (!image) throw new Error("Foto no encontrada");

  // Prisma no soporta índices únicos parciales en su DSL, así que la
  // exclusividad "una sola portada por propiedad" se garantiza acá: limpiar
  // todas y marcar solo la elegida, en una transacción.
  await prisma.$transaction([
    prisma.propertyImage.updateMany({ where: { propertyId }, data: { isPrimary: false } }),
    prisma.propertyImage.update({ where: { id: imageId }, data: { isPrimary: true } }),
  ]);
}

export async function reorderPropertyImages(
  agentProfileId: string,
  propertyId: string,
  imageId: string,
  direction: "left" | "right",
) {
  await assertOwnsProperty(agentProfileId, propertyId);
  const images = await prisma.propertyImage.findMany({
    where: { propertyId },
    orderBy: { sortOrder: "asc" },
    select: { id: true, sortOrder: true },
  });
  const index = images.findIndex((img) => img.id === imageId);
  if (index === -1) throw new Error("Foto no encontrada");

  const swapIndex = direction === "left" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= images.length) return; // ya está en el extremo

  const a = images[index];
  const b = images[swapIndex];
  await prisma.$transaction([
    prisma.propertyImage.update({ where: { id: a.id }, data: { sortOrder: b.sortOrder } }),
    prisma.propertyImage.update({ where: { id: b.id }, data: { sortOrder: a.sortOrder } }),
  ]);
}
