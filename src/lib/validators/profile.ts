import { z } from "zod";

export const agentProfileSchema = z.object({
  name: z.string().min(2).max(120),
  phone: z.string().min(7).max(20),
  whatsapp: z.string().max(20).optional().or(z.literal("")),
  company: z.string().max(120).optional().or(z.literal("")),
  city: z.string().max(60).optional().or(z.literal("")),
  yearsExperience: z.coerce.number().int().min(0).max(60).optional(),
  workAreas: z.array(z.string().min(1).max(80)).max(30).default([]),
  propertyTypes: z
    .array(
      z.enum([
        "DEPARTAMENTO",
        "CASA",
        "TERRENO",
        "OFICINA",
        "LOCAL_COMERCIAL",
        "BODEGA",
        "OTRO",
      ]),
    )
    .max(7)
    .default([]),
  description: z.string().max(1000).optional().or(z.literal("")),
});
export type AgentProfileInput = z.infer<typeof agentProfileSchema>;

export const releaseLeadSchema = z.object({
  leadPurchaseId: z.string().uuid(),
  reason: z.string().min(2).max(200),
});

export const buyerOutcomeSchema = z.object({
  leadPurchaseId: z.string().uuid(),
  outcome: z.enum([
    "CONTACTED",
    "NO_CONTACT",
    "NO_MATCH",
    "BUYER_CLOSED_FOUND",
    "KEEP_SEARCHING",
  ]),
});
