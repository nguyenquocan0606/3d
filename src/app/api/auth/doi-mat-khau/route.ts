import { NguoiDungService } from '@/services/nguoi-dung.service';
import { fail, ok } from '@/utils/api-response';

export async function POST(request: Request) {
  const phien = await NguoiDungService.layPhien(request);
  if (!phien) return fail('Chưa đăng nhập', 401);

  try {
    const { matKhauCu, matKhauMoi } = (await request.json()) as { matKhauCu?: string; matKhauMoi?: string };
    if (!matKhauCu || !matKhauMoi) return fail('Nhập mật khẩu cũ và mật khẩu mới', 400);
    if (matKhauMoi.length < 6) return fail('Mật khẩu mới phải từ 6 ký tự', 400);

    const xong = await NguoiDungService.doiMatKhauCuaToi(phien.id, matKhauCu, matKhauMoi);
    if (!xong) return fail('Mật khẩu cũ không đúng', 400);
    return ok(null, 'Đã đổi mật khẩu');
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Không đổi được mật khẩu', 500);
  }
}
