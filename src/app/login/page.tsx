import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { PublicNav } from "@/components/PublicNav";
import { Card } from "@/components/ui/Card";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) {
    redirect(
      user.role === "AGENT"
        ? "/dashboard/agent/leads"
        : user.role === "ADMIN"
          ? "/admin"
          : "/dashboard/buyer",
    );
  }

  return (
    <>
      <PublicNav />
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10">
        <Card className="p-7">
          <h1 className="text-2xl font-bold tracking-tight">Ingresar</h1>
          <p className="mt-1 text-sm text-muted">
            Compradores, agentes inmobiliarios y administradores.
          </p>
          <LoginForm />
        </Card>
      </main>
    </>
  );
}
