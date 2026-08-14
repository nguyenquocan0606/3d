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
        message: 'Thiếu ID loại nhựa',
        error: { code: 'VALIDATION_ERROR', details: 'Missing ID' },
      },
      { status: 400 }
    );
  }

  const result = await FilamentService.deleteFilament(id);
  if (result.success) {
    return NextResponse.json({
      status: 'success',
      data: true,
      message: 'Xóa loại nhựa thành công',
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
