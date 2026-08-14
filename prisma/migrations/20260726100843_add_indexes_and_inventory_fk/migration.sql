-- CreateIndex
CREATE INDEX "InventoryItem_sessionId_idx" ON "InventoryItem"("sessionId");

-- CreateIndex
CREATE INDEX "OrderProduct_orderId_idx" ON "OrderProduct"("orderId");

-- CreateIndex
CREATE INDEX "PeiSheet_printerId_idx" ON "PeiSheet"("printerId");

-- CreateIndex
CREATE INDEX "PrintItem_productId_idx" ON "PrintItem"("productId");

-- CreateIndex
CREATE INDEX "PrintItem_peiSheetId_idx" ON "PrintItem"("peiSheetId");

-- CreateIndex
CREATE INDEX "PrintItem_printerId_idx" ON "PrintItem"("printerId");

-- CreateIndex
CREATE INDEX "PrintItem_status_idx" ON "PrintItem"("status");

-- CreateIndex
CREATE INDEX "Printer_cloudAccountId_idx" ON "Printer"("cloudAccountId");

-- CreateIndex
CREATE INDEX "Spool_filamentId_idx" ON "Spool"("filamentId");

-- CreateIndex
CREATE INDEX "Spool_locationId_idx" ON "Spool"("locationId");

-- CreateIndex
CREATE INDEX "Spool_printerId_idx" ON "Spool"("printerId");

-- CreateIndex
CREATE INDEX "Spool_status_idx" ON "Spool"("status");

-- CreateIndex
CREATE INDEX "Task3D_printerId_idx" ON "Task3D"("printerId");

-- CreateIndex
CREATE INDEX "Task3D_status_idx" ON "Task3D"("status");

-- CreateIndex
CREATE INDEX "Task3DSpoolUsage_taskId_idx" ON "Task3DSpoolUsage"("taskId");

-- CreateIndex
CREATE INDEX "Task3DSpoolUsage_spoolId_idx" ON "Task3DSpoolUsage"("spoolId");

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_spoolId_fkey" FOREIGN KEY ("spoolId") REFERENCES "Spool"("id") ON DELETE CASCADE ON UPDATE CASCADE;
