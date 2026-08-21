-- Hạn dùng của Bearer token, đọc từ claim `exp` trong chính JWT (token MISA sống ~20,5 tiếng).
ALTER TABLE "MisaCredential" ADD COLUMN "tokenExpiresAt" TIMESTAMP(3);
