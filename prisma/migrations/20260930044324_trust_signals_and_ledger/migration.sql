-- AlterEnum
ALTER TYPE "LeadPurchaseStatus" ADD VALUE 'APPOINTMENT_SCHEDULED';

-- AlterTable
ALTER TABLE "BuyerProfile" ADD COLUMN     "lastConfirmedSearchingAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PropertyRequest" ADD COLUMN     "additionalNotes" TEXT,
ADD COLUMN     "moveInDate" TIMESTAMP(3),
ADD COLUMN     "occupation" TEXT,
ADD COLUMN     "searchReason" TEXT;

-- CreateTable
CREATE TABLE "CreditLedgerEntry" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "leadPurchaseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreditLedgerEntry_agentId_idx" ON "CreditLedgerEntry"("agentId");

-- CreateIndex
CREATE INDEX "CreditLedgerEntry_leadPurchaseId_idx" ON "CreditLedgerEntry"("leadPurchaseId");

-- AddForeignKey
ALTER TABLE "CreditLedgerEntry" ADD CONSTRAINT "CreditLedgerEntry_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AgentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLedgerEntry" ADD CONSTRAINT "CreditLedgerEntry_leadPurchaseId_fkey" FOREIGN KEY ("leadPurchaseId") REFERENCES "LeadPurchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
