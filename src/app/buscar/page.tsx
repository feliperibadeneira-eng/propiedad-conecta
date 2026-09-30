import Link from "next/link";
import { UserPlus } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { PublicNav } from "@/components/PublicNav";
import { Card } from "@/components/ui/Card";
import { buttonClasses } from "@/components/ui/Button";
import { RequestForm } from "./RequestForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Publica tu solicitud — PropertyMatch" };

export default async function BuscarPage() {
  const user = await getCurrentUser();

  return (
    <>
      <PublicNav />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
        <h1 className="text-2xl font-bold tracking-tight">
          Cuéntanos qué propiedad estás buscando
        </h1>
        <p className="mt-2 text-sm text-muted">
          Es gratis publicar. Los agentes pagan por desbloquear tu contacto,
          y solo lo hacen si tienen algo que realmente coincide.
        </p>

        {user?.role === "BUYER" ? (
          <div className="mt-8">
            <RequestForm />
          </div>
        ) : (
          <Card className="mt-8 p-7 text-center">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <UserPlus size={20} />
            </div>
            <p className="mt-4 font-medium">
              Para solicitar información de una propiedad necesitas crear
              una cuenta.
            </p>
            <Link
              href="/registro"
              className={buttonClasses("primary", "md", "mt-5")}
            >
              Crear cuenta
            </Link>
          </Card>
        )}
      </main>
    </>
  );
}
