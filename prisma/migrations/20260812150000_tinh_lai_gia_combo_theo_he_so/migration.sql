-- Giá combo đang lưu trong DB được tính bằng công thức cũ (nhân giá vốn rồi cộng phí sàn). Công thức
-- mới là "giá tương ứng của mẹ × hệ số" — tính lại ngay ở đây, nếu không giá cũ sẽ nằm im cho tới
-- lần người dùng sửa sản phẩm mẹ tiếp theo.
-- Hệ số lấy từ mẹ; thiếu khóa thì rơi về chính số cái gộp (giống chuanHoaHeSoCombo phía ứng dụng).
UPDATE "StoreProduct" con
SET
  "giaVon" = round(me."giaVon" * COALESCE((me."heSoCombo" ->> con."soLuongCombo"::text)::double precision, con."soLuongCombo")),
  "giaBanLe" = round(me."giaBanLe" * COALESCE((me."heSoCombo" ->> con."soLuongCombo"::text)::double precision, con."soLuongCombo")),
  "gia" = round(me."gia" * COALESCE((me."heSoCombo" ->> con."soLuongCombo"::text)::double precision, con."soLuongCombo")),
  "giaKhuyenMai" = round(me."giaKhuyenMai" * COALESCE((me."heSoCombo" ->> con."soLuongCombo"::text)::double precision, con."soLuongCombo")),
  "tyLeLoiNhuan" = me."tyLeLoiNhuan"
FROM "StoreProduct" me
WHERE con."parentId" = me."id"
  AND con."soLuongCombo" IS NOT NULL;
