-- Chế độ sản xuất số lượng lớn: quản lý theo LƯỢT IN (1 mâm PEI) thay vì theo từng con.
-- Mỗi lượt có mã vạch riêng để quẹt check-in (bắt đầu in) / check-out (in xong).

-- CreateTable
CREATE TABLE "BulkOrder" (
    "id" TEXT NOT NULL,
    "orderCode" TEXT,
    "customerName" TEXT,
    "productName" TEXT NOT NULL,
    "totalQuantity" INTEGER NOT NULL,
    "perSheetQty" INTEGER NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BulkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BulkRun" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "printerId" TEXT,
    "printerName" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "peiIndex" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BulkRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BulkOrder_orderCode_key" ON "BulkOrder"("orderCode");

-- CreateIndex
CREATE INDEX "BulkOrder_status_idx" ON "BulkOrder"("status");

-- CreateIndex
CREATE INDEX "BulkRun_orderId_idx" ON "BulkRun"("orderId");

-- CreateIndex
CREATE INDEX "BulkRun_printerId_idx" ON "BulkRun"("printerId");

-- CreateIndex
CREATE INDEX "BulkRun_status_idx" ON "BulkRun"("status");

-- AddForeignKey
ALTER TABLE "BulkRun" ADD CONSTRAINT "BulkRun_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "BulkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BulkRun" ADD CONSTRAINT "BulkRun_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "Printer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
