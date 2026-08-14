import { NextResponse } from 'next/server';
import { InventoryService } from '@/services/inventory.service';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { spoolId } = body;

    if (!spoolId) {
      return NextResponse.json(
        {
          status: 'error',
          data: null,
          message: 'Mã cuộn nhựa (spoolId) là bắt buộc',
          error: { code: 'VALIDATION_ERROR', details: 'Missing spoolId' },
        },
        { status: 400 }
      );
    }

    const result = await InventoryService.scanSpool(spoolId);
    if (result.success) {
      return NextResponse.json({
        status: 'success',
        data: result.data,
        message: 'Ghi nhận quét cuộn nhựa thành công',
      });
    } else {
      return NextResponse.json(
        {
          status: 'error',
          data: null,
          message: result.error,
          error: { code: 'SCAN_FAILED', details: result.error },
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
