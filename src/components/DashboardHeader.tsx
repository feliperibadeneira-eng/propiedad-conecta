"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Coins, LogOut } from "lucide-react";
import { logoutAction } from "@/app/login/actions";

export function DashboardHeader({
  links,
  userName,
  creditsBalance,
}: {
  links: { href: string; label: string }[];
  userName: string;
  // Solo se pasa en las páginas del agente (sección 5): créditos disponibles.
  creditsBalance?: number;
}) {
  const pathname = usePathname();
  // El link activo es el de href más largo entre los que calzan con la ruta
  // actual (exacto o como prefijo de segmento) — así "/dashboard/agent/leads"
  // no se marca activo también en "/dashboard/agent/leads/purchased".
  const matches = links.filter(
    (l) => pathname === l.href || pathname.startsWith(`${l.href}/`),
  );
  const activeHref =
    matches.length > 0
      ? matches.reduce((a, b) => (b.href.length > a.href.length ? b : a)).href
      : null;

  return (
    <header className="border-b border-border bg-background-alt">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-6">
          {/* El primer link de cada sección (Resumen/Marketplace/Mis
              solicitudes) es su página principal — el logo lleva ahí en
              vez de a la home pública, para no sacar a un usuario logueado
              de su panel. */}
          <Link href={links[0]?.href ?? "/"} className="flex shrink-0 items-center">
            <Image
              src="/logo.png"
              alt="Propiedad Conecta"
              width={1079}
              height={299}
              className="h-7 w-auto"
            />
          </Link>
          <nav className="flex min-w-0 gap-4 overflow-x-auto text-sm">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                aria-current={l.href === activeHref ? "page" : undefined}
                className={`shrink-0 whitespace-nowrap border-b-2 py-0.5 transition ${
                  l.href === activeHref
                    ? "border-accent font-semibold text-foreground"
                    : "border-transparent text-muted hover:text-foreground"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-sm text-muted">
          {creditsBalance != null && (
            <Link
              href="/dashboard/agent/creditos"
              className="flex items-center gap-1.5 bg-accent/10 px-2.5 py-1 text-accent transition hover:bg-accent/20"
            >
              <Coins size={14} /> {creditsBalance} créditos
            </Link>
          )}
          <span>{userName}</span>
          <form action={logoutAction}>
            <button type="submit" className="flex items-center gap-1.5 hover:text-foreground">
              <LogOut size={14} /> Salir
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
