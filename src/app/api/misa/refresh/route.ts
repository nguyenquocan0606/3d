import { ok, fail } from '@/utils/api-response';
import { lamMoiTokenEshop } from '@/services/misa-login.service';

/**
 * POST /api/misa/refresh — gia hạn Bearer token bằng refresh token đã lưu.
 * Không cần mật khẩu, không cần OTP. Hệ thống cũng tự gọi việc này trước mỗi lần đồng bộ eShop khi
 * token còn dưới 2 tiếng.
 */
export async function POST() {
  try {
    const ketQua = await lamMoiTokenEshop();
    return ok(ketQua, ketQua.message);
  } catch (error: unknown) {
    return fail(error instanceof Error ? error.message : 'Lỗi máy chủ');
  }
}
