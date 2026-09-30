import Stripe from "stripe";

// Se instancia perezosamente: en desarrollo/demo puede no haber claves de
// Stripe configuradas todavía, y no queremos que eso rompa todo el import.
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error(
        "STRIPE_SECRET_KEY no está configurada (ver .env.example).",
      );
    }
    _stripe = new Stripe(key);
  }
  return _stripe;
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}
