import { NextResponse } from 'next/server';
import prisma from '@/utils/db';
import { buildBitmapTSPLCommand, sendToPrinterBinary } from '@/utils/tspl-printer';

/** Kích thước bitmap chuẩn: 320×240 dots, 1-bit/pixel, 40 bytes/dòng */
const EXPECTED_BITMAP_SIZE = 40 * 240; // 9600 bytes

/**
 * POST /api/print-jobs/custom
 * In tem nhãn tùy chỉnh dạng bitmap qua máy in USB XPrinter.
 *
 * Client render label trên canvas 320×240 → chuyển thành bitmap 1-bit →
 * gửi base64 lên đây → server wrap thành lệnh TSPL BITMAP → ghi USB.
 *
 * Ưu điểm: preview = bản in (pixel-perfect), hỗ trợ tiếng Việt đầy đủ dấu.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { bitmapBase64, copies, label } = body;

    if (!bitmapBase64 || typeof bitmapBase64 !== 'string') {
      return NextResponse.json(
        { status: 'error', message: 'Thiếu dữ liệu bitmap (bitmapBase64)' },
        { status: 400 }
      );
    }

    // Decode base64 → Buffer
    const bitmapBuffer = Buffer.from(bitmapBase64, 'base64');

    if (bitmapBuffer.length !== EXPECTED_BITMAP_SIZE) {
      return NextResponse.json(
        {
          status: 'error',
          message: `Kích thước bitmap không hợp lệ: cần ${EXPECTED_BITMAP_SIZE} bytes, nhận ${bitmapBuffer.length} bytes`,
        },
        { status: 400 }
      );
    }

    const validCopies = Math.max(1, Math.min(Number(copies) || 1, 20));

    // Sinh lệnh TSPL BITMAP hoàn chỉnh
    const tsplBuffer = buildBitmapTSPLCommand(bitmapBuffer, validCopies);

    // Gửi trực tiếp tới máy in USB
    let printStatus = 'completed';
    let printError = '';
    try {
      await sendToPrinterBinary(tsplBuffer);
    } catch (err) {
      printStatus = 'failed';
      printError = err instanceof Error ? err.message : 'Lỗi không xác định khi ghi cổng USB';
    }

    // Lưu lệnh in vào DB
    const job = await prisma.printJob.create({
      data: {
        qrCode: 'CUSTOM-BITMAP',
        label: typeof label === 'string' ? label.slice(0, 255) : 'Custom bitmap label',
        status: printStatus,
      },
    });

    if (printStatus === 'failed') {
      return NextResponse.json(
        { status: 'error', data: job, message: `Lỗi khi in tem: ${printError}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      status: 'success',
      data: job,
      message: `Đã in ${validCopies} tem thành công qua máy in USB`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message: 'Lỗi khi tạo lệnh in tùy chỉnh',
        error: error instanceof Error ? error.message : 'Unknown',
      },
      { status: 500 }
    );
  }
}
