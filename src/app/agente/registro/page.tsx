import { PublicNav } from "@/components/PublicNav";
import { Card } from "@/components/ui/Card";
import { RegisterForm } from "./RegisterForm";

export const metadata = { title: "Registro de agentes — PropertyMatch" };

export default function AgentRegisterPage() {
  return (
    <>
      <PublicNav />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
        <Card className="p-7">
          <h1 className="text-2xl font-bold tracking-tight">
            Regístrate como agente
          </h1>
          <p className="mt-1 text-sm text-muted">
            Accede al marketplace de solicitudes de compradores y
            arrendatarios reales.
          </p>
          <RegisterForm />
        </Card>
      </main>
    </>
  );
}
