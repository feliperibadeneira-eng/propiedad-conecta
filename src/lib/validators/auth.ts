import { z } from "zod";

export const agentRegisterSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().max(160),
  password: z.string().min(8).max(72),
  phone: z.string().min(7).max(20),
  company: z.string().max(120).optional().or(z.literal("")),
  city: z.string().max(60).optional().or(z.literal("")),
});
export type AgentRegisterInput = z.infer<typeof agentRegisterSchema>;

export const loginSchema = z.object({
  email: z.string().email().max(160),
  password: z.string().min(1).max(72),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const buyerRegisterSchema = z.object({
  firstName: z.string().min(2).max(80),
  lastName: z.string().min(2).max(80),
  email: z.string().email().max(160),
  password: z.string().min(8).max(72),
  phone: z.string().min(7).max(20),
  contactConsent: z.literal(true, {
    message: "Debes autorizar que los agentes puedan contactarte.",
  }),
});
export type BuyerRegisterInput = z.infer<typeof buyerRegisterSchema>;
