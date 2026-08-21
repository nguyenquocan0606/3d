import { NextResponse } from 'next/server';
import prisma from '@/utils/db';
import { printerManager } from '@/services/printer-integration/PrinterManager';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { printerId, action, value } = body;

    if (!printerId || !action) {
      return NextResponse.json({ status: 'error', message: 'Thiếu printerId hoặc action' }, { status: 400 });
    }

    console.log(`[API Cloud Control] Received request: printerId=${printerId}, action=${action}, value=${JSON.stringify(value)}`);

    const printer = await prisma.printer.findUnique({
      where: { id: printerId }
    });

    if (!printer || !printer.cloudAccountId || !printer.cloudPrinterId) {
      console.log(`[API Cloud Control] Printer not found or not connected to cloud`);
      return NextResponse.json({ status: 'error', message: 'Máy in chưa được kết nối Cloud' }, { status: 400 });
    }

    console.log(`[API Cloud Control] Found printer in DB. accountId=${printer.cloudAccountId}, cloudPrinterId=${printer.cloudPrinterId}`);

    const success = await printerManager.sendCommandAsync(printer.cloudAccountId, printer.cloudPrinterId, action, value);
    
    console.log(`[API Cloud Control] sendCommandAsync returned: ${success}`);

    if (success) {
      return NextResponse.json({ status: 'success', message: `Lệnh ${action} đã được gửi thành công` });
    } else {
      return NextResponse.json({ status: 'error', message: `Gửi lệnh ${action} thất bại` }, { status: 500 });
    }

  } catch (error) {
    console.error('[API Cloud Control] Error:', error);
    return NextResponse.json({ status: 'error', message: 'Lỗi server' }, { status: 500 });
  }
}
