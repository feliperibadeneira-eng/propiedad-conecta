import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { prisma } from "@/lib/db";
import { confirmPaymentById } from "@/lib/services/purchase";

// Fuente única de verdad de que un pago se completó (sección 17): el
// frontend nunca puede marcar un lead como comprado, solo Stripe firmando
// este webhook puede disparar confirmPaymentById.
export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Webhook no configurado." }, { status: 400 });
  }

  const body = await req.text();
  let event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Firma inválida." }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as { metadata?: { paymentId?: string } };
    const paymentId = session.metadata?.paymentId;
    if (paymentId) {
      await confirmPaymentById(paymentId).catch(async (err) => {
        // confirmPaymentById ya deja el pago en REFUNDED si el motivo fue
        // que se agotaron los cupos; aquí solo cubrimos cualquier otro
        // error inesperado, y solo si el pago sigue como PENDING (para no
        // pisar un REFUNDED que ya haya quedado registrado).
        await prisma.payment.updateMany({
          where: { id: paymentId, status: "PENDING" },
          data: { status: "FAILED" },
        });
        console.error("No se pudo confirmar el pago", paymentId, err);
      });
    }
  }

  return NextResponse.json({ received: true });
}
