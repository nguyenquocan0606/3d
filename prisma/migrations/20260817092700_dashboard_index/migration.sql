-- CreateIndex
CREATE INDEX "BulkRun_status_finishedAt_idx" ON "BulkRun"("status", "finishedAt");

-- CreateIndex
CREATE INDEX "EshopOrder_prepareDueTime_idx" ON "EshopOrder"("prepareDueTime");

-- CreateIndex
CREATE INDEX "PrintJob_createdAt_idx" ON "PrintJob"("createdAt");

-- CreateIndex
CREATE INDEX "StoreProduct_parentId_soLuong_idx" ON "StoreProduct"("parentId", "soLuong");

-- CreateIndex
CREATE INDEX "Task3DSpoolUsage_createdAt_idx" ON "Task3DSpoolUsage"("createdAt");
