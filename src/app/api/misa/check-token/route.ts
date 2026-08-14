import { NextResponse } from 'next/server';
import { MisaService } from '@/services/misa.service';

/**
 * POST /api/misa/check-token - Ping thử API MISA (chỉ đọc) để kiểm tra Bearer token đã lưu còn dùng được không
 */
export async function POST() {
  const result = await MisaService.checkToken();

  if (result.success) {
    return NextResponse.json({ status: 'success', data: result.data });
  }

  return NextResponse.json({ status: 'error', message: result.error }, { status: 500 });
}
