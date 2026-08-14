import { NextResponse } from 'next/server';
import { FilamentService } from '@/services/filament.service';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json(
      {
        status: 'error',
        data: null,
        message: 'Thiếu ID cuộn nhựa',
        error: { code: 'VALIDATION_ERROR', details: 'Missing ID' },
      },
      { status: 400 }
    );
  }

  const result = await FilamentService.deleteSpool(id);
  if (result.success) {
    return NextResponse.json({
      status: 'success',
      data: true,
      message: 'Xóa cuộn nhựa thành công',
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

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { newId, brand, locationId, printerId, printerSlot, initialWeightG, emptySpoolWeightG, remainingWeightG, status } = body;

    if (!id) {
      return NextResponse.json(
        {
          status: 'error',
          data: null,
          message: 'Thiếu ID cuộn nhựa',
          error: { code: 'VALIDATION_ERROR', details: 'Missing ID' },
        },
        { status: 400 }
      );
    }

    const result = await FilamentService.updateSpool(id, {
      id: newId,
      brand,
      locationId: locationId !== undefined ? locationId : undefined,
      printerId: printerId !== undefined ? printerId : undefined,
      printerSlot: printerSlot !== undefined ? printerSlot : undefined,
      initialWeightG: initialWeightG !== undefined ? parseFloat(initialWeightG) : undefined,
      emptySpoolWeightG: emptySpoolWeightG !== undefined ? parseFloat(emptySpoolWeightG) : undefined,
      remainingWeightG: remainingWeightG !== undefined ? parseFloat(remainingWeightG) : undefined,
      status,
    });

    if (result.success) {
      return NextResponse.json({
        status: 'success',
        data: result.data,
        message: 'Cập nhật cuộn nhựa thành công',
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
