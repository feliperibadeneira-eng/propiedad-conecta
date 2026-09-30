import { prisma } from "@/lib/db";

export type TrustSignal = { key: string; label: string };

const RECENT_HOURS = 48;

// Sección 3: señales objetivas de confianza, basadas únicamente en datos
// reales ya disponibles en el sistema. Nunca inventamos un puntaje ni un
// "nivel de confianza" — cada señal es un hecho que existe o no existe, y
// si no hay suficiente información para afirmarla, simplemente se omite
// (nunca se muestra una señal negativa).
export async function computeTrustSignals(request: {
  id: string;
  buyerId: string;
  createdAt: Date;
  bedrooms: number | null;
  bathrooms: number | null;
  minSquareMeters: number | null;
  parkingSpots: number | null;
  moveInDate: Date | null;
  occupation: string | null;
  searchReason: string | null;
  additionalNotes: string | null;
}): Promise<TrustSignal[]> {
  const signals: TrustSignal[] = [];

  // Presupuesto definido: priceMin/priceMax son obligatorios en el schema,
  // así que esto es siempre cierto — pero es un hecho real, no inventado.
  signals.push({ key: "budget", label: "Presupuesto definido" });

  const filledCount = [
    request.bedrooms,
    request.bathrooms,
    request.minSquareMeters,
    request.parkingSpots,
  ].filter((v) => v != null).length;
  if (filledCount >= 2) {
    signals.push({ key: "requirements", label: "Requisitos completos" });
  }

  if (request.moveInDate) {
    signals.push({ key: "move_in_date", label: "Fecha de mudanza definida" });
  }

  if (request.occupation || request.searchReason || request.additionalNotes) {
    signals.push({
      key: "personal_description",
      label: "Ha contado un poco sobre su búsqueda",
    });
  }

  const hoursSinceCreated =
    (Date.now() - request.createdAt.getTime()) / (1000 * 60 * 60);
  if (hoursSinceCreated <= RECENT_HOURS) {
    signals.push({ key: "recent", label: "Solicitud publicada recientemente" });
  }

  const [respondedBefore, buyerProfile] = await Promise.all([
    prisma.leadPurchase.count({
      where: { request: { buyerId: request.buyerId }, status: "RESPONDED" },
    }),
    prisma.buyerProfile.findUnique({
      where: { id: request.buyerId },
      select: { lastConfirmedSearchingAt: true },
    }),
  ]);

  if (respondedBefore > 0) {
    signals.push({
      key: "responded_before",
      label: "Ha respondido a agentes anteriormente",
    });
  }
  if (buyerProfile?.lastConfirmedSearchingAt) {
    signals.push({
      key: "keep_searching_confirmed",
      label: "Ha confirmado que continúa buscando",
    });
  }

  return signals;
}
