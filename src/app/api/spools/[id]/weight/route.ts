import { NextResponse } from 'next/server';
import { FilamentService } from '@/services/filament.service';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { remainingWeightG } = body;

    if (!id || remainingWeightG === undefined) {
      return NextResponse.json(
        {
          status: 'error',
          data: null,
          message: 'ID cuộn nhựa và khối lượng còn lại là bắt buộc',
          error: { code: 'VALIDATION_ERROR', details: 'Missing ID or remainingWeightG' },
        },
        { status: 400 }
      );
    }

    const result = await FilamentService.updateSpoolWeight(id, parseFloat(remainingWeightG));
    if (result.success) {
      return NextResponse.json({
        status: 'success',
        data: result.data,
        message: 'Cập nhật lượng nhựa còn lại thành công',
      });
    } else {
      return NextResponse.json(
        {
          status: 'error',
          data: null,
          message: result.error,
          error: { code: 'BAD_REQUEST', details: result.error },
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
