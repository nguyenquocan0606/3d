-- CreateTable
CREATE TABLE "EshopPickProgress" (
    "orderId" TEXT NOT NULL,
    "pickedItems" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'picking',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EshopPickProgress_pkey" PRIMARY KEY ("orderId")
);

-- AddForeignKey
ALTER TABLE "EshopPickProgress" ADD CONSTRAINT "EshopPickProgress_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "EshopOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
