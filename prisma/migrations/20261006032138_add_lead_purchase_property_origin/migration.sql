-- AlterTable
ALTER TABLE "LeadPurchase" ADD COLUMN     "propertyId" TEXT;

-- CreateIndex
CREATE INDEX "LeadPurchase_propertyId_idx" ON "LeadPurchase"("propertyId");

-- AddForeignKey
ALTER TABLE "LeadPurchase" ADD CONSTRAINT "LeadPurchase_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;
