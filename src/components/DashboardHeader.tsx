import Link from "next/link";
import Image from "next/image";
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
  return (
    <header className="border-b border-border bg-background-alt">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-6">
          {/* El primer link de cada sección (Resumen/Marketplace/Mis
              solicitudes) es su página principal — el logo lleva ahí en
              vez de a la home pública, para no sacar a un usuario logueado
              de su panel. */}
          <Link href={links[0]?.href ?? "/"} className="flex items-center">
            <Image
              src="/logo.png"
              alt="Propiedad Conecta"
              width={1304}
              height={367}
              className="h-7 w-auto"
            />
          </Link>
          <nav className="flex gap-4 text-sm">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="text-muted hover:text-foreground">
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted">
          {creditsBalance != null && (
            <Link
              href="/dashboard/agent/creditos"
              className="flex items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-1 text-accent transition hover:bg-accent/20"
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
