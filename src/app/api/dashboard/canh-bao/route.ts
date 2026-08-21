import { NextResponse } from 'next/server';
import { layCanhBao } from '@/services/dashboard.service';

/**
 * GET /api/dashboard/canh-bao
 *
 * Trả danh sách cảnh báo hiện tại (C1–C20). Poll 30s từ client.
 * Cache 10s — nhẹ nhất trong 4 endpoint, nhưng cũng không nên hit DB mỗi giây.
 */
export async function GET() {
  try {
    const data = await layCanhBao();
    return NextResponse.json(
      { status: 'success', data },
      {
        headers: {
          'Cache-Control': 'private, max-age=10',
        },
      }
    );
  } catch (err) {
    console.error('[Dashboard/canh-bao] Lỗi:', err);
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
