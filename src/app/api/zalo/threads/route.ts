import { ok, fail } from '@/utils/api-response';
import { layDanhSachHoiThoai } from '@/services/zalo.service';

/**
 * GET /api/zalo/threads?q=&accountId= — danh sách hội thoại, mới nhất lên đầu. Đọc DB, không gọi Zalo.
 * Bỏ trống `accountId` = hộp thư gộp, thấy hội thoại của mọi tài khoản.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const tuKhoa = searchParams.get('q')?.trim();
    const accountId = searchParams.get('accountId')?.trim();
    return ok({ threads: await layDanhSachHoiThoai(tuKhoa || undefined, accountId || undefined) });
  } catch (error: unknown) {
    return fail(error instanceof Error ? error.message : 'Lỗi máy chủ');
  }
}
