-- Ghi số con lỗi của từng lượt in SLL + đánh dấu lượt in bù.
ALTER TABLE "BulkRun" ADD COLUMN "defectQuantity" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BulkRun" ADD COLUMN "isRework" BOOLEAN NOT NULL DEFAULT false;
