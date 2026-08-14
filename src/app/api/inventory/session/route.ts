import { NextResponse } from 'next/server';
import { InventoryService } from '@/services/inventory.service';

export async function GET() {
  const result = await InventoryService.getActiveSession();
  if (result.success) {
    return NextResponse.json({
      status: 'success',
      data: result.data,
      message: 'Lấy phiên kiểm kho thành công',
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

export async function DELETE() {
  const result = await InventoryService.resetSession();
  if (result.success) {
    return NextResponse.json({
      status: 'success',
      data: result.data,
      message: 'Làm mới phiên kiểm kho thành công',
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
