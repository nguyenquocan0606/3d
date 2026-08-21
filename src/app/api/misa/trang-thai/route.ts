import { ok, fail } from '@/utils/api-response';
import { kiemTraTrangThaiMisa } from '@/services/misa-login.service';

/**
 * GET /api/misa/trang-thai — xem phiên MISA còn sống không.
 *
 * Chỉ đọc: đi chuỗi SSO tới lúc nhặt được vé rồi dừng, KHÔNG đổi phiên. Gọi bao nhiêu lần cũng không
 * ảnh hưởng phiên eShop đang mở trên máy chính — khác hẳn /api/misa/refresh.
 */
export async function GET() {
  try {
    const trangThai = await kiemTraTrangThaiMisa();
    return ok(trangThai, trangThai.tomTat);
  } catch (error: unknown) {
    return fail(error instanceof Error ? error.message : 'Lỗi máy chủ');
  }
}
