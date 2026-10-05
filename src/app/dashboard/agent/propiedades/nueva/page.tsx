import { requireAgent } from "@/lib/auth";
import { getCreditsBalance } from "@/lib/services/agentProfile";
import { DashboardHeader } from "@/components/DashboardHeader";
import { AGENT_NAV_LINKS } from "../../nav";
import { PropertyForm } from "../PropertyForm";

export const dynamic = "force-dynamic";

export default async function NewAgentPropertyPage() {
  const user = await requireAgent();
  const creditsBalance = await getCreditsBalance(user.agentProfileId!);

  return (
    <>
      <DashboardHeader userName={user.name} links={AGENT_NAV_LINKS} creditsBalance={creditsBalance} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-bold tracking-tight">Nueva propiedad</h1>
        <p className="mt-1 text-sm text-muted">
          Publica una propiedad en tu catálogo privado.
        </p>
        <div className="mt-6">
          <PropertyForm mode="create" />
        </div>
      </main>
    </>
  );
}
