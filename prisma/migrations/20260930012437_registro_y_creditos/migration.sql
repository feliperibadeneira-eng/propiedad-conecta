-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LeadPurchaseStatus" ADD VALUE 'RESPONDED';
ALTER TYPE "LeadPurchaseStatus" ADD VALUE 'REFUND_REQUESTED';
ALTER TYPE "LeadPurchaseStatus" ADD VALUE 'CLOSED';

-- AlterTable
ALTER TABLE "AgentProfile" ADD COLUMN     "creditsBalance" INTEGER NOT NULL DEFAULT 20;

-- AlterTable
ALTER TABLE "BuyerProfile" ADD COLUMN     "contactConsent" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "LeadPurchase" ADD COLUMN     "contactedAt" TIMESTAMP(3),
ADD COLUMN     "creditsUsed" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "refundRequestedAt" TIMESTAMP(3),
ADD COLUMN     "refundedAt" TIMESTAMP(3);
