import type { HTMLAttributes, TableHTMLAttributes } from "react";

// Shell compartido de las tablas reales del proyecto (créditos del agente,
// pagos, leads vendidos, compras de créditos, métricas) — mismo criterio
// que Modal.tsx: solo el envoltorio con scroll horizontal y la tipografía
// del encabezado, que eran idénticos en las 6 instancias encontradas. El
// contenido de <tbody>/<tr>/<td> (padding, bordes, columnas, colores
// condicionales) sigue en cada página porque ahí sí hay particularidades
// reales (ver metricas/page.tsx, con padding y bordes distintos).
export function Table({
  className = "",
  ...props
}: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto">
      <table className={`w-full text-sm ${className}`} {...props} />
    </div>
  );
}

export function TableHead(props: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className="text-left text-xs uppercase tracking-wide text-muted-2"
      {...props}
    />
  );
}
