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
} from "lucide-react";
import { PublicNav } from "@/components/PublicNav";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { BRAND_NAME } from "@/lib/brand";

export default function HomePage() {
  return (
    <>
      <PublicNav />
      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto w-full max-w-6xl px-4 pt-16 pb-20 text-center">
          <Badge tone="accent" className="mb-5">
            PropTech para Ecuador
          </Badge>
          <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
            Encuentra la propiedad que realmente estás buscando.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-muted">
            Cuéntanos exactamente qué necesitas y conecta con agentes
            inmobiliarios que pueden ayudarte a encontrarla.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/buscar" className={buttonClasses("primary", "lg")}>
              Estoy buscando una propiedad
            </Link>
            <Link
              href="/agente/registro"
              className={buttonClasses("secondary", "lg")}
            >
              Soy agente inmobiliario
            </Link>
          </div>
        </section>

        {/* Cómo funciona */}
        <section className="border-t border-border bg-background-alt py-20">
          <div className="mx-auto w-full max-w-6xl px-4">
            <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
              Cómo funciona
            </h2>
            <div className="mt-10 grid gap-6 sm:grid-cols-3">
              <Card className="p-6">
                <ClipboardList className="text-accent" size={26} />
                <h3 className="mt-4 font-semibold">1. Dinos qué buscas</h3>
                <p className="mt-2 text-sm text-muted">
                  Describe ubicación, presupuesto, habitaciones, tamaño y
                  características.
                </p>
              </Card>
              <Card className="p-6">
                <Search className="text-accent" size={26} />
                <h3 className="mt-4 font-semibold">
                  2. Los agentes encuentran tu solicitud
                </h3>
                <p className="mt-2 text-sm text-muted">
                  Los profesionales inmobiliarios pueden ver solicitudes
                  compatibles con lo que ofrecen.
                </p>
              </Card>
              <Card className="p-6">
                <Handshake className="text-accent" size={26} />
                <h3 className="mt-4 font-semibold">
                  3. Conecta con el agente adecuado
                </h3>
                <p className="mt-2 text-sm text-muted">
                  Cuando un agente desbloquea tu solicitud, ambos reciben sus
                  datos de contacto.
                </p>
              </Card>
            </div>
          </div>
        </section>

        {/* Ejemplo de solicitud */}
        <section className="py-20">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 lg:grid-cols-2">
            <div>
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Así ven los agentes tu solicitud
              </h2>
              <p className="mt-3 text-muted">
                Tu nombre, teléfono y email permanecen ocultos hasta que un
                agente pague por desbloquear el contacto. Nunca se muestran
                antes.
              </p>
            </div>
            <Card className="mx-auto w-full max-w-sm p-5">
              <div className="flex items-center justify-between">
                <p className="font-semibold">Departamento en Quito</p>
                <Badge tone="accent">94% compatible</Badge>
              </div>
              <div className="mt-3 space-y-1.5 text-sm text-muted">
                <p className="flex items-center gap-2">
                  <MapPin size={15} /> Cumbayá
                </p>
                <p className="flex items-center gap-2 font-medium text-foreground">
                  $150.000 – $190.000
                </p>
                <p className="flex items-center gap-2">
                  <Bed size={15} /> 3 habitaciones
                </p>
                <p className="flex items-center gap-2">
                  <Ruler size={15} /> 120 m²+
                </p>
                <p className="flex items-center gap-2">
                  <Car size={15} /> 2 parqueaderos
                </p>
                <p className="flex items-center gap-2 text-xs text-muted-2">
                  <Clock size={13} /> Publicado hace 2 horas
                </p>
              </div>
              <div className="mt-4 flex items-center justify-between rounded-xl bg-surface-hover px-3 py-2.5">
                <span className="text-sm text-muted">Desbloquear contacto</span>
                <span className="font-semibold">$15</span>
              </div>
            </Card>
          </div>
        </section>

        {/* Para agentes */}
        <section className="border-t border-border bg-foreground py-20 text-white">
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
              <ShieldCheck className="shrink-0 text-accent" size={28} />
              <div>
                <h3 className="font-semibold">Privacidad primero</h3>
                <p className="mt-1 text-sm text-muted">
                  Ningún dato de contacto se filtra antes de una compra
                  confirmada por nuestro servidor.
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <Lock className="shrink-0 text-accent" size={28} />
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
            <Link href="/demo" className="hover:text-foreground">
              Ver demo
            </Link>
            <Link href="/login" className="hover:text-foreground">
              Ingresar
            </Link>
          </div>
        </div>
      </footer>
    </>
  );
}
