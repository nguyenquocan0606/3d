import { ok, fail } from '@/utils/api-response';
import { LoiDangNhapMisa, luuPhienDangNhap, xacThucOtpMisa } from '@/services/misa-login.service';

/**
 * POST /api/misa/login/otp — bước 2: gửi mã OTP kèm token tạm nhận ở bước 1.
 * Body: { token, otp, cookie }
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { token?: string; otp?: string; cookie?: string };
    if (!body.token || !body.otp) return fail('Thiếu token hoặc mã OTP', 400);

    const { cookie, tokenMisaId } = await xacThucOtpMisa(body.token, body.otp, body.cookie || '');
    const ketQua = await luuPhienDangNhap(cookie, tokenMisaId);

    return ok(
      ketQua,
      ketQua.coBearerToken
        ? 'Đăng nhập thành công — đã lấy Bearer token, từ giờ hệ thống tự gia hạn.'
        : `Đăng nhập thành công nhưng ${ketQua.ghiChu}`,
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Lỗi máy chủ';
    return fail(message, error instanceof LoiDangNhapMisa ? 400 : 500);
  }
}
