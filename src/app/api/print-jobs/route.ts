import { NextResponse } from 'next/server';
import prisma from '@/utils/db';
import { buildTSPLCommand, sendToPrinter, LabelData } from '@/utils/tspl-printer';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    let whereClause = {};
    if (status) {
      whereClause = { status };
    }

    const jobs = await prisma.printJob.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json({
      status: 'success',
      data: jobs,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message: 'Lỗi khi lấy danh sách in',
        error: error instanceof Error ? error.message : 'Unknown',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/print-jobs
 * In trực tiếp tem nhãn qua máy in USB XPrinter (/dev/usb/lp0).
 * Nhận qrCode + label (JSON string chứa line1, line2, line3),
 * sinh lệnh TSPL 40x30mm, gửi thẳng tới cổng USB, lưu kết quả vào DB.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { qrCode, label } = body;

    if (!qrCode || !label) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Vui lòng cung cấp qrCode và label',
        },
        { status: 400 }
      );
    }

    // Parse label JSON để lấy 3 dòng text
    let labelData: LabelData;
    try {
      labelData = JSON.parse(label);
    } catch {
      // Fallback nếu label không phải JSON → dùng label thô làm line2
      labelData = { line1: qrCode, line2: label, line3: '' };
    }

    let tsplCommand = '';
    
    // Nếu request yêu cầu layout cho "printerSlot", dùng command riêng (2 trang)
    if (body.layout === 'printerSlot' && body.slotNumber) {
      const { buildPrinterSlotTSPLCommand } = await import('@/utils/tspl-printer');
      tsplCommand = buildPrinterSlotTSPLCommand(qrCode, body.slotNumber);
    } else {
      tsplCommand = buildTSPLCommand(qrCode, labelData);
    }

    // Gửi trực tiếp tới máy in USB
    let printStatus = 'completed';
    let printError = '';
    try {
      await sendToPrinter(tsplCommand);
    } catch (err) {
      printStatus = 'failed';
      printError = err instanceof Error ? err.message : 'Lỗi không xác định khi ghi cổng USB';
    }

    // Lưu lệnh in vào DB (completed hoặc failed)
    const job = await prisma.printJob.create({
      data: {
        qrCode,
        label,
        status: printStatus,
      },
    });

    if (printStatus === 'failed') {
      return NextResponse.json(
        {
          status: 'error',
          data: job,
          message: `Lỗi khi in tem: ${printError}`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      status: 'success',
      data: job,
      message: 'Đã in tem thành công qua máy in USB',
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message: 'Lỗi khi tạo lệnh in',
        error: error instanceof Error ? error.message : 'Unknown',
      },
      { status: 500 }
    );
  }
}
