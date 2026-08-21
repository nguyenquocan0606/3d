import { ok, fail } from '@/utils/api-response';
import { datDiaChiMayChinh, kiemTraMayChinh } from '@/services/eshop.service';

/**
 * PUT /api/eshop/agent — lưu địa chỉ script agent trên máy chính (VD http://192.168.1.5:39100).
 * Body: { agentUrl: string | null }. Để trống = server gọi thẳng MISA.
 */
export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as { agentUrl?: string | null };
    const url = body.agentUrl?.trim() || null;

    if (url && !/^https?:\/\//i.test(url)) {
      return fail('Địa chỉ máy chính phải bắt đầu bằng http:// hoặc https://', 400);
    }

    await datDiaChiMayChinh(url);
    return ok(
      { agentUrl: url },
      url ? 'Đã lưu địa chỉ máy chính.' : 'Đã xóa địa chỉ máy chính — server sẽ gọi thẳng MISA.',
    );
  } catch (error: unknown) {
    return fail(error instanceof Error ? error.message : 'Lỗi máy chủ');
  }
}

/** POST /api/eshop/agent — thử gọi máy chính xem còn sống không. */
export async function POST() {
  try {
    return ok(await kiemTraMayChinh());
  } catch (error: unknown) {
    return fail(error instanceof Error ? error.message : 'Lỗi máy chủ');
  }
}
