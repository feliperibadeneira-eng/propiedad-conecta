import { requireAgent } from "@/lib/auth";
import { getCreditsBalance } from "@/lib/services/agentProfile";
import { listCreditLedger, getUnlockCost } from "@/lib/services/credits";
import { listCreditPurchasesForAgent } from "@/lib/services/creditPurchases";
import { CREDIT_PACKAGES } from "@/lib/services/creditPackages";
import { getPaymentInstructions, getPayphoneLinks, getDeunaQrImage } from "@/lib/settings";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatDate, formatUSD } from "@/lib/format";
import { CREDIT_PURCHASE_STATUS_LABELS } from "@/lib/enums";
import { AGENT_NAV_LINKS } from "../nav";
import { BuyCreditsDialog } from "./BuyCreditsDialog";
import type { CreditPackageType } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

const PACKAGE_ORDER: CreditPackageType[] = ["STARTER", "PRO", "PREMIUM"];

export default async function AgentCreditsPage() {
  const user = await requireAgent();
  const [creditsBalance, ledger, purchases, paymentInstructions, payphoneLinks, deunaQrImage] =
    await Promise.all([
      getCreditsBalance(user.agentProfileId!),
      listCreditLedger(user.agentProfileId!, 30),
      listCreditPurchasesForAgent(user.agentProfileId!),
      getPaymentInstructions(),
      getPayphoneLinks(),
      getDeunaQrImage(),
    ]);

  const payphoneLinkByPackage: Record<CreditPackageType, string> = {
    STARTER: payphoneLinks.credits10,
    PRO: payphoneLinks.credits50,
    PREMIUM: payphoneLinks.credits100,
  };

  return (
    <>
      <DashboardHeader
        userName={user.name}
        links={AGENT_NAV_LINKS}
        creditsBalance={creditsBalance}
      />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-bold tracking-tight">Mis créditos</h1>
        <Card className="mt-4 p-6">
          <p className="text-3xl font-bold text-accent">
            {creditsBalance} créditos disponibles
          </p>
        </Card>

        <div className="mt-10">
          <h2 className="text-xl font-bold tracking-tight">
            Desbloquea más oportunidades
          </h2>
          <p className="mt-1 text-sm text-muted">
            Compra créditos y utilízalos para desbloquear los datos de
            contacto de personas que están buscando una propiedad.
          </p>
          <p className="mt-2 text-sm text-muted">
            <strong>Comprar</strong> → {getUnlockCost("COMPRAR")} créditos ·{" "}
            <strong>Alquilar</strong> → {getUnlockCost("ALQUILAR")} créditos
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {PACKAGE_ORDER.map((key) => {
              const pkg = CREDIT_PACKAGES[key];
              return (
                <Card
                  key={key}
                  className={`relative p-6 text-center ${pkg.popular ? "border-accent" : ""}`}
                >
                  {pkg.popular && (
                    <Badge tone="accent" className="absolute -top-3 left-1/2 -translate-x-1/2">
                      ⭐ Más popular
                    </Badge>
                  )}
                  <h3 className="font-semibold">{pkg.name}</h3>
                  <p className="mt-2 text-3xl font-bold">${pkg.price}</p>
                  <p className="mt-1 text-sm text-muted">{pkg.credits} créditos</p>
                  <div className="mt-5">
                    <BuyCreditsDialog
                      packageKey={key}
                      name={pkg.name}
                      price={pkg.price}
                      credits={pkg.credits}
                      paymentInstructions={paymentInstructions}
                      payphoneLink={payphoneLinkByPackage[key]}
                    />
                  </div>
                </Card>
              );
            })}
          </div>
          <p className="mt-4 text-center text-xs text-muted-2">
            Los créditos no expiran, no son transferibles entre agentes y no
            pueden retirarse como dinero.
          </p>

          {deunaQrImage && (
            <Card className="mt-5 p-6 text-center">
              <h3 className="font-semibold">También podés pagar con Deuna</h3>
              {/* eslint-disable-next-line @next/next/no-img-element -- data URI, no un asset estático */}
              <img
                src={deunaQrImage}
                alt="QR de Deuna para pagar créditos"
                className="mx-auto mt-3 h-48 w-48 rounded-xl border border-border object-contain"
              />
              {paymentInstructions && (
                <p className="mt-3 whitespace-pre-line text-sm text-muted">
                  {paymentInstructions}
                </p>
              )}
            </Card>
          )}
        </div>

        <div className="mt-10">
          <h2 className="text-xl font-bold tracking-tight">Mis compras</h2>
          {purchases.length === 0 ? (
            <Card className="mt-3 p-6 text-center text-sm text-muted">
              Todavía no compraste créditos.
            </Card>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-2">
                  <tr>
                    <th className="pb-2">Paquete</th>
                    <th className="pb-2">Precio</th>
                    <th className="pb-2">Créditos</th>
                    <th className="pb-2">Fecha</th>
                    <th className="pb-2">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map((p) => (
                    <tr key={p.id} className="border-t border-border">
                      <td className="py-2.5">{CREDIT_PACKAGES[p.package].name}</td>
                      <td className="py-2.5">{formatUSD(p.amount)}</td>
                      <td className="py-2.5">{p.credits}</td>
                      <td className="py-2.5">{formatDate(p.createdAt)}</td>
                      <td className="py-2.5">{CREDIT_PURCHASE_STATUS_LABELS[p.status]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mt-10">
          <h2 className="text-xl font-bold tracking-tight">Historial de créditos</h2>
          {ledger.length === 0 ? (
            <Card className="mt-3 p-6 text-center text-sm text-muted">
              Todavía no hay movimientos.
            </Card>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-2">
                  <tr>
                    <th className="pb-2">Fecha</th>
                    <th className="pb-2">Descripción</th>
                    <th className="pb-2">Créditos</th>
                    <th className="pb-2">Saldo resultante</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((e) => (
                    <tr key={e.id} className="border-t border-border">
                      <td className="py-2.5">{formatDate(e.createdAt)}</td>
                      <td className="py-2.5">{e.description ?? e.reason}</td>
                      <td className={`py-2.5 font-medium ${e.amount >= 0 ? "text-success" : "text-danger"}`}>
                        {e.amount >= 0 ? "+" : ""}
                        {e.amount}
                      </td>
                      <td className="py-2.5">{e.balanceAfter}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
