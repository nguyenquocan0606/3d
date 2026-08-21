import { ok, fail } from '@/utils/api-response';
import { gomNhuCauIn } from '@/services/eshop.service';

/**
 * POST /api/eshop/demand — gom nhu cầu in của các đơn được chọn.
 * Body: { orderIds: string[] }
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { orderIds?: string[] };
    const orderIds = Array.isArray(body.orderIds) ? body.orderIds.filter((id) => typeof id === 'string') : [];

    if (orderIds.length === 0) return fail('Chưa chọn đơn nào để gom nhu cầu in', 400);

    return ok(await gomNhuCauIn(orderIds));
  } catch (error: unknown) {
    return fail(error instanceof Error ? error.message : 'Lỗi máy chủ');
  }
}
