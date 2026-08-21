-- Gọi MISA qua agent chạy trên máy chính (MISA eShop chỉ cho 1 phiên đăng nhập).
ALTER TABLE "EshopSyncState" ADD COLUMN "agentUrl" TEXT;
ALTER TABLE "EshopSyncState" ADD COLUMN "agentLastOkAt" TIMESTAMP(3);
ALTER TABLE "EshopSyncState" ADD COLUMN "lastRunVia" TEXT;
