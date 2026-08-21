-- Chuyển hộp thư Zalo từ một tài khoản sang nhiều tài khoản.
--
-- Viết tay thay vì để `prisma migrate diff` tự sinh: bản tự sinh sẽ xóa và tạo lại ZaloThread,
-- làm mất hội thoại và tin nhắn đã thu được. Ở đây thêm cột rồi backfill nên dữ liệu giữ nguyên.

-- ── ZaloAccount ──
ALTER TABLE "ZaloAccount" ADD COLUMN "nhan" TEXT;

-- id giờ do Prisma sinh uuid cho tài khoản mới; dòng 'default' cũ giữ nguyên id của nó.
ALTER TABLE "ZaloAccount" ALTER COLUMN "id" DROP DEFAULT;

-- Đặt tên cho tài khoản đang có để trên web không hiện trống.
UPDATE "ZaloAccount" SET "nhan" = COALESCE("displayName", 'Tài khoản chính') WHERE "nhan" IS NULL;

-- ── ZaloThread ──
-- `id` cũ đang chứa threadId của Zalo. Từ nay `id` chỉ là khóa nội bộ, còn threadId tách ra cột
-- riêng — vì hai tài khoản shop cùng nhận tin từ một khách sẽ có threadId Zalo trùng nhau.
ALTER TABLE "ZaloThread" ADD COLUMN "accountId" TEXT;
ALTER TABLE "ZaloThread" ADD COLUMN "threadId" TEXT;

-- Backfill: hội thoại cũ đều thuộc tài khoản duy nhất có trước đó.
UPDATE "ZaloThread" SET "threadId" = "id" WHERE "threadId" IS NULL;
UPDATE "ZaloThread"
SET "accountId" = (SELECT "id" FROM "ZaloAccount" ORDER BY "updatedAt" ASC LIMIT 1)
WHERE "accountId" IS NULL;

-- Không còn tài khoản nào (DB sạch) thì cũng chẳng có hội thoại nào — xóa cho chắc để
-- ràng buộc NOT NULL bên dưới không vỡ.
DELETE FROM "ZaloThread" WHERE "accountId" IS NULL;

ALTER TABLE "ZaloThread" ALTER COLUMN "accountId" SET NOT NULL;
ALTER TABLE "ZaloThread" ALTER COLUMN "threadId" SET NOT NULL;

CREATE UNIQUE INDEX "ZaloThread_accountId_threadId_key" ON "ZaloThread"("accountId", "threadId");
CREATE INDEX "ZaloThread_accountId_idx" ON "ZaloThread"("accountId");

ALTER TABLE "ZaloThread" ADD CONSTRAINT "ZaloThread_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "ZaloAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
