import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Default de Next es 1MB; insuficiente para una foto de comprobante de
    // pago tomada con el celular. El límite real que ve el agente (5MB) se
    // valida en submitCreditPurchaseAction — esto solo evita que Next
    // rechace el body antes de que esa validación corra.
    serverActions: { bodySizeLimit: "8mb" },
  },
};

export default nextConfig;
