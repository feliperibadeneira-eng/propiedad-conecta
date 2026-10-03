import Link from "next/link";
import Image from "next/image";
import { getCurrentUser } from "@/lib/auth";
import { buttonClasses } from "@/components/ui/Button";

export async function PublicNav() {
  const user = await getCurrentUser();
  const dashboardHref = user
    ? user.role === "AGENT"
      ? "/dashboard/agent/leads"
      : user.role === "ADMIN"
        ? "/admin"
        : "/dashboard/buyer"
    : null;

  return (
    <header className="border-b border-border bg-background-alt/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4">
        {/* Logueado: el logo lleva a su panel (mismo destino que "Mi
            cuenta"), no a la home pública. Sin sesión, mantiene "/". */}
        <Link href={dashboardHref ?? "/"} className="flex items-center">
          <Image
            src="/logo.png"
            alt="Propiedad Conecta"
            width={1079}
            height={299}
            priority
            className="h-8 w-auto sm:h-10"
          />
        </Link>
        <nav className="flex items-center gap-2">
          <Link href="/dashboard/agent/leads" className="hidden text-sm text-muted hover:text-foreground sm:block">
            Para agentes
          </Link>
          {dashboardHref ? (
            <Link href={dashboardHref} className={buttonClasses("secondary", "sm")}>
              Mi cuenta
            </Link>
          ) : (
            <>
              <Link href="/login" className={buttonClasses("ghost", "sm")}>
                Ingresar
              </Link>
              <Link href="/buscar" className={buttonClasses("primary", "sm")}>
                Publicar lo que busco
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
