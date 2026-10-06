import Link from "next/link";
import { MapPin, Bed, Ruler, Clock } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatUSD, formatRelativeTime } from "@/lib/format";
import { OPERATION_TYPE_LABELS } from "@/lib/enums";
import { propertyMatchLabel } from "@/lib/services/propertyMatching";
import type { OperationType } from "@/generated/prisma/enums";

// Tarjeta de solicitud compatible con una Property del agente. A propósito
// NO muestra contacto, costo de desbloqueo ni trust signals — eso vive en
// /dashboard/agent/leads/[id] (el flujo existente, al que esta tarjeta
// enlaza), no acá. El matching solo descubre la oportunidad.
export function PropertyMatchCard({
  id,
  propertyId,
  operationType,
  ciudad,
  sector,
  priceMin,
  priceMax,
  bedrooms,
  minSquareMeters,
  createdAt,
  matchScore,
}: {
  id: string;
  // Propiedad desde la que se calculó este match — se adjunta al link para
  // que, si el agente desbloquea desde acá, quede registrada como origen
  // (ver PR #14 / LeadPurchase.propertyId). Solo una pista de UX: la
  // validación real ocurre en purchaseWithCredits().
  propertyId: string;
  operationType: OperationType;
  ciudad: string;
  sector: string | null;
  priceMin: number | string | { toString(): string };
  priceMax: number | string | { toString(): string };
  bedrooms: number | null;
  minSquareMeters: number | null;
  createdAt: Date;
  matchScore: number;
}) {
  return (
    <Link href={`/dashboard/agent/leads/${id}?propertyId=${propertyId}`}>
      <Card interactive className="p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="font-semibold">
            {OPERATION_TYPE_LABELS[operationType]} en {ciudad}
          </p>
          {/* "pts", nunca "%": el score es un ranking de compatibilidad,
              no una probabilidad — un "%" sugeriría certeza estadística. */}
          <Badge tone="accent">
            {matchScore} pts · {propertyMatchLabel(matchScore)}
          </Badge>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
          {sector && (
            <span className="flex items-center gap-1.5">
              <MapPin size={14} /> {sector}
            </span>
          )}
          {bedrooms != null && (
            <span className="flex items-center gap-1.5">
              <Bed size={14} /> {bedrooms} habitaciones
            </span>
          )}
          {minSquareMeters != null && (
            <span className="flex items-center gap-1.5">
              <Ruler size={14} /> {minSquareMeters} m²+
            </span>
          )}
        </div>
        <p className="mt-2 font-medium">
          {formatUSD(priceMin)} – {formatUSD(priceMax)}
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-2">
          <Clock size={12} /> Publicado {formatRelativeTime(createdAt)}
        </p>
      </Card>
    </Link>
  );
}
