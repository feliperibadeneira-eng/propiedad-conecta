import type { CreditPackageType } from "@/generated/prisma/enums";

// Paquetes fijos (sección 2): sin descuentos inventados, sin expiración,
// sin transferencia entre agentes, sin retiro como dinero — todo eso es
// texto informativo, no reglas que haya que codificar (no hay ningún
// mecanismo de "vencimiento" ni de "transferencia" en el sistema).
export const CREDIT_PACKAGES: Record<
  CreditPackageType,
  { name: string; price: number; credits: number; popular?: boolean }
> = {
  STARTER: { name: "Starter", price: 10, credits: 10 },
  PRO: { name: "Pro", price: 40, credits: 50, popular: true },
  PREMIUM: { name: "Premium", price: 75, credits: 100 },
};

export function getCreditPackage(key: CreditPackageType) {
  return CREDIT_PACKAGES[key];
}
