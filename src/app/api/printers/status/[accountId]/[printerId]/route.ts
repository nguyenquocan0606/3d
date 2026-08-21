import { NextResponse } from 'next/server';
import { printerManager } from '@/services/printer-integration/PrinterManager';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ accountId: string; printerId: string }> }
) {
  try {
    const resolvedParams = await params;
    // Lưu ý: printerId ở đây là mã định danh từ Anycubic Cloud, không phải ID trong database
    const status = printerManager.getStatus(resolvedParams.accountId, resolvedParams.printerId);

    if (!status) {
      return NextResponse.json({ status: 'error', message: 'Không tìm thấy trạng thái máy in trên Cloud' }, { status: 404 });
    }

    return NextResponse.json({ status: 'success', data: status });
  } catch (error) {
    console.error('[API Printer Status] Error:', error);
    return NextResponse.json({ status: 'error', message: (error instanceof Error ? error.message : 'Internal Server Error') }, { status: 500 });
  }
}
