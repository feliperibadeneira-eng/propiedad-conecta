// Tests de propertyImages.ts: múltiples fotos por propiedad, ownership
// (un agente no puede ver/eliminar/reordenar/cambiar portada de fotos de
// otro agente), límite de 10, eliminación/portada/orden, cascade delete, y
// validación de archivos (parsePropertyPhotos) sin depender de ningún
// proveedor externo — todo corre contra Postgres local + File nativo de
// Node.
import "dotenv/config";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../db";
import { hashPassword } from "../password";
import { createProperty } from "./properties";
import {
  MAX_IMAGES_PER_PROPERTY,
  PROPERTY_PHOTO_MIME_TYPES,
  parsePropertyPhotos,
  listPropertyImages,
  addPropertyImages,
  deletePropertyImage,
  setPrimaryPropertyImage,
  reorderPropertyImages,
} from "./propertyImages";

const RUN_ID = Date.now().toString(36);
const createdUserIds: string[] = [];

async function makeAgent() {
  const user = await prisma.user.create({
    data: {
      email: `test-property-images-agent-${RUN_ID}-${createdUserIds.length}@test.local`,
      passwordHash: await hashPassword("test12345"),
      name: "Agente de prueba",
      phone: "0990000000",
      role: "AGENT",
    },
  });
  createdUserIds.push(user.id);
  const profile = await prisma.agentProfile.create({ data: { userId: user.id } });
  return { user, profile };
}

async function makeProperty(agentProfileId: string) {
  return createProperty(agentProfileId, {
    operationType: "COMPRAR",
    propertyType: "DEPARTAMENTO",
    title: "Propiedad de prueba",
    price: 95000,
    provincia: "Pichincha",
    ciudad: "Quito",
    squareMeters: 80,
  });
}

function fakePhoto(byte = 1): { data: Uint8Array; mimeType: string } {
  return { data: new Uint8Array([byte, byte, byte]), mimeType: "image/jpeg" };
}

after(async () => {
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.$disconnect();
});

test("una propiedad puede tener múltiples imágenes", async () => {
  const { profile } = await makeAgent();
  const property = await makeProperty(profile.id);
  await addPropertyImages(profile.id, property.id, [fakePhoto(1), fakePhoto(2), fakePhoto(3)]);

  const images = await listPropertyImages(profile.id, property.id);
  assert.equal(images.length, 3);
});

test("las imágenes quedan asociadas a la propiedad correcta", async () => {
  const { profile } = await makeAgent();
  const propertyA = await makeProperty(profile.id);
  const propertyB = await makeProperty(profile.id);
  await addPropertyImages(profile.id, propertyA.id, [fakePhoto(1)]);
  await addPropertyImages(profile.id, propertyB.id, [fakePhoto(2), fakePhoto(3)]);

  const imagesA = await listPropertyImages(profile.id, propertyA.id);
  const imagesB = await listPropertyImages(profile.id, propertyB.id);
  assert.equal(imagesA.length, 1);
  assert.equal(imagesB.length, 2);
});

test("listar imágenes solo funciona para la propiedad del agente dueño", async () => {
  const { profile: agentA } = await makeAgent();
  const { profile: agentB } = await makeAgent();
  const property = await makeProperty(agentB.id);
  await addPropertyImages(agentB.id, property.id, [fakePhoto()]);

  await assert.rejects(() => listPropertyImages(agentA.id, property.id));
});

test("otro agente no puede eliminar una imagen de una propiedad ajena", async () => {
  const { profile: agentA } = await makeAgent();
  const { profile: agentB } = await makeAgent();
  const property = await makeProperty(agentB.id);
  const [image] = await addPropertyImages(agentB.id, property.id, [fakePhoto()]);

  await assert.rejects(() => deletePropertyImage(agentA.id, property.id, image.id));

  const stillThere = await prisma.propertyImage.findUnique({ where: { id: image.id } });
  assert.ok(stillThere);
});

test("otro agente no puede cambiar la portada de una propiedad ajena", async () => {
  const { profile: agentA } = await makeAgent();
  const { profile: agentB } = await makeAgent();
  const property = await makeProperty(agentB.id);
  const [first, second] = await addPropertyImages(agentB.id, property.id, [
    fakePhoto(1),
    fakePhoto(2),
  ]);

  await assert.rejects(() => setPrimaryPropertyImage(agentA.id, property.id, second.id));

  const stillPrimary = await prisma.propertyImage.findUnique({ where: { id: first.id } });
  assert.equal(stillPrimary?.isPrimary, true);
});

test("otro agente no puede reordenar las imágenes de una propiedad ajena", async () => {
  const { profile: agentA } = await makeAgent();
  const { profile: agentB } = await makeAgent();
  const property = await makeProperty(agentB.id);
  const [first, second] = await addPropertyImages(agentB.id, property.id, [
    fakePhoto(1),
    fakePhoto(2),
  ]);

  await assert.rejects(() => reorderPropertyImages(agentA.id, property.id, second.id, "left"));

  const stillOrder = await prisma.propertyImage.findMany({
    where: { propertyId: property.id },
    orderBy: { sortOrder: "asc" },
  });
  assert.equal(stillOrder[0].id, first.id);
  assert.equal(stillOrder[1].id, second.id);
});

test(`no se pueden tener más de ${MAX_IMAGES_PER_PROPERTY} imágenes por propiedad`, async () => {
  const { profile } = await makeAgent();
  const property = await makeProperty(profile.id);
  const photos = Array.from({ length: MAX_IMAGES_PER_PROPERTY }, (_, i) => fakePhoto(i + 1));
  await addPropertyImages(profile.id, property.id, photos);

  await assert.rejects(() => addPropertyImages(profile.id, property.id, [fakePhoto(99)]));

  const images = await listPropertyImages(profile.id, property.id);
  assert.equal(images.length, MAX_IMAGES_PER_PROPERTY);
});

