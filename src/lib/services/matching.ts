// Sistema de scoring simple (sección 14): NO es IA, es un cálculo de
// coincidencia. Como el agente no guarda un "presupuesto" ni "habitaciones
// preferidas" en su perfil (no lo pedimos para no sobrearquitecturar el
// MVP — sección 24), esos tres criterios se otorgan siempre: no hay dato
// del agente que los contradiga. Lo que sí distingue a un agente de otro
// son sus zonas de trabajo y los tipos de propiedad que maneja.
export type MatchRequestInput = {
  ciudad: string;
  sector: string | null;
  propertyType: string;
  featureCount: number;
};

export type MatchAgentInput = {
  workAreas: string[];
  propertyTypes: string[];
};

const norm = (s: string) => s.trim().toLowerCase();

export function calculateMatchScore(
  request: MatchRequestInput,
  agent: MatchAgentInput | null,
): number {
  let score = 0;

  const workAreas = agent?.workAreas ?? [];
  const propertyTypes = agent?.propertyTypes ?? [];

  // Ubicación exacta: +30 (agentes sin zonas configuradas todavía no se
  // penalizan — se asume que están abiertos a cualquier zona).
  const locationMatch =
    workAreas.length === 0 ||
    workAreas.some(
      (area) =>
        norm(area) === norm(request.ciudad) ||
        (request.sector != null && norm(area) === norm(request.sector)),
    );
  if (locationMatch) score += 30;

  // Tipo de propiedad: +20
  const typeMatch =
    propertyTypes.length === 0 ||
    propertyTypes.some((t) => t === request.propertyType);
  if (typeMatch) score += 20;

  // Presupuesto compatible, habitaciones, metros cuadrados: +20 / +10 / +10.
  // Sin preferencia del agente que los contradiga, se cuentan compatibles.
  score += 20;
  score += 10;
  score += 10;

  // Características adicionales: +10 si la solicitud viene con al menos
  // dos características extra completadas (lead más rico / específico).
  if (request.featureCount >= 2) score += 10;

  return Math.min(100, score);
}

export function matchLabel(score: number): string {
  if (score >= 90) return "Muy alta compatibilidad";
  if (score >= 75) return "Alta compatibilidad";
  if (score >= 50) return "Compatibilidad media";
  return "Baja compatibilidad";
}
