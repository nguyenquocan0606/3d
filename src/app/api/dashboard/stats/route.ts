import { NextResponse } from 'next/server';
import { FilamentService } from '@/services/filament.service';

export async function GET() {
  const result = await FilamentService.getDashboardStats();
  if (result.success) {
    return NextResponse.json({
      status: 'success',
      data: result.data,
      message: 'Lấy dữ liệu Dashboard thành công',
    });
  } else {
    return NextResponse.json(
      {
        status: 'error',
        data: null,
        message: result.error,
        error: { code: 'DATABASE_ERROR', details: result.error },
      },
      { status: 500 }
    );
  }
}
