import { NextResponse } from 'next/server';
import { guiDi } from '@/services/thong-bao.service';
import { quetMotLuot } from '@/services/printer-monitor.service';

/**
 * POST /api/thong-bao/thu — gửi một thông báo thử qua đúng đường đi thật (cùng cài đặt, cùng kênh).
 *
 * Body `{ quetLuon: true }` thì quét trạng thái máy in ngay một lượt thay vì chờ chu kỳ — tiện lúc
 * vừa sửa cấu hình và muốn thấy kết quả liền.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { quetLuon?: boolean };

    if (body.quetLuon) {
      await quetMotLuot();
    }

    const ketQua = await guiDi({
      loai: 'thu',
      mucDo: 'loi', // dùng mức cao nhất để thử luôn cả đường Zalo dù ngưỡng đang đặt thế nào
      tieuDe: '🔔 Thử thông báo',
      noiDung: 'Nếu bạn đọc được dòng này thì thông báo máy in đã chạy đúng.',
      duLieu: { loai: 'thu' },
    });

    if (!ketQua.daGui) {
      return NextResponse.json({
        status: 'error',
        message: ketQua.loiGui || 'Không kênh nào nhận được. Kiểm tra lại cài đặt.',
      });
    }

    return NextResponse.json({ status: 'success', data: ketQua });
  } catch (error) {
    console.error('[API Thông báo] Lỗi gửi thử:', error);
    return NextResponse.json({ status: 'error', message: 'Không gửi được thông báo thử.' }, { status: 500 });
  }
}
