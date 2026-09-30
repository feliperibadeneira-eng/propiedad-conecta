import { z } from "zod";

export const requestFeaturesSchema = z.object({
  furnished: z.boolean().optional(),
  hasElevator: z.boolean().optional(),
  hasTerrace: z.boolean().optional(),
  hasPatio: z.boolean().optional(),
  hasPool: z.boolean().optional(),
  hasSecurity: z.boolean().optional(),
  propertyAgeYears: z.coerce.number().int().min(0).max(200).optional(),
  otherFeature: z.string().max(200).optional().or(z.literal("")),
});

export const createRequestSchema = z
  .object({
    operationType: z.enum(["COMPRAR", "ALQUILAR"]),
    propertyType: z.enum([
      "DEPARTAMENTO",
      "CASA",
      "TERRENO",
      "OFICINA",
      "LOCAL_COMERCIAL",
      "BODEGA",
      "OTRO",
    ]),
    provincia: z.string().min(2).max(60),
    ciudad: z.string().min(2).max(60),
    sector: z.string().max(80).optional().or(z.literal("")),

    priceMin: z.coerce.number().min(0),
    priceMax: z.coerce.number().min(0),

    bedrooms: z.coerce.number().int().min(0).max(20).optional(),
    bathrooms: z.coerce.number().int().min(0).max(20).optional(),
    minSquareMeters: z.coerce.number().int().min(0).max(100000).optional(),
    parkingSpots: z.coerce.number().int().min(0).max(20).optional(),
    moveInDate: z.coerce.date().optional().or(z.literal("")),

    features: requestFeaturesSchema.optional(),

    // "Cuéntales un poco sobre ti" (sección 2): totalmente opcional, nunca
    // debe impedir publicar la solicitud.
    occupation: z.string().max(300).optional().or(z.literal("")),
    searchReason: z.string().max(300).optional().or(z.literal("")),
    additionalNotes: z.string().max(500).optional().or(z.literal("")),

    contactName: z.string().min(2).max(120),
    contactPhone: z.string().min(7).max(20),
    contactEmail: z.string().email().max(160).optional().or(z.literal("")),
    contactPreference: z.enum(["WHATSAPP", "LLAMADA", "EMAIL"]),
    maxAgents: z.coerce.number().int().refine((v) => [1, 3, 5].includes(v), {
      message: "El número de agentes debe ser 1, 3 o 5.",
    }),
  })
  .refine((data) => data.priceMax >= data.priceMin, {
    message: "El precio máximo debe ser mayor o igual al mínimo.",
    path: ["priceMax"],
  });

export type CreateRequestInput = z.infer<typeof createRequestSchema>;
