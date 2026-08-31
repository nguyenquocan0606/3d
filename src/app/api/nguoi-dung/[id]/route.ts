import { NguoiDungService } from '@/services/nguoi-dung.service';
import { VaiTro } from '@/utils/auth';
import { fail, ok } from '@/utils/api-response';

async function chanNeuKhongPhaiAdmin(request: Request) {
  const phien = await NguoiDungService.layPhien(request);
  if (!phien) return { loi: fail('Chưa đăng nhập', 401), phien: null };
  if (phien.vaiTro !== 'admin') return { loi: fail('Chỉ quản trị viên mới được quản lý tài khoản', 403), phien: null };
  return { loi: null, phien };
}

function docVaiTro(giaTri: unknown): VaiTro | null {
  return giaTri === 'admin' || giaTri === 'nhanVien' ? giaTri : null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { loi, phien } = await chanNeuKhongPhaiAdmin(request);
  if (loi) return loi;

  try {
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;

    const hoTen = body.hoTen === undefined ? undefined : String(body.hoTen).trim();
    const matKhau = body.matKhau === undefined ? undefined : String(body.matKhau);
    const hoatDong = body.hoatDong === undefined ? undefined : Boolean(body.hoatDong);
    const vaiTro = body.vaiTro === undefined ? undefined : docVaiTro(body.vaiTro);

    if (hoTen !== undefined && !hoTen) return fail('Họ tên không được để trống', 400);
    if (matKhau !== undefined && matKhau.length < 6) return fail('Mật khẩu phải từ 6 ký tự', 400);
    if (body.vaiTro !== undefined && !vaiTro) return fail('Vai trò phải là admin hoặc nhanVien', 400);

    const dsNguoiDung = await NguoiDungService.danhSach();
    const muc = dsNguoiDung.find((n) => n.id === id);
    if (!muc) return fail('Không tìm thấy tài khoản', 404);

    // Chặn tự khóa/tự hạ quyền chính mình — mất luôn đường vào trang quản lý tài khoản.
    if (phien!.id === id && (hoatDong === false || vaiTro === 'nhanVien')) {
      return fail('Không thể tự khóa hoặc tự hạ quyền tài khoản đang đăng nhập', 400);
    }
    // Giữ ít nhất một admin còn hoạt động, nếu không sẽ không ai vào lại được.
    const boQuyenAdmin = muc.vaiTro === 'admin' && muc.hoatDong && (vaiTro === 'nhanVien' || hoatDong === false);
    if (boQuyenAdmin && (await NguoiDungService.soAdminHoatDong()) <= 1) {
      return fail('Phải còn ít nhất một quản trị viên đang hoạt động', 400);
    }

    return ok(await NguoiDungService.capNhat(id, { hoTen, vaiTro: vaiTro ?? undefined, hoatDong, matKhau }), 'Đã lưu');
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Không cập nhật được tài khoản', 500);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { loi, phien } = await chanNeuKhongPhaiAdmin(request);
  if (loi) return loi;

  try {
    const { id } = await params;
    if (phien!.id === id) return fail('Không thể xóa tài khoản đang đăng nhập', 400);

    const muc = (await NguoiDungService.danhSach()).find((n) => n.id === id);
    if (!muc) return fail('Không tìm thấy tài khoản', 404);
    if (muc.vaiTro === 'admin' && muc.hoatDong && (await NguoiDungService.soAdminHoatDong()) <= 1) {
      return fail('Phải còn ít nhất một quản trị viên đang hoạt động', 400);
    }

    await NguoiDungService.xoa(id);
    return ok(null, 'Đã xóa tài khoản');
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Không xóa được tài khoản', 500);
  }
}
