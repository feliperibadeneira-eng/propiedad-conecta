import { notFound } from "next/navigation";
import { requireAgent } from "@/lib/auth";
import { getAgentPropertyDetail } from "@/lib/services/properties";
import { getCreditsBalance } from "@/lib/services/agentProfile";
import { DashboardHeader } from "@/components/DashboardHeader";
import { AGENT_NAV_LINKS } from "../../../nav";
import { PropertyForm } from "../../PropertyForm";

export const dynamic = "force-dynamic";

export default async function EditAgentPropertyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireAgent();
  const [property, creditsBalance] = await Promise.all([
    getAgentPropertyDetail(user.agentProfileId!, id),
    getCreditsBalance(user.agentProfileId!),
  ]);
  if (!property) notFound();

  return (
    <>
      <DashboardHeader userName={user.name} links={AGENT_NAV_LINKS} creditsBalance={creditsBalance} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-bold tracking-tight">Editar propiedad</h1>
        <div className="mt-6">
          <PropertyForm
            mode="edit"
            propertyId={property.id}
            defaults={{
              operationType: property.operationType,
              propertyType: property.propertyType,
              title: property.title,
              description: property.description ?? "",
              price: Number(property.price),
              provincia: property.provincia,
              ciudad: property.ciudad,
              sector: property.sector ?? "",
              squareMeters: property.squareMeters,
              bedrooms: property.bedrooms,
              bathrooms: property.bathrooms,
            }}
          />
        </div>
      </main>
    </>
  );
}
