import { NguoiDungService } from '@/services/nguoi-dung.service';
import { VaiTro } from '@/utils/auth';
import { fail, ok } from '@/utils/api-response';

/**
 * Quản lý tài khoản web — chỉ admin. Middleware cố ý không chặn `/api/*` (app Flutter
 * dùng chung API và không có tài khoản), nên quyền phải kiểm tra ngay tại đây.
 */
async function chanNeuKhongPhaiAdmin(request: Request) {
  const phien = await NguoiDungService.layPhien(request);
  if (!phien) return { loi: fail('Chưa đăng nhập', 401), phien: null };
  if (phien.vaiTro !== 'admin') return { loi: fail('Chỉ quản trị viên mới được quản lý tài khoản', 403), phien: null };
  return { loi: null, phien };
}

function docVaiTro(giaTri: unknown): VaiTro | null {
  return giaTri === 'admin' || giaTri === 'nhanVien' ? giaTri : null;
}

export async function GET(request: Request) {
  const { loi } = await chanNeuKhongPhaiAdmin(request);
  if (loi) return loi;
  return ok(await NguoiDungService.danhSach());
}

export async function POST(request: Request) {
  const { loi } = await chanNeuKhongPhaiAdmin(request);
  if (loi) return loi;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const tenDangNhap = String(body.tenDangNhap ?? '').trim();
    const hoTen = String(body.hoTen ?? '').trim();
    const matKhau = String(body.matKhau ?? '');
    const vaiTro = docVaiTro(body.vaiTro);

    if (!/^[a-zA-Z0-9._-]{3,32}$/.test(tenDangNhap)) {
      return fail('Tên đăng nhập 3-32 ký tự, chỉ gồm chữ, số và . _ -', 400);
    }
    if (!hoTen) return fail('Nhập họ tên', 400);
    if (matKhau.length < 6) return fail('Mật khẩu phải từ 6 ký tự', 400);
    if (!vaiTro) return fail('Vai trò phải là admin hoặc nhanVien', 400);

    const daCo = (await NguoiDungService.danhSach()).some((n) => n.tenDangNhap === tenDangNhap.toLowerCase());
    if (daCo) return fail('Tên đăng nhập đã tồn tại', 409);

    return ok(await NguoiDungService.taoMoi({ tenDangNhap, hoTen, matKhau, vaiTro }), 'Đã tạo tài khoản');
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Không tạo được tài khoản', 500);
  }
}
