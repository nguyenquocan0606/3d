#!/usr/bin/env node
/**
 * Quản lý tài khoản đăng nhập web từ dòng lệnh — dùng khi lỡ khóa/quên mật khẩu
 * hết tài khoản admin, lúc đó không vào được trang /tai-khoan nữa.
 *
 *   node scripts/nguoi-dung.mjs liet-ke
 *   node scripts/nguoi-dung.mjs them <tenDangNhap> <matKhau> <admin|nhanVien> [họ tên]
 *   node scripts/nguoi-dung.mjs doi-mat-khau <tenDangNhap> <matKhauMoi>
 *   node scripts/nguoi-dung.mjs doi-vai-tro <tenDangNhap> <admin|nhanVien>
 *   node scripts/nguoi-dung.mjs xoa <tenDangNhap>
 *
 * Thuật toán băm phải khớp `src/utils/auth.ts` (PBKDF2-SHA256, 120k vòng).
 */
import { PrismaClient } from '@prisma/client';
import { webcrypto as crypto } from 'node:crypto';

const VONG_LAP = 120_000;
const prisma = new PrismaClient();

function b64url(bytes) {
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function bamMatKhau(matKhau) {
  const muoi = crypto.getRandomValues(new Uint8Array(16));
  const khoa = await crypto.subtle.importKey('raw', new TextEncoder().encode(matKhau), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: muoi, iterations: VONG_LAP, hash: 'SHA-256' },
    khoa,
    256,
  );
  return `pbkdf2$${VONG_LAP}$${b64url(muoi)}$${b64url(new Uint8Array(bits))}`;
}

function kiemTraVaiTro(vaiTro) {
  if (vaiTro !== 'admin' && vaiTro !== 'nhanVien') {
    throw new Error('Vai trò phải là "admin" hoặc "nhanVien"');
  }
  return vaiTro;
}

const [lenh, ...thamSo] = process.argv.slice(2);

try {
  switch (lenh) {
    case 'liet-ke': {
      const ds = await prisma.nguoiDung.findMany({ orderBy: { createdAt: 'asc' } });
      for (const n of ds) {
        console.log(
          `${n.tenDangNhap.padEnd(16)} ${n.vaiTro.padEnd(9)} ${n.hoatDong ? 'hoạt động' : 'đã khóa '}  ${n.hoTen}`,
        );
      }
      break;
    }
    case 'them': {
      const [tenDangNhap, matKhau, vaiTro, ...hoTen] = thamSo;
      if (!tenDangNhap || !matKhau || !vaiTro) throw new Error('Thiếu tham số');
      await prisma.nguoiDung.create({
        data: {
          tenDangNhap: tenDangNhap.toLowerCase(),
          hoTen: hoTen.join(' ') || tenDangNhap,
          matKhauBam: await bamMatKhau(matKhau),
          vaiTro: kiemTraVaiTro(vaiTro),
        },
      });
      console.log(`Đã tạo tài khoản ${tenDangNhap}`);
      break;
    }
    case 'doi-mat-khau': {
      const [tenDangNhap, matKhau] = thamSo;
      if (!tenDangNhap || !matKhau) throw new Error('Thiếu tham số');
      await prisma.nguoiDung.update({
        where: { tenDangNhap: tenDangNhap.toLowerCase() },
        // Đổi mật khẩu thường đi kèm việc mở lại tài khoản bị khóa.
        data: { matKhauBam: await bamMatKhau(matKhau), hoatDong: true },
      });
      console.log(`Đã đổi mật khẩu cho ${tenDangNhap}`);
      break;
    }
    case 'doi-vai-tro': {
      const [tenDangNhap, vaiTro] = thamSo;
      if (!tenDangNhap || !vaiTro) throw new Error('Thiếu tham số');
      await prisma.nguoiDung.update({
        where: { tenDangNhap: tenDangNhap.toLowerCase() },
        data: { vaiTro: kiemTraVaiTro(vaiTro) },
      });
      console.log(`${tenDangNhap} → ${vaiTro}`);
      break;
    }
    case 'xoa': {
      const [tenDangNhap] = thamSo;
      if (!tenDangNhap) throw new Error('Thiếu tham số');
      await prisma.nguoiDung.delete({ where: { tenDangNhap: tenDangNhap.toLowerCase() } });
      console.log(`Đã xóa ${tenDangNhap}`);
      break;
    }
    default:
      console.log(
        [
          'Cách dùng:',
          '  node scripts/nguoi-dung.mjs liet-ke',
          '  node scripts/nguoi-dung.mjs them <tenDangNhap> <matKhau> <admin|nhanVien> [họ tên]',
          '  node scripts/nguoi-dung.mjs doi-mat-khau <tenDangNhap> <matKhauMoi>',
          '  node scripts/nguoi-dung.mjs doi-vai-tro <tenDangNhap> <admin|nhanVien>',
          '  node scripts/nguoi-dung.mjs xoa <tenDangNhap>',
        ].join('\n'),
      );
      process.exitCode = lenh ? 1 : 0;
  }
} catch (loi) {
  console.error('Lỗi:', loi.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
