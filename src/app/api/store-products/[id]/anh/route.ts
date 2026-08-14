import prisma from '@/utils/db';
import { ok, fail } from '@/utils/api-response';
import { taoAnhDaiDien } from '@/utils/anh-dai-dien';
import { khoiPhucTuMeta, laDanhSachTepHopLe, rutGonMeta } from '@/utils/tep-dinh-kem';

/**
 * Ảnh gốc (base64) của MỘT hàng hóa — cùng lý do tách route như tep-in/ (xem chú thích ở đó).
 * PUT ở đây tính lại luôn `anhDaiDien` (thumbnail nhỏ) vì danh sách hiển thị avatar từ cột đó.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const product = await prisma.storeProduct.findUnique({ where: { id }, select: { anh: true } });
    if (!product) return fail('Không tìm thấy hàng hóa', 404);
    return ok({ anh: product.anh ?? [] });
  } catch (error: unknown) {
    console.error('[API StoreProducts/anh] GET error:', error);
    return fail(error instanceof Error ? error.message : 'Lỗi máy chủ');
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { anh } = (await request.json()) as { anh?: unknown };
    if (!laDanhSachTepHopLe(anh)) return fail('Dữ liệu không hợp lệ (cần anh[])', 400);

    const daCo = await prisma.storeProduct.findUnique({ where: { id }, select: { id: true } });
    if (!daCo) return fail('Không tìm thấy hàng hóa', 404);

    const anhDaiDien = await taoAnhDaiDien(anh[0]?.duLieu);
    await prisma.storeProduct.update({
      where: { id },
      data: { anh: anh as object[], anhMeta: rutGonMeta(anh) as object[], anhDaiDien },
      // Không có `select`, Prisma sinh `RETURNING *` — kéo ngược cả ảnh vừa ghi về chỉ để vứt đi.
      select: { id: true },
    });

    return ok({ anh: khoiPhucTuMeta(rutGonMeta(anh)), anhDaiDien });
  } catch (error: unknown) {
    console.error('[API StoreProducts/anh] PUT error:', error);
    return fail(error instanceof Error ? error.message : 'Lỗi máy chủ');
  }
}
