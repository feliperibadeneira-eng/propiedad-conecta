import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

// Las fotos de una propiedad son privadas del agente dueño (todavía no
// existe catálogo público ni de comprador) — solo ese agente puede verlas.
// Este endpoint es el único lugar que lee los bytes; el check de
// ownership corre acá, server-side, antes de devolverlos.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return new NextResponse(null, { status: 401 });
  }

  const { id } = await params;
  const image = await prisma.propertyImage.findUnique({
    where: { id },
    select: {
      data: true,
      mimeType: true,
      property: { select: { agentId: true } },
    },
  });

  if (!image) {
    return new NextResponse(null, { status: 404 });
  }

  if (user.agentProfileId !== image.property.agentId) {
    return new NextResponse(null, { status: 403 });
  }

  return new NextResponse(new Uint8Array(image.data), {
    headers: {
      "Content-Type": image.mimeType,
      "Cache-Control": "private, no-store",
    },
  });
}
