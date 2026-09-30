import Link from "next/link";
import { MapPin, Bed, Ruler, Car, Clock, Check } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatUSD, formatRelativeTime } from "@/lib/format";
import { PROPERTY_TYPE_LABELS } from "@/lib/enums";
import { matchLabel } from "@/lib/services/matching";
import type { PropertyType } from "@/generated/prisma/enums";
import type { TrustSignal } from "@/lib/services/trustSignals";

export function LeadCard({
  id,
  propertyType,
  ciudad,
  sector,
  priceMin,
  priceMax,
  bedrooms,
  minSquareMeters,
  parkingSpots,
  createdAt,
  matchScore,
  unlockCost,
  trustSignals,
  personalBlurb,
}: {
  id: string;
  propertyType: PropertyType;
  ciudad: string;
  sector: string | null;
  priceMin: number | string | { toString(): string };
  priceMax: number | string | { toString(): string };
  bedrooms: number | null;
  minSquareMeters: number | null;
  parkingSpots: number | null;
  createdAt: Date;
  matchScore: number;
  unlockCost: number;
  trustSignals: TrustSignal[];
  personalBlurb: string | null;
}) {
  return (
    <Link href={`/dashboard/agent/leads/${id}`}>
      <Card interactive className="p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="font-semibold">
            {PROPERTY_TYPE_LABELS[propertyType]} en {ciudad}
          </p>
          <Badge tone="accent">{matchScore}% · {matchLabel(matchScore)}</Badge>
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
          {parkingSpots != null && (
            <span className="flex items-center gap-1.5">
              <Car size={14} /> {parkingSpots} parqueaderos
            </span>
          )}
        </div>
        <p className="mt-2 font-medium">
          {formatUSD(priceMin)} – {formatUSD(priceMax)}
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-2">
          <Clock size={12} /> Publicado {formatRelativeTime(createdAt)}
        </p>

        {personalBlurb && (
          <p className="mt-3 line-clamp-2 text-sm italic text-muted">
            &ldquo;{personalBlurb}&rdquo;
          </p>
        )}

        {trustSignals.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
            {trustSignals.slice(0, 3).map((s) => (
              <span key={s.key} className="flex items-center gap-1 text-xs text-accent-2">
                <Check size={12} /> {s.label}
              </span>
            ))}
            {trustSignals.length > 3 && (
              <span className="text-xs text-muted-2">
                +{trustSignals.length - 3} más
              </span>
            )}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between rounded-xl bg-surface-hover px-3 py-2.5">
          <span className="text-sm text-muted">Desbloquear contacto</span>
          <span className="font-semibold">
            {unlockCost} crédito{unlockCost !== 1 ? "s" : ""}
          </span>
        </div>
      </Card>
    </Link>
  );
}
