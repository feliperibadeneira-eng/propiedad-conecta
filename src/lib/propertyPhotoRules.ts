// Reglas puras (sin dependencias de servidor) compartidas entre el
// servicio (propertyImages.ts) y componentes cliente (PropertyForm,
// PhotoPicker, PropertyPhotosManager) — este archivo no debe importar
// nada que dependa de Prisma/Node, para poder usarse en el bundle del
// navegador.
export const MAX_IMAGES_PER_PROPERTY = 10;

// Sin SVG (riesgo de contenido activo) ni formatos exóticos — solo lo que
// los navegadores renderizan de forma consistente en una galería.
export const PROPERTY_PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
