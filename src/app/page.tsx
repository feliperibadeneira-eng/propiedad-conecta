import Link from "next/link";
import {
  ClipboardList,
  Search,
  Handshake,
  ShieldCheck,
  Lock,
  MapPin,
  Bed,
  Ruler,
  Car,
  Clock,
  Home,
  BadgeCheck,
} from "lucide-react";
import { PublicNav } from "@/components/PublicNav";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";

export default function HomePage() {
  return (
    <>
      <PublicNav />
      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden bg-accent text-accent-foreground">
          <div className="relative mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-20 lg:grid-cols-2 lg:py-24">
            <div>
              <span className="inline-flex items-center gap-2 text-xs font-bold tracking-wider text-accent-2 uppercase">
                <span className="h-1.5 w-1.5 bg-accent-2" />
                PropTech para Ecuador
              </span>
              <h1 className="mt-4 max-w-xl text-4xl leading-[1.05] font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
                {BRAND_TAGLINE}
              </h1>
              <p className="mt-5 max-w-md text-lg text-accent-foreground/75">
                {`Dinos qué propiedad estás buscando y conecta con agentes que pueden ayudarte a encontrarla.`}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/buscar" className={buttonClasses("accent2", "lg")}>
                  Publicar lo que busco
                </Link>
                <Link
                  href="/agente/registro"
                  className={buttonClasses("inverse", "lg")}
                >
                  Soy agente inmobiliario
                </Link>
              </div>
            </div>

            {/* Ilustración propia: anillos de "match" + ficha de contacto
                protegido, en vez de una foto de stock de una propiedad que
                no es real. */}
            <div
              className="relative hidden h-[420px] items-center justify-center lg:flex"
              aria-hidden
            >
              <div className="absolute h-[320px] w-[320px] rounded-full bg-accent-2/25 blur-2xl" />
              <div className="absolute h-[360px] w-[360px] rounded-full border border-dashed border-accent-2/15" />
              <div className="absolute h-[270px] w-[270px] rounded-full border border-accent-2/25" />
              <div className="absolute h-[180px] w-[180px] rounded-full border border-accent-2/40" />
              <div className="relative z-10 flex h-16 w-16 items-center justify-center bg-accent-2 shadow-2xl">
                <Home className="text-white" size={26} />
              </div>
              <div className="absolute top-10 right-0 flex items-center gap-2 bg-background px-3.5 py-2.5 text-sm font-bold text-foreground shadow-xl">
                <BadgeCheck size={15} className="text-accent-2" />
                94% compatible
                <span className="font-medium text-muted">match</span>
              </div>
              <div className="absolute bottom-10 left-0 flex items-center gap-2 bg-background px-3.5 py-2.5 text-sm font-bold text-foreground shadow-xl">
                <Lock size={15} />
                Contacto protegido
              </div>
            </div>
          </div>
        </section>

        {/* Cómo funciona */}
        <section className="border-t border-border bg-background-alt py-20">
          <div className="mx-auto w-full max-w-6xl px-4">
            <span className="text-xs font-bold tracking-wider text-accent-2 uppercase">
              El proceso
            </span>
            <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
              Cómo funciona
            </h2>
            <div className="mt-10 grid gap-10 sm:grid-cols-3 sm:gap-8">
              <div className="relative sm:border-r sm:border-border sm:pr-8">
                <span
                  className="font-display pointer-events-none absolute -top-3 right-0 text-7xl font-extrabold text-accent/[0.08] select-none"
                  aria-hidden
                >
                  01
                </span>
                <div className="flex h-11 w-11 items-center justify-center bg-accent text-accent-foreground">
                  <ClipboardList size={20} />
                </div>
                <h3 className="mt-5 font-semibold">1. Dinos qué buscas</h3>
                <p className="mt-2 max-w-[28ch] text-sm text-muted">
                  Describe ubicación, presupuesto, habitaciones, tamaño y
                  características.
                </p>
              </div>
              <div className="relative sm:border-r sm:border-border sm:pr-8">
                <span
                  className="font-display pointer-events-none absolute -top-3 right-0 text-7xl font-extrabold text-accent/[0.08] select-none"
                  aria-hidden
                >
                  02
                </span>
                <div className="flex h-11 w-11 items-center justify-center bg-accent text-accent-foreground">
                  <Search size={20} />
                </div>
                <h3 className="mt-5 font-semibold">
                  2. Los agentes encuentran tu solicitud
                </h3>
                <p className="mt-2 max-w-[28ch] text-sm text-muted">
                  Los profesionales inmobiliarios pueden ver solicitudes
                  compatibles con lo que ofrecen.
                </p>
              </div>
              <div className="relative">
                <span
                  className="font-display pointer-events-none absolute -top-3 right-0 text-7xl font-extrabold text-accent/[0.08] select-none"
                  aria-hidden
                >
                  03
                </span>
                <div className="flex h-11 w-11 items-center justify-center bg-accent text-accent-foreground">
                  <Handshake size={20} />
                </div>
                <h3 className="mt-5 font-semibold">
                  3. Conecta con el agente adecuado
                </h3>
                <p className="mt-2 max-w-[28ch] text-sm text-muted">
                  Cuando un agente desbloquea tu solicitud, ambos reciben sus
                  datos de contacto.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Ejemplo de solicitud */}
        <section className="py-20">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-14 px-4 lg:grid-cols-2">
            <div>
              <span className="text-xs font-bold tracking-wider text-accent-2 uppercase">
                Privacidad primero
              </span>
              <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
                Así ven los agentes tu solicitud
              </h2>
              <p className="mt-3 text-muted">
                Tu nombre, teléfono y email permanecen ocultos hasta que un
                agente pague por desbloquear el contacto. Nunca se muestran
                antes.
              </p>
            </div>
            <div className="flex justify-center">
              <Card className="w-full max-w-sm -rotate-2 p-6 shadow-xl">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">Departamento en Quito</p>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                      <MapPin size={14} /> Cumbayá
                    </p>
                  </div>
                  <Badge tone="accent">94% compatible</Badge>
                </div>
                <p className="font-display mt-4 text-2xl font-extrabold tracking-tight tabular-nums">
                  $150.000 – $190.000
                </p>
                <div className="mt-3 space-y-1.5 text-sm text-muted">
                  <p className="flex items-center gap-2">
                    <Bed size={15} /> 3 habitaciones
                  </p>
                  <p className="flex items-center gap-2">
                    <Ruler size={15} /> 120 m²+
                  </p>
                  <p className="flex items-center gap-2">
                    <Car size={15} /> 2 parqueaderos
                  </p>
                </div>
                <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-2">
                  <Clock size={13} /> Publicado hace 2 horas
                </p>
                <div className="mt-5 flex items-center justify-between bg-accent px-4 py-3">
                  <span className="flex items-center gap-2 text-sm text-accent-foreground/70">
                    <Lock size={14} />
                    Desbloquear contacto
                  </span>
                  <span className="font-semibold text-white">$15</span>
                </div>
              </Card>
            </div>
          </div>
        </section>

        {/* Para agentes */}
        <section className="border-t border-border bg-accent py-20 text-white">
          <div className="mx-auto w-full max-w-6xl px-4 text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              ¿Tienes propiedades para tus clientes?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-white/70">
              Encuentra personas que ya están buscando exactamente lo que tú
              puedes ofrecer.
            </p>
            <Link
              href="/agente/registro"
              className={buttonClasses("accent2", "lg", "mt-7")}
            >
              Ver solicitudes
            </Link>
          </div>
        </section>

        {/* Seguridad */}
        <section className="py-20">
          <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 sm:grid-cols-2">
            <div className="flex gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center bg-background-alt text-accent">
                <ShieldCheck size={22} />
              </div>
              <div>
                <h3 className="font-semibold">Privacidad primero</h3>
                <p className="mt-1 text-sm text-muted">
                  Ningún dato de contacto se filtra antes de una compra
                  confirmada por nuestro servidor.
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center bg-background-alt text-accent">
                <Lock size={22} />
              </div>
              <div>
                <h3 className="font-semibold">Pagos verificados</h3>
                <p className="mt-1 text-sm text-muted">
                  El contacto solo se revela cuando el pago fue confirmado
                  del lado del servidor, nunca porque el navegador lo diga.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 text-sm text-muted sm:flex-row">
          <p>
            © {new Date().getFullYear()} {BRAND_NAME}. Ecuador.
          </p>
          <div className="flex gap-4">
            <Link href="/login" className="hover:text-foreground">
              Ingresar
            </Link>
          </div>
        </div>
      </footer>
    </>
  );
}
