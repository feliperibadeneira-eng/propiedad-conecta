import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

// El comprobante es información privada (sección 7): solo el agente dueño
// de la compra o un admin pueden verlo. No hay ninguna URL pública/estática
// involucrada — este endpoint es el único lugar que lee los bytes, y el
// check de rol/ownership corre acá, server-side, antes de devolverlos.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return new NextResponse(null, { status: 401 });
  }

  const { id } = await params;
  const purchase = await prisma.creditPurchaseRequest.findUnique({
    where: { id },
    select: {
      agentId: true,
      receiptImageData: true,
      receiptImageMimeType: true,
    },
  });

  if (!purchase || !purchase.receiptImageData) {
    return new NextResponse(null, { status: 404 });
  }

  const isOwner = user.agentProfileId === purchase.agentId;
  if (user.role !== "ADMIN" && !isOwner) {
    return new NextResponse(null, { status: 403 });
  }

  return new NextResponse(new Uint8Array(purchase.receiptImageData), {
    headers: {
      "Content-Type": purchase.receiptImageMimeType ?? "application/octet-stream",
      "Cache-Control": "private, no-store",
    },
  });
}
