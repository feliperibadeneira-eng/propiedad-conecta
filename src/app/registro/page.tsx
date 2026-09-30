import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { PublicNav } from "@/components/PublicNav";
import { Card } from "@/components/ui/Card";
import { RegisterForm } from "./RegisterForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Crear cuenta — PropertyMatch" };

export default async function BuyerRegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.role === "BUYER" ? "/buscar" : "/");

  return (
    <>
      <PublicNav />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
        <Card className="p-7">
          <h1 className="text-2xl font-bold tracking-tight">Crea tu cuenta</h1>
          <p className="mt-1 text-sm text-muted">
            Necesitas una cuenta para solicitar información de una propiedad
            y que los agentes puedan contactarte.
          </p>
          <RegisterForm />
          <p className="mt-4 text-center text-sm text-muted">
            ¿Ya tienes cuenta?{" "}
            <Link href="/login" className="text-accent hover:underline">
              Ingresa
            </Link>
          </p>
        </Card>
      </main>
    </>
  );
}
