import { prisma } from "@/lib/db";

export type TrustSignal = { key: string; label: string };

const RECENT_HOURS = 48;

type RequestForSignals = {
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
};

// Las 5 señales que no requieren consulta — se derivan solo de los campos
// que ya trae `request`. Separado de computeTrustSignals/computeTrustSignalsBatch
// para que ambas compartan exactamente la misma regla, sin duplicarla.
function computeOwnFieldSignals(request: RequestForSignals): TrustSignal[] {
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

  return signals;
}

// Sección 3: señales objetivas de confianza, basadas únicamente en datos
// reales ya disponibles en el sistema. Nunca inventamos un puntaje ni un
// "nivel de confianza" — cada señal es un hecho que existe o no existe, y
// si no hay suficiente información para afirmarla, simplemente se omite
// (nunca se muestra una señal negativa).
//
// Uso: detalle de una sola solicitud (una llamada, dos consultas — barato).
// Para listas, usar computeTrustSignalsBatch en vez de llamar esto por fila.
export async function computeTrustSignals(
  request: RequestForSignals,
): Promise<TrustSignal[]> {
  const signals = computeOwnFieldSignals(request);

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

// Misma lógica que computeTrustSignals, pero para una lista completa: en vez
// de 2 consultas POR solicitud (2×N round-trips), hace las mismas 2 consultas
// una sola vez para todos los buyerId del lote. El resultado por solicitud es
// idéntico al que produciría computeTrustSignals llamada una por una.
export async function computeTrustSignalsBatch(
  requests: RequestForSignals[],
): Promise<Map<string, TrustSignal[]>> {
  const result = new Map<string, TrustSignal[]>();
  if (requests.length === 0) return result;

  const buyerIds = [...new Set(requests.map((r) => r.buyerId))];

  const [respondedRows, buyerProfiles] = await Promise.all([
    // No existe un groupBy por campo de relación en Prisma, así que traemos
    // las filas RESPONDED de este lote de compradores y contamos en memoria
    // — sigue siendo 1 round-trip en vez de N.
    prisma.leadPurchase.findMany({
      where: { status: "RESPONDED", request: { buyerId: { in: buyerIds } } },
      select: { request: { select: { buyerId: true } } },
    }),
    prisma.buyerProfile.findMany({
      where: { id: { in: buyerIds } },
      select: { id: true, lastConfirmedSearchingAt: true },
    }),
  ]);

  const respondedCountByBuyer = new Map<string, number>();
  for (const row of respondedRows) {
    const buyerId = row.request.buyerId;
    respondedCountByBuyer.set(buyerId, (respondedCountByBuyer.get(buyerId) ?? 0) + 1);
  }
  const profileByBuyer = new Map(buyerProfiles.map((p) => [p.id, p]));

  for (const request of requests) {
    const signals = computeOwnFieldSignals(request);

    if ((respondedCountByBuyer.get(request.buyerId) ?? 0) > 0) {
      signals.push({
        key: "responded_before",
        label: "Ha respondido a agentes anteriormente",
      });
    }
    if (profileByBuyer.get(request.buyerId)?.lastConfirmedSearchingAt) {
      signals.push({
        key: "keep_searching_confirmed",
        label: "Ha confirmado que continúa buscando",
      });
    }

    result.set(request.id, signals);
  }

  return result;
}
