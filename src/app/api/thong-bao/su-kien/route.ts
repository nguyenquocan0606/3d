import { NextResponse } from 'next/server';
import { layLichSu } from '@/services/thong-bao.service';

/**
 * GET /api/thong-bao/su-kien?limit=100&printerId=...&gio=24
 *
 * Lịch sử hoạt động máy in. Đây là nguồn sự thật — thông báo đẩy có thể trượt (máy hết pin, chưa cài
 * app) nhưng danh sách này thì không mất, nên app và web đều đọc từ đây.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get('limit') || 100);
    const gio = Number(searchParams.get('gio') || 0);

    const suKien = await layLichSu({
      limit: Number.isFinite(limit) && limit > 0 ? limit : 100,
      printerId: searchParams.get('printerId') || undefined,
      tuNgay: gio > 0 ? new Date(Date.now() - gio * 3600_000) : undefined,
    });

    return NextResponse.json({ status: 'success', data: suKien });
  } catch (error) {
    console.error('[API Thông báo] Lỗi đọc lịch sử:', error);
    return NextResponse.json({ status: 'error', message: 'Không đọc được lịch sử sự kiện.' }, { status: 500 });
  }
}
