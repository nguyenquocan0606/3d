import { NextResponse } from 'next/server';
import { LocationService } from '@/services/location.service';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name } = body;

    if (!id || !name) {
      return NextResponse.json(
        {
          status: 'error',
          data: null,
          message: 'Thiếu ID kho hoặc tên kho',
        },
        { status: 400 }
      );
    }

    const result = await LocationService.updateLocation(id, name);
    if (result.success) {
      return NextResponse.json({
        status: 'success',
        data: result.data,
        message: 'Cập nhật kho thành công',
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

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        {
          status: 'error',
          data: null,
          message: 'Thiếu ID kho',
        },
        { status: 400 }
      );
    }

    const result = await LocationService.deleteLocation(id);
    if (result.success) {
      return NextResponse.json({
        status: 'success',
        data: true,
        message: 'Xóa kho thành công',
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
        message: 'Lỗi máy chủ',
      },
      { status: 500 }
    );
  }
}
