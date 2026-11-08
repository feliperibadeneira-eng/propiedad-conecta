"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Coins, LogOut, MessageCircle } from "lucide-react";
import { logoutAction } from "@/app/login/actions";
import { getUnreadConversationCountAction } from "@/app/dashboard/actions";
import { useConversationPolling } from "@/hooks/useConversationPolling";

export function DashboardHeader({
  links,
  userName,
  creditsBalance,
  initialUnreadCount,
}: {
  links: { href: string; label: string }[];
  userName: string;
  // Solo se pasa en las páginas del agente (sección 5): créditos disponibles.
  creditsBalance?: number;
  // Fase 1.1: lo pasan únicamente las 2 páginas que ya calculan los no
  // leídos por conversación en el mismo render (agent/leads/purchased y
  // buyer/solicitudes/[id]) — la suma de ese mapa es exactamente el mismo
  // número que traería getUnreadConversationCountAction, así que evita
  // repetir esa consulta apenas monta. El resto de las páginas del
  // dashboard no lo pasan y el header sigue funcionando exactamente igual
  // que antes (arranca en null, primer tick inmediato). No es un store
  // global: es una prop opcional, igual que creditsBalance.
  initialUnreadCount?: number;
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

  // Badge global de no leídos (fase 1 de tiempo real). Intervalo mucho más
  // espaciado que el del panel de chat abierto (4.5s): esto corre en TODA
  // página del dashboard, no solo dentro de una conversación, así que debe
  // ser liviano — "automático" sin ser polling pesado. Reutiliza el mismo
  // hook de intervalo+visibilidad que el chat para no duplicar esa lógica.
  const [unreadCount, setUnreadCount] = useState<number | null>(initialUnreadCount ?? null);
  useConversationPolling({
    enabled: true,
    intervalMs: 30_000,
    skipInitialTick: initialUnreadCount !== undefined,
    poll: async () => {
      setUnreadCount(await getUnreadConversationCountAction());
    },
  });

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
          {!!unreadCount && (
            <span
              className="flex items-center gap-1.5 bg-accent/10 px-2.5 py-1 text-accent"
              aria-label={`${unreadCount} mensaje${unreadCount === 1 ? "" : "s"} sin leer`}
            >
              <MessageCircle size={14} /> {unreadCount}
            </span>
          )}
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
