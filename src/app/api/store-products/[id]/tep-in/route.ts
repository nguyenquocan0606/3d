import prisma from '@/utils/db';
import { ok, fail } from '@/utils/api-response';
import { khoiPhucTuMeta, laDanhSachTepHopLe, rutGonMeta } from '@/utils/tep-dinh-kem';

/**
 * File in (gcode/3mf... base64, có thể vài chục MB) của MỘT hàng hóa.
 *
 * Tách hẳn khỏi /api/store-products vì cả GET lẫn PUT ở đó đều chạy trên TOÀN BỘ cửa hàng:
 * - GET danh sách chỉ trả metadata, dữ liệu gốc tải riêng qua GET route này khi thực sự cần.
 * - PUT ở đây chỉ ghi đúng 1 hàng hóa, nên body = file của riêng hàng đó. Trước kia thêm file phải
 *   gửi kèm cả cửa hàng trong 1 request; qua Cloudflare/nginx (giới hạn ~100 MB) là 413, người dùng
 *   thấy "lưu xong" nhưng F5 thì file biến mất.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const product = await prisma.storeProduct.findUnique({ where: { id }, select: { tepIn: true } });
    if (!product) return fail('Không tìm thấy hàng hóa', 404);
    return ok({ tepIn: product.tepIn ?? [] });
  } catch (error: unknown) {
    console.error('[API StoreProducts/tep-in] GET error:', error);
    return fail(error instanceof Error ? error.message : 'Lỗi máy chủ');
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { tepIn } = (await request.json()) as { tepIn?: unknown };
    if (!laDanhSachTepHopLe(tepIn)) return fail('Dữ liệu không hợp lệ (cần tepIn[])', 400);

    const daCo = await prisma.storeProduct.findUnique({ where: { id }, select: { id: true } });
    if (!daCo) return fail('Không tìm thấy hàng hóa', 404);

    await prisma.storeProduct.update({
      where: { id },
      data: { tepIn: tepIn as object[], tepInMeta: rutGonMeta(tepIn) as object[] },
      // Không có `select`, Prisma sinh `RETURNING *` — kéo ngược cả file vừa ghi về chỉ để vứt đi.
      select: { id: true },
    });

    // Trả lại metadata để client cập nhật danh sách mà không phải tải lại cả cửa hàng.
    return ok({ tepIn: khoiPhucTuMeta(rutGonMeta(tepIn)) });
  } catch (error: unknown) {
    console.error('[API StoreProducts/tep-in] PUT error:', error);
    return fail(error instanceof Error ? error.message : 'Lỗi máy chủ');
  }
}
