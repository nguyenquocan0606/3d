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

/**
 * DELETE /api/inventory/scan — hoàn tác lượt quét (nút "Hoàn tác" trên app).
 *
 * Body `{ spoolId }` để bỏ đúng cuộn đó; bỏ trống thì xoá lượt quét gần nhất của
 * phiên — máy PDA bấm nhầm chỉ cần một chạm, khỏi phải nhớ vừa quét con nào.
 */
export async function DELETE(request: Request) {
  try {
    let spoolId: string | undefined;
    try {
      const body = await request.json();
      if (body && typeof body.spoolId === 'string') spoolId = body.spoolId;
    } catch {
      // Không có body — hiểu là hoàn tác lượt gần nhất.
    }

    const result = await InventoryService.unscanSpool(spoolId);
    if (result.success) {
      return NextResponse.json({
        status: 'success',
        data: result.data,
        message: 'Đã hoàn tác lượt quét',
      });
    }
    return NextResponse.json(
      {
        status: 'error',
        data: null,
        message: result.error,
        error: { code: 'UNSCAN_FAILED', details: result.error },
      },
      { status: 400 }
    );
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
