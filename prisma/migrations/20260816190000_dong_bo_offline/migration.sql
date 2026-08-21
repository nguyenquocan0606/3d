-- Hạ tầng đồng bộ offline cho app di động — xem KE-HOACH-DONG-BO-OFFLINE.md
--
-- Ba việc:
--   1. StoreProduct có mốc sửa đổi do server giữ (để lọc delta được).
--   2. Bảng bia mộ, cho máy offline biết bản ghi nào đã bị xóa.
--   3. Nhật ký thao tác nhận từ app, khóa chống gửi trùng.

-- ── 1. StoreProduct.updatedAt ──
-- Cột `ngayCapNhat` sẵn có là chuỗi ISO do client tự đặt nên không dùng để lọc
-- delta được: máy lệch giờ, hoặc client ghi lại y giá trị cũ, là bỏ sót bản ghi.
ALTER TABLE "StoreProduct" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill từ `ngayCapNhat` để hàng có sẵn không bị dồn hết về thời điểm chạy
-- migration. Chuỗi hỏng/không parse được thì giữ CURRENT_TIMESTAMP của DEFAULT.
UPDATE "StoreProduct"
SET "updatedAt" = "ngayCapNhat"::timestamp
WHERE "ngayCapNhat" ~ '^\d{4}-\d{2}-\d{2}';

-- ── 2. Bia mộ ──
CREATE TABLE "SyncTombstone" (
    "id" SERIAL NOT NULL,
    "bang" TEXT NOT NULL,
    "banGhiId" TEXT NOT NULL,
    "xoaLuc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncTombstone_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SyncTombstone_bang_banGhiId_key" ON "SyncTombstone"("bang", "banGhiId");
CREATE INDEX "SyncTombstone_xoaLuc_idx" ON "SyncTombstone"("xoaLuc");

-- ── 3. Nhật ký thao tác ──
CREATE TABLE "SyncAction" (
    "id" TEXT NOT NULL,
    "loai" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "taoLuc" TIMESTAMP(3) NOT NULL,
    "apDungLuc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ketQua" TEXT NOT NULL,
    "thongDiep" TEXT,
    "thietBi" TEXT,

    CONSTRAINT "SyncAction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SyncAction_apDungLuc_idx" ON "SyncAction"("apDungLuc");
CREATE INDEX "SyncAction_loai_idx" ON "SyncAction"("loai");

-- ── 4. Chỉ mục cho truy vấn delta ──
-- Mọi lần đồng bộ đều quét `WHERE "updatedAt" > $since` trên các bảng này. Không
-- có chỉ mục thì mỗi máy quét toàn bảng, mà xưởng có nhiều máy cùng đồng bộ.
CREATE INDEX "Spool_updatedAt_idx" ON "Spool"("updatedAt");
CREATE INDEX "PrintItem_updatedAt_idx" ON "PrintItem"("updatedAt");
CREATE INDEX "BulkRun_updatedAt_idx" ON "BulkRun"("updatedAt");
CREATE INDEX "BulkOrder_updatedAt_idx" ON "BulkOrder"("updatedAt");
CREATE INDEX "Order_updatedAt_idx" ON "Order"("updatedAt");
CREATE INDEX "OrderProduct_updatedAt_idx" ON "OrderProduct"("updatedAt");
CREATE INDEX "PeiSheet_updatedAt_idx" ON "PeiSheet"("updatedAt");
CREATE INDEX "Printer_updatedAt_idx" ON "Printer"("updatedAt");
CREATE INDEX "Location_updatedAt_idx" ON "Location"("updatedAt");
CREATE INDEX "Filament_updatedAt_idx" ON "Filament"("updatedAt");
CREATE INDEX "StoreProduct_updatedAt_idx" ON "StoreProduct"("updatedAt");
