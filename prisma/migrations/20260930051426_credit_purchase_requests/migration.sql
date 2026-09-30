-- CreateEnum
CREATE TYPE "CreditPackageType" AS ENUM ('STARTER', 'PRO', 'PREMIUM');

-- CreateEnum
CREATE TYPE "CreditPurchaseStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "CreditLedgerEntry" ADD COLUMN     "creditPurchaseRequestId" TEXT,
ADD COLUMN     "description" TEXT;

-- CreateTable
CREATE TABLE "CreditPurchaseRequest" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "package" "CreditPackageType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "credits" INTEGER NOT NULL,
    "status" "CreditPurchaseStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "rejectionReason" TEXT,

    CONSTRAINT "CreditPurchaseRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreditPurchaseRequest_agentId_idx" ON "CreditPurchaseRequest"("agentId");

-- CreateIndex
CREATE INDEX "CreditPurchaseRequest_status_idx" ON "CreditPurchaseRequest"("status");

-- CreateIndex
CREATE INDEX "CreditLedgerEntry_creditPurchaseRequestId_idx" ON "CreditLedgerEntry"("creditPurchaseRequestId");

-- AddForeignKey
ALTER TABLE "CreditLedgerEntry" ADD CONSTRAINT "CreditLedgerEntry_creditPurchaseRequestId_fkey" FOREIGN KEY ("creditPurchaseRequestId") REFERENCES "CreditPurchaseRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditPurchaseRequest" ADD CONSTRAINT "CreditPurchaseRequest_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AgentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditPurchaseRequest" ADD CONSTRAINT "CreditPurchaseRequest_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
