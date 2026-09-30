import type { ReactNode } from "react";

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-foreground">
        {label}
      </span>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-muted-2">{hint}</p>}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </label>
  );
}

const inputBase =
  "w-full rounded-xl border border-border bg-background-alt px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-2 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20";

export { inputBase };
