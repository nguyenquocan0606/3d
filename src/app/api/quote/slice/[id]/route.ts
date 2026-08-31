import prisma from '@/utils/db';
import { ok, fail } from '@/utils/api-response';

/** GET /api/quote/slice/[id] — client poll trạng thái slice thật (pending/done/failed). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const quote = await prisma.quote.findUnique({ where: { id } });
    if (!quote) return fail('Không tìm thấy quote', 404);
    return ok(quote);
  } catch (error: unknown) {
    return fail(error instanceof Error ? error.message : 'Lỗi máy chủ');
  }
}
