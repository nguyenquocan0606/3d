-- Đăng nhập cho bản web. App Flutter không đụng tới bảng này.
CREATE TABLE "NguoiDung" (
    "id" TEXT NOT NULL,
    "tenDangNhap" TEXT NOT NULL,
    "hoTen" TEXT NOT NULL,
    "matKhauBam" TEXT NOT NULL,
    "vaiTro" TEXT NOT NULL DEFAULT 'nhanVien',
    "hoatDong" BOOLEAN NOT NULL DEFAULT true,
    "lanDangNhapCuoi" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NguoiDung_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NguoiDung_tenDangNhap_key" ON "NguoiDung"("tenDangNhap");
CREATE INDEX "NguoiDung_updatedAt_idx" ON "NguoiDung"("updatedAt");

-- Hai tài khoản dựng sẵn để đăng nhập được ngay sau khi chạy migrate.
-- Mật khẩu mặc định: admin / admin@123  và  nhanvien / nhanvien@123
-- ĐỔI MẬT KHẨU NGAY sau lần đăng nhập đầu (trang /tai-khoan hoặc `node scripts/nguoi-dung.mjs`),
-- vì băm dưới đây nằm trong mã nguồn nên ai đọc repo cũng biết mật khẩu gốc.
INSERT INTO "NguoiDung" ("id", "tenDangNhap", "hoTen", "matKhauBam", "vaiTro", "updatedAt") VALUES
  ('00000000-0000-4000-8000-000000000001', 'admin', 'Quản trị', 'pbkdf2$120000$pj0a8KJuf35DiDRVyowfdA$_xwtIsBQuFeE8B7grjfCdLUTnKmnXLiF2aut4vgVvS4', 'admin', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000002', 'nhanvien', 'Nhân viên cửa hàng', 'pbkdf2$120000$gBOYl8xsAaGHdfW1Vc-D8g$_nyWuzsF1GvAUf5TjaOOrYFQpbe1G6foG_92kyJ3bdE', 'nhanVien', CURRENT_TIMESTAMP);
