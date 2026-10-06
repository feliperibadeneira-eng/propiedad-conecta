-- CreateTable
CREATE TABLE "PropertyShare" (
    "id" TEXT NOT NULL,
    "leadPurchaseId" TEXT NOT NULL,
    "propertyId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PropertyShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PropertyShare_leadPurchaseId_idx" ON "PropertyShare"("leadPurchaseId");

-- CreateIndex
CREATE INDEX "PropertyShare_propertyId_idx" ON "PropertyShare"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyShare_leadPurchaseId_propertyId_key" ON "PropertyShare"("leadPurchaseId", "propertyId");

-- AddForeignKey
ALTER TABLE "PropertyShare" ADD CONSTRAINT "PropertyShare_leadPurchaseId_fkey" FOREIGN KEY ("leadPurchaseId") REFERENCES "LeadPurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyShare" ADD CONSTRAINT "PropertyShare_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;
