import { NextRequest, NextResponse } from 'next/server';
import { layTongQuan } from '@/services/dashboard.service';
import { boNhoDem } from '@/utils/bo-nho-dem';

/** TTL cache theo range — §7.4 */
const TTL_MS = 60 * 1000; // 60 giây

const RANGE_HOP_LE = new Set(['today', '7d', '30d']);

/**
 * GET /api/dashboard/tong-quan?range=today|7d|30d
 *
 * Toàn bộ KPI §4.2 (trừ máy in realtime). Cache 60s theo range.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rangeRaw = searchParams.get('range') ?? 'today';

  if (!RANGE_HOP_LE.has(rangeRaw)) {
    return NextResponse.json(
      { status: 'error', message: 'range phải là today | 7d | 30d' },
      { status: 400 }
    );
  }

  const range = rangeRaw as 'today' | '7d' | '30d';

  try {
    const data = await boNhoDem(
      `dashboard:tong-quan:${range}`,
      TTL_MS,
      () => layTongQuan(range),
    );

    return NextResponse.json({ status: 'success', data });
  } catch (err) {
    console.error('[Dashboard/tong-quan] Lỗi:', err);
    return NextResponse.json(
      {
        status: 'error',
        data: null,
        message: err instanceof Error ? err.message : 'Lỗi không xác định',
      },
      { status: 500 }
    );
  }
}
