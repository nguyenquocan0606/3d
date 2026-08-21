import { ok, fail } from '@/utils/api-response';
import { LoiDangNhapMisa, batDauDangNhapMisa, luuPhienDangNhap } from '@/services/misa-login.service';

/**
 * POST /api/misa/login — bước 1: gửi tài khoản/mật khẩu.
 * Body: { userName, password }
 *
 * Tài khoản bật 2FA thì trả `{ canOtp: true, token, cookie }` để client gọi tiếp /api/misa/login/otp.
 * Mật khẩu chỉ dùng ngay tại đây, KHÔNG lưu vào DB.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { userName?: string; password?: string };
    if (!body.userName || !body.password) return fail('Thiếu tài khoản hoặc mật khẩu', 400);

    const ketQua = await batDauDangNhapMisa(body.userName, body.password);

    // Không cần OTP: phiên đã dùng được ngay, lưu luôn. Phải chuyển tiếp `tokenMisaId` lấy được ở
    // bước login, nếu không sẽ lưu mỗi cookie rồi báo thiếu Bearer token.
    if (!ketQua.canOtp) {
      const luu = await luuPhienDangNhap(ketQua.cookie, ketQua.tokenMisaId);
      return ok({ canOtp: false, coBearerToken: luu.coBearerToken }, `${ketQua.message} ${luu.ghiChu}`);
    }

    return ok({ canOtp: true, token: ketQua.token, cookie: ketQua.cookie }, ketQua.message);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Lỗi máy chủ';
    return fail(message, error instanceof LoiDangNhapMisa ? 400 : 500);
  }
}
