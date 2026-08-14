import { NextResponse } from 'next/server';
import { LocationService } from '@/services/location.service';

export async function GET() {
  const result = await LocationService.getLocations();
  if (result.success) {
    return NextResponse.json({
      status: 'success',
      data: result.data,
      message: 'Lấy danh sách kho thành công',
    });
  } else {
    return NextResponse.json(
      {
        status: 'error',
        data: null,
        message: result.error,
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, name } = body;

    if (!id || !name) {
      return NextResponse.json(
        {
          status: 'error',
          data: null,
          message: 'Mã ID kho và tên kho là bắt buộc',
        },
        { status: 400 }
      );
    }

    const result = await LocationService.createLocation(id, name);
    if (result.success) {
      return NextResponse.json({
        status: 'success',
        data: result.data,
        message: 'Tạo kho mới thành công',
      });
    } else {
      return NextResponse.json(
        {
          status: 'error',
          data: null,
          message: result.error,
        },
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json(
      {
        status: 'error',
        data: null,
        message: 'Dữ liệu yêu cầu không hợp lệ',
      },
      { status: 400 }
    );
  }
}
