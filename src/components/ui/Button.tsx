import type { ButtonHTMLAttributes } from "react";

type Variant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "accent2"
  | "inverse";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-none font-medium transition disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap";

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-foreground hover:bg-accent-hover shadow-sm shadow-accent/20",
  accent2: "bg-accent-2 text-white hover:bg-accent-2-hover",
  secondary:
    "bg-surface text-foreground border border-border hover:border-border-hover hover:bg-surface-hover",
  ghost: "text-muted hover:text-foreground hover:bg-surface-hover",
  danger: "bg-danger text-white hover:opacity-90",
  // Para botones sobre fondos oscuros (--accent) — el hero y bandas CTA de
  // la home. Nunca usado sobre fondos claros: ahí "secondary"/"ghost" ya
  // tienen suficiente contraste.
  inverse:
    "bg-transparent text-accent-foreground border border-white/30 hover:border-white/70 hover:bg-white/10",
};

const sizes: Record<Size, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-5 py-2.5 text-sm",
  lg: "px-6 py-3.5 text-base",
};

export function buttonClasses(
  variant: Variant = "primary",
  size: Size = "md",
  className = "",
): string {
  return `${base} ${variants[variant]} ${sizes[size]} ${className}`;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
}) {
  return (
    <button className={buttonClasses(variant, size, className)} {...props} />
  );
}
