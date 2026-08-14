-- Hệ số giá combo chuyển từ "một bộ dùng chung cả cửa hàng" sang "riêng từng sản phẩm mẹ", sửa ngay
-- trên panel chi tiết của hàng mẹ. Dạng {"1":1.5,"2":2,"5":4}; NULL = dùng HE_SO_COMBO_MAC_DINH.
ALTER TABLE "StoreProduct" ADD COLUMN "heSoCombo" JSONB;

-- Chuyển hệ số đang lưu ở cấu hình chung xuống mọi sản phẩm mẹ để giá không đổi bất ngờ sau khi
-- nâng cấp. Chỉ sản phẩm mẹ (parentId IS NULL) mới cần — combo con không dùng cột này.
UPDATE "StoreProduct" p
SET "heSoCombo" = c."cauHinhCombo" -> 'heSo'
FROM "StoreConfig" c
WHERE c."id" = 'main'
  AND p."parentId" IS NULL
  AND jsonb_typeof(c."cauHinhCombo" -> 'heSo') = 'object';

-- Bộ tham số chung không còn chỗ dùng: phí %/phí cố định bị bỏ khỏi công thức combo (giá combo giờ
-- nhân thẳng từ giá sàn / giá KM của mẹ), còn hệ số đã dời sang StoreProduct ở trên.
ALTER TABLE "StoreConfig" DROP COLUMN "cauHinhCombo";
