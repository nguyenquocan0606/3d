-- Giá bán sàn giờ neo theo giá bán lẻ (bán trên sàn lời đúng bằng bán lẻ) thay vì cứng "lợi nhuận =
-- 1 giá vốn": giaBanSan = round((giaBanLe + 3000) / (1 - 0.30)), giaKhuyenMai = round(giaBanSan / (1 - 0.25)).
-- Tính lại 1 lần cho dữ liệu cũ (giaBanLe đã được backfill ở migration trước).
UPDATE "StoreProduct"
SET "gia" = ROUND(("giaBanLe" + 3000) / 0.7),
    "giaKhuyenMai" = ROUND(ROUND(("giaBanLe" + 3000) / 0.7) / 0.75)
WHERE "giaVon" > 0;
