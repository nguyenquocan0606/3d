import { NextResponse } from 'next/server';
import { PrinterService } from '@/services/printer.service';

/**
 * PUT /api/printers/[id] - Cập nhật thông tin máy in
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const result = await PrinterService.updatePrinter(id, body);

    if (result.success) {
      return NextResponse.json({ status: 'success', data: result.data });
    }

    return NextResponse.json(
      { status: 'error', message: result.error },
      { status: 400 }
    );
  } catch {
    return NextResponse.json(
      { status: 'error', message: 'Dữ liệu không hợp lệ' },
      { status: 400 }
    );
  }
}

/**
 * DELETE /api/printers/[id] - Xóa máy in
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await PrinterService.deletePrinter(id);

  if (result.success) {
    return NextResponse.json({ status: 'success', data: true });
  }

  return NextResponse.json(
    { status: 'error', message: result.error },
    { status: 400 }
  );
}