test("eliminar una imagen la quita del listado", async () => {
  const { profile } = await makeAgent();
  const property = await makeProperty(profile.id);
  const [first, second] = await addPropertyImages(profile.id, property.id, [
    fakePhoto(1),
    fakePhoto(2),
  ]);

  await deletePropertyImage(profile.id, property.id, second.id);

  const images = await listPropertyImages(profile.id, property.id);
  assert.equal(images.length, 1);
  assert.equal(images[0].id, first.id);
});

test("eliminar la portada promueve automáticamente la siguiente imagen", async () => {
  const { profile } = await makeAgent();
  const property = await makeProperty(profile.id);
  const [first, second] = await addPropertyImages(profile.id, property.id, [
    fakePhoto(1),
    fakePhoto(2),
  ]);
  assert.equal(first.isPrimary, true);

  await deletePropertyImage(profile.id, property.id, first.id);

  const images = await listPropertyImages(profile.id, property.id);
  assert.equal(images.length, 1);
  assert.equal(images[0].id, second.id);
  assert.equal(images[0].isPrimary, true);
});

test("la primera foto subida se marca portada automáticamente", async () => {
  const { profile } = await makeAgent();
  const property = await makeProperty(profile.id);
  const [first] = await addPropertyImages(profile.id, property.id, [fakePhoto()]);
  assert.equal(first.isPrimary, true);
});

test("se puede cambiar la portada a otra imagen existente", async () => {
  const { profile } = await makeAgent();
  const property = await makeProperty(profile.id);
  const [first, second] = await addPropertyImages(profile.id, property.id, [
    fakePhoto(1),
    fakePhoto(2),
  ]);

  await setPrimaryPropertyImage(profile.id, property.id, second.id);

  const images = await listPropertyImages(profile.id, property.id);
  const byId = Object.fromEntries(images.map((i) => [i.id, i]));
  assert.equal(byId[first.id].isPrimary, false);
  assert.equal(byId[second.id].isPrimary, true);
});

test("reordenar mueve una imagen a la izquierda y a la derecha", async () => {
  const { profile } = await makeAgent();
  const property = await makeProperty(profile.id);
  const [first, second, third] = await addPropertyImages(profile.id, property.id, [
    fakePhoto(1),
    fakePhoto(2),
    fakePhoto(3),
  ]);

  await reorderPropertyImages(profile.id, property.id, third.id, "left");
  let images = await listPropertyImages(profile.id, property.id);
  assert.deepEqual(images.map((i) => i.id), [first.id, third.id, second.id]);

  await reorderPropertyImages(profile.id, property.id, first.id, "right");
  images = await listPropertyImages(profile.id, property.id);
  assert.deepEqual(images.map((i) => i.id), [third.id, first.id, second.id]);
});

test("reordenar en el extremo no hace nada (no-op)", async () => {
  const { profile } = await makeAgent();
  const property = await makeProperty(profile.id);
  const [first, second] = await addPropertyImages(profile.id, property.id, [
    fakePhoto(1),
    fakePhoto(2),
  ]);

  await reorderPropertyImages(profile.id, property.id, first.id, "left");
  const images = await listPropertyImages(profile.id, property.id);
  assert.deepEqual(images.map((i) => i.id), [first.id, second.id]);
});

test("borrar la Property elimina en cascada sus PropertyImage", async () => {
  const { profile } = await makeAgent();
  const property = await makeProperty(profile.id);
  const [image] = await addPropertyImages(profile.id, property.id, [fakePhoto()]);

  await prisma.property.delete({ where: { id: property.id } });

  const found = await prisma.propertyImage.findUnique({ where: { id: image.id } });
  assert.equal(found, null);
});

// --- Validación de archivos (parsePropertyPhotos) ---

test("parsePropertyPhotos acepta JPEG, PNG y WebP", async () => {
  for (const mimeType of PROPERTY_PHOTO_MIME_TYPES) {
    const file = new File([new Uint8Array([1, 2, 3])], "foto.img", { type: mimeType });
    const parsed = await parsePropertyPhotos([file]);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].mimeType, mimeType);
  }
});

test("parsePropertyPhotos rechaza formatos no permitidos (ej. GIF)", async () => {
  const file = new File([new Uint8Array([1, 2, 3])], "foto.gif", { type: "image/gif" });
  await assert.rejects(() => parsePropertyPhotos([file]));
});

test("parsePropertyPhotos rechaza archivos que no son imágenes", async () => {
  const file = new File([new Uint8Array([1, 2, 3])], "doc.pdf", { type: "application/pdf" });
  await assert.rejects(() => parsePropertyPhotos([file]));
});

test("parsePropertyPhotos rechaza archivos más grandes que el límite de 5MB", async () => {
  const big = new Uint8Array(6 * 1024 * 1024);
  const file = new File([big], "foto.jpg", { type: "image/jpeg" });
  await assert.rejects(() => parsePropertyPhotos([file]));
});

test(`parsePropertyPhotos rechaza más de ${MAX_IMAGES_PER_PROPERTY} archivos en una sola carga`, async () => {
  const files = Array.from(
    { length: MAX_IMAGES_PER_PROPERTY + 1 },
    (_, i) => new File([new Uint8Array([i])], `foto${i}.jpg`, { type: "image/jpeg" }),
  );
  await assert.rejects(() => parsePropertyPhotos(files));
});

test("parsePropertyPhotos ignora entradas que no son archivos", async () => {
  const parsed = await parsePropertyPhotos(["no-es-un-archivo"]);
  assert.equal(parsed.length, 0);
});
