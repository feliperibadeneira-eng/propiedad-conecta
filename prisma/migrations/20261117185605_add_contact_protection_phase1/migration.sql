-- CreateEnum
CREATE TYPE "ContactRevealPath" AS ENUM ('AGENT_INITIATED', 'BUYER_REQUEST_APPROVED');

-- CreateEnum
CREATE TYPE "ContactReleaseRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RefundRequestCategory" AS ENUM ('NO_RESPONSE', 'LEAD_QUALITY', 'PLATFORM_ERROR');

-- CreateEnum
CREATE TYPE "RefundRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- DropIndex
DROP INDEX "ContactRevealEvent_revealedByUserId_idx";

-- AlterTable
ALTER TABLE "ContactRevealEvent" ADD COLUMN     "authorizedByUserId" TEXT NOT NULL,
ADD COLUMN     "contactReleaseRequestId" TEXT,
ADD COLUMN     "initiatedByUserId" TEXT NOT NULL,
ADD COLUMN     "noticeVersion" TEXT NOT NULL,
ADD COLUMN     "path" "ContactRevealPath" NOT NULL;

-- AlterTable
ALTER TABLE "LeadPurchase" ADD COLUMN     "externalContactRevealedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ContactReleaseRequest" (
    "id" TEXT NOT NULL,
    "leadPurchaseId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "status" "ContactReleaseRequestStatus" NOT NULL DEFAULT 'PENDING',
    "noticeVersion" TEXT NOT NULL,
    "approvalNoticeVersion" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedByUserId" TEXT,

    CONSTRAINT "ContactReleaseRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefundRequest" (
    "id" TEXT NOT NULL,
    "leadPurchaseId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "category" "RefundRequestCategory" NOT NULL,
    "reason" TEXT NOT NULL,
    "evidence" TEXT,
    "status" "RefundRequestStatus" NOT NULL DEFAULT 'PENDING',
    "leadPurchaseStatusBefore" "LeadPurchaseStatus" NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedByUserId" TEXT,
    "decisionReason" TEXT,

    CONSTRAINT "RefundRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactReleaseRequest_leadPurchaseId_idx" ON "ContactReleaseRequest"("leadPurchaseId");

-- CreateIndex
CREATE INDEX "ContactReleaseRequest_status_idx" ON "ContactReleaseRequest"("status");

-- CreateIndex
CREATE INDEX "RefundRequest_leadPurchaseId_idx" ON "RefundRequest"("leadPurchaseId");

-- CreateIndex
CREATE INDEX "RefundRequest_status_idx" ON "RefundRequest"("status");

-- AddForeignKey
ALTER TABLE "ContactRevealEvent" ADD CONSTRAINT "ContactRevealEvent_contactReleaseRequestId_fkey" FOREIGN KEY ("contactReleaseRequestId") REFERENCES "ContactReleaseRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactRevealEvent" ADD CONSTRAINT "ContactRevealEvent_initiatedByUserId_fkey" FOREIGN KEY ("initiatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactRevealEvent" ADD CONSTRAINT "ContactRevealEvent_authorizedByUserId_fkey" FOREIGN KEY ("authorizedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactReleaseRequest" ADD CONSTRAINT "ContactReleaseRequest_leadPurchaseId_fkey" FOREIGN KEY ("leadPurchaseId") REFERENCES "LeadPurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactReleaseRequest" ADD CONSTRAINT "ContactReleaseRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactReleaseRequest" ADD CONSTRAINT "ContactReleaseRequest_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_leadPurchaseId_fkey" FOREIGN KEY ("leadPurchaseId") REFERENCES "LeadPurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Máximo una ContactReleaseRequest PENDING por LeadPurchase (garantizado
-- por Postgres, además del lock transaccional sobre LeadPurchase).
CREATE UNIQUE INDEX "ContactReleaseRequest_one_pending_per_lead"
  ON "ContactReleaseRequest" ("leadPurchaseId")
  WHERE status = 'PENDING';

-- Máximo una RefundRequest PENDING por LeadPurchase, mismo criterio.
CREATE UNIQUE INDEX "RefundRequest_one_pending_per_lead"
  ON "RefundRequest" ("leadPurchaseId")
  WHERE status = 'PENDING';
