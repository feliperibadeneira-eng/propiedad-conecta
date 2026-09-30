import { requireAgent } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getAgentStats } from "@/lib/services/agentProfile";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Card } from "@/components/ui/Card";
import { AGENT_NAV_LINKS } from "../nav";
import { ProfileForm } from "./ProfileForm";

export const dynamic = "force-dynamic";

export default async function AgentProfilePage() {
  const user = await requireAgent();
  const profile = await prisma.agentProfile.findUniqueOrThrow({
    where: { id: user.agentProfileId! },
    include: { user: true },
  });
  const stats = await getAgentStats(user.agentProfileId!);

  return (
    <>
      <DashboardHeader
        userName={user.name}
        links={AGENT_NAV_LINKS}
        creditsBalance={profile.creditsBalance}
      />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-bold tracking-tight">Mi perfil</h1>

        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          <Stat label="Leads comprados" value={stats.totalPurchased} />
          <Stat label="Contactados" value={stats.totalContacted} />
          <Stat label="% de contacto" value={`${Math.round(stats.contactRate * 100)}%`} />
          <Stat label="Liberados" value={stats.totalReleased} />
        </div>

        <div className="mt-6">
          <ProfileForm
            defaults={{
              name: profile.user.name,
              phone: profile.user.phone ?? "",
              whatsapp: profile.whatsapp ?? "",
              company: profile.company ?? "",
              city: profile.city ?? "",
              yearsExperience: profile.yearsExperience,
              workAreas: profile.workAreas,
              propertyTypes: profile.propertyTypes,
              description: profile.description ?? "",
            }}
          />
        </div>
      </main>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-4 text-center">
      <p className="text-2xl font-bold">{value}</p>
      <p className="mt-1 text-xs text-muted">{label}</p>
    </Card>
  );
}
