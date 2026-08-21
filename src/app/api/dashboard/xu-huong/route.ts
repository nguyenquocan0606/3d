import { NextRequest, NextResponse } from 'next/server';
import { layXuHuong } from '@/services/dashboard.service';
import { boNhoDem } from '@/utils/bo-nho-dem';

/** TTL cache 5 phút — xu hướng ít thay đổi hơn */
const TTL_MS = 5 * 60 * 1000;

/**
 * GET /api/dashboard/xu-huong?days=30
 *
 * Chuỗi thời gian + bảng xếp hạng §4.3. Cache 5 phút.
 * Không phải thiếu ngày → endpoint trả chuỗi đủ ngày (kể cả ngày rỗng = 0 / null).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const daysRaw = searchParams.get('days') ?? '30';
  const soNgay = Math.min(Math.max(parseInt(daysRaw, 10) || 30, 7), 90);

  try {
    const data = await boNhoDem(
      `dashboard:xu-huong:${soNgay}`,
      TTL_MS,
      () => layXuHuong(soNgay),
    );

    return NextResponse.json({ status: 'success', data });
  } catch (err) {
    console.error('[Dashboard/xu-huong] Lỗi:', err);
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
