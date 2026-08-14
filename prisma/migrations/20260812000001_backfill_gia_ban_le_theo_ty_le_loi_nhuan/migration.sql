-- Dữ liệu cũ có giaBanLe = giaVon × 2 (lợi nhuận 100% cố định). Từ nay giá bán lẻ theo % lợi nhuận
-- của từng hàng hóa (mặc định 40%) nên tính lại một lần cho khớp công thức mới.
UPDATE "StoreProduct"
SET "giaBanLe" = ROUND("giaVon" * (1 + "tyLeLoiNhuan" / 100))
WHERE "giaVon" > 0;
