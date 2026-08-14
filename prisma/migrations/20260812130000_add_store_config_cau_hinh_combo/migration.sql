-- Tham số định giá combo dùng chung cho cả cửa hàng (phiPhanTram / phiCoDinh / heSo theo số cái gộp).
-- NULL = dùng bộ mặc định trong src/utils/dinh-gia-hang-hoa.ts.
ALTER TABLE "StoreConfig" ADD COLUMN "cauHinhCombo" JSONB;
