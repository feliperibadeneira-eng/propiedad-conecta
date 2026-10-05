import { z } from "zod";

export const createPropertySchema = z.object({
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

  title: z.string().min(5).max(120),
  description: z.string().max(2000).optional().or(z.literal("")),

  // A diferencia de PropertyRequest.priceMin/priceMax (umbrales de
  // presupuesto del comprador, donde 0 es válido), este es el precio real
  // de una publicación: 0 o negativo no tiene sentido.
  price: z.coerce.number().positive().max(100_000_000),

  provincia: z.string().min(2).max(60),
  ciudad: z.string().min(2).max(60),
  sector: z.string().max(80).optional().or(z.literal("")),

  // A diferencia de PropertyRequest.minSquareMeters (filtro mínimo
  // opcional), este es la medida real de la propiedad: no puede ser 0.
  squareMeters: z.coerce.number().int().positive().max(100000),
  bedrooms: z.coerce.number().int().min(0).max(20).optional(),
  bathrooms: z.coerce.number().int().min(0).max(20).optional(),
});

export type CreatePropertyInput = z.infer<typeof createPropertySchema>;

// Editar reutiliza exactamente el mismo shape: no hay nada editable en
// Property que crear no cubra ya (el status se cambia por su propia
// acción dedicada, nunca por este formulario).
export const updatePropertySchema = createPropertySchema;
export type UpdatePropertyInput = z.infer<typeof updatePropertySchema>;
