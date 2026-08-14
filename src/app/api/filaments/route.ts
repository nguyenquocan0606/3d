import { NextResponse } from 'next/server';
import { FilamentService } from '@/services/filament.service';

export async function GET() {
  const result = await FilamentService.getFilaments();
  if (result.success) {
    return NextResponse.json({
      status: 'success',
      data: result.data,
      message: 'Lấy danh sách nhựa thành công',
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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { type, colorName, colorHex, brand } = body;

    if (!type || !colorName) {
      return NextResponse.json(
        {
          status: 'error',
          data: null,
          message: 'Loại nhựa và màu sắc là bắt buộc',
          error: { code: 'VALIDATION_ERROR', details: 'Missing type or colorName' },
        },
        { status: 400 }
      );
    }

    const result = await FilamentService.createFilament({ type, colorName, colorHex, brand });
    if (result.success) {
      return NextResponse.json({
        status: 'success',
        data: result.data,
        message: 'Tạo loại nhựa mới thành công',
      });
    } else {
      return NextResponse.json(
        {
          status: 'error',
          data: null,
          message: result.error,
          error: { code: 'ALREADY_EXISTS', details: result.error },
        },
        { status: 400 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        data: null,
        message: 'Dữ liệu yêu cầu không hợp lệ',
        error: { code: 'BAD_REQUEST', details: error instanceof Error ? error.message : 'Unknown' },
      },
      { status: 400 }
    );
  }
}
