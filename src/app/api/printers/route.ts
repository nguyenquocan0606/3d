import { NextResponse } from 'next/server';
import { PrinterService } from '@/services/printer.service';

/**
 * GET /api/printers - Lấy danh sách tất cả máy in
 */
export async function GET() {
  const result = await PrinterService.getPrinters();

  if (result.success) {
    return NextResponse.json({ status: 'success', data: result.data });
  }

  return NextResponse.json(
    { status: 'error', message: result.error },
    { status: 500 }
  );
}

/**
 * POST /api/printers - Tạo máy in mới
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body.id || !body.name) {
      return NextResponse.json(
        { status: 'error', message: 'ID và tên máy in là bắt buộc' },
        { status: 400 }
      );
    }

    const result = await PrinterService.createPrinter(body);

    if (result.success) {
      return NextResponse.json({ status: 'success', data: result.data }, { status: 201 });
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
