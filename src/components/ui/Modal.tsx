type Size = "sm" | "md";

const base = "w-full rounded-none border border-border p-0 backdrop:bg-black/40";

const sizes: Record<Size, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
};

// Clase compartida para el elemento <dialog> nativo. Cada modal sigue
// manejando su propio ref/showModal()/close() y su propio contenido (varían
// demasiado — formularios con useActionState, subida de archivos, un modo
// de éxito condicional — como para forzarlos a un componente común); esto
// solo centraliza el "shell" visual que sí era idéntico en los 6 archivos.
export function dialogClasses(size: Size = "sm"): string {
  return `${base} ${sizes[size]}`;
}
