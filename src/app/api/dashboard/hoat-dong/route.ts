import { NextRequest, NextResponse } from 'next/server';
import { layHoatDong } from '@/services/dashboard.service';
import { boNhoDem } from '@/utils/bo-nho-dem';

/** Cache 30s — feed hoạt động */
const TTL_MS = 30 * 1000;

/**
 * GET /api/dashboard/hoat-dong?limit=30
 *
 * Feed hoạt động gần đây §4.4: trộn 5 nguồn, sắp theo thời gian giảm dần.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limitRaw = searchParams.get('limit') ?? '30';
  const limit = Math.min(Math.max(parseInt(limitRaw, 10) || 30, 5), 100);

  try {
    const data = await boNhoDem(
      `dashboard:hoat-dong:${limit}`,
      TTL_MS,
      () => layHoatDong(limit),
    );

    return NextResponse.json({ status: 'success', data });
  } catch (err) {
    console.error('[Dashboard/hoat-dong] Lỗi:', err);
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
