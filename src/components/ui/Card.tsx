import type { HTMLAttributes } from "react";

export function Card({
  className = "",
  interactive = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={`rounded-2xl border border-border bg-surface shadow-sm ${
        interactive
          ? "transition hover:border-border-hover hover:shadow-md"
          : ""
      } ${className}`}
      {...props}
    />
  );
}
