-- AlterTable
ALTER TABLE "StoreProduct" ADD COLUMN     "giaBanLe" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "giaKhuyenMai" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "giaVon" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "parentId" TEXT,
ADD COLUMN     "soLuongCombo" INTEGER;

-- CreateIndex
CREATE INDEX "StoreProduct_parentId_idx" ON "StoreProduct"("parentId");

-- AddForeignKey
ALTER TABLE "StoreProduct" ADD CONSTRAINT "StoreProduct_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "StoreProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
