import prisma from '@/utils/db';
import { ok, fail } from '@/utils/api-response';

/**
 * GET /api/quote/config — cấu hình chung của tab Báo giá (giá điện + khấu hao máy/giờ).
 * Luôn đúng 1 dòng id="default", tự tạo với giá trị mặc định nếu chưa có.
 */
export async function GET() {
  try {
    const config = await prisma.cauHinhBaoGia.upsert({
      where: { id: 'default' },
      update: {},
      create: { id: 'default' },
    });
    return ok(config);
  } catch (error: unknown) {
    return fail(error instanceof Error ? error.message : 'Lỗi máy chủ');
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const gioMayInVnd = Number(body?.gioMayInVnd);
    if (!Number.isFinite(gioMayInVnd) || gioMayInVnd < 0) {
      return fail('gioMayInVnd phải là số không âm', 400);
    }

    const config = await prisma.cauHinhBaoGia.upsert({
      where: { id: 'default' },
      update: { gioMayInVnd },
      create: { id: 'default', gioMayInVnd },
    });
    return ok(config);
  } catch (error: unknown) {
    return fail(error instanceof Error ? error.message : 'Lỗi máy chủ');
  }
}
