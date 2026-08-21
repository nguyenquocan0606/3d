import prisma from '@/utils/db';
import { ok, fail } from '@/utils/api-response';
import { layTrangThaiDongBo } from '@/services/eshop.service';

/**
 * GET /api/eshop/orders?tuNgay=&denNgay= — đọc đơn eShop ĐÃ ĐỒNG BỘ trong DB (không gọi MISA).
 * Nhờ vậy mở tab vẫn xem được đơn kể cả khi token MISA hết hạn.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const tuNgay = searchParams.get('tuNgay');
    const denNgay = searchParams.get('denNgay');

    const khoangNgay: { gte?: Date; lte?: Date } = {};
    if (tuNgay && !Number.isNaN(Date.parse(tuNgay))) khoangNgay.gte = new Date(tuNgay);
    if (denNgay && !Number.isNaN(Date.parse(denNgay))) khoangNgay.lte = new Date(denNgay);

    const orders = await prisma.eshopOrder.findMany({
      where: Object.keys(khoangNgay).length > 0 ? { refDate: khoangNgay } : undefined,
      include: { items: true, pickProgress: true },
      orderBy: { refDate: 'desc' },
    });

    return ok({ orders, syncState: await layTrangThaiDongBo() });
  } catch (error: unknown) {
    return fail(error instanceof Error ? error.message : 'Lỗi máy chủ');
  }
}
