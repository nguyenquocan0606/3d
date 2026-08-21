-- Refresh token eShop + token MISA ID: cho phép tự gia hạn Bearer token mà không cần nhập OTP lại.
ALTER TABLE "MisaCredential" ADD COLUMN "refreshToken" TEXT;
ALTER TABLE "MisaCredential" ADD COLUMN "tokenMisaId" TEXT;
