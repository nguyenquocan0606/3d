-- Thêm 2 cột metadata rút gọn của `anh`/`tepIn` (bỏ trường `duLieu` base64) để GET danh sách
-- hàng hóa không phải đọc 2 cột JSONB nặng (vài trăm MB) rồi vứt bỏ base64 trong JS.
ALTER TABLE "StoreProduct" ADD COLUMN "anhMeta" JSONB;
ALTER TABLE "StoreProduct" ADD COLUMN "tepInMeta" JSONB;

-- Backfill từ dữ liệu hiện có.
UPDATE "StoreProduct" SET
  "anhMeta" = CASE
    WHEN jsonb_typeof("anh") = 'array'
      THEN (SELECT COALESCE(jsonb_agg(e - 'duLieu'), '[]'::jsonb) FROM jsonb_array_elements("anh") e)
    ELSE '[]'::jsonb
  END,
  "tepInMeta" = CASE
    WHEN jsonb_typeof("tepIn") = 'array'
      THEN (SELECT COALESCE(jsonb_agg(e - 'duLieu'), '[]'::jsonb) FROM jsonb_array_elements("tepIn") e)
    ELSE '[]'::jsonb
  END;
