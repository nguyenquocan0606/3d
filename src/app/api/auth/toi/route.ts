import { NguoiDungService } from '@/services/nguoi-dung.service';
import { ok } from '@/utils/api-response';

/** Thông tin tài khoản đang đăng nhập, để giao diện hiện tên và ẩn/hiện mục theo vai trò. */
export async function GET(request: Request) {
  const phien = await NguoiDungService.layPhien(request);
  if (!phien) return ok(null);
  return ok({ id: phien.id, tenDangNhap: phien.tenDangNhap, hoTen: phien.hoTen, vaiTro: phien.vaiTro });
}
