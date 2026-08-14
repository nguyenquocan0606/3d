import { NextResponse } from 'next/server';
import { MisaService } from '@/services/misa.service';

/**
 * GET /api/misa/credential - Lấy trạng thái credential MISA (đã ẩn token/cookie đầy đủ)
 */
export async function GET() {
  const result = await MisaService.getCredential();

  if (result.success) {
    return NextResponse.json({ status: 'success', data: result.data });
  }

  return NextResponse.json({ status: 'error', message: result.error }, { status: 500 });
}

/**
 * PUT /api/misa/credential - Cập nhật credential MISA (chỉ ghi đè field nào được gửi lên)
 */
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const result = await MisaService.saveCredential(body);

    if (result.success) {
      return NextResponse.json({ status: 'success', data: result.data });
    }

    return NextResponse.json({ status: 'error', message: result.error }, { status: 400 });
  } catch {
    return NextResponse.json({ status: 'error', message: 'Dữ liệu không hợp lệ' }, { status: 400 });
  }
}
