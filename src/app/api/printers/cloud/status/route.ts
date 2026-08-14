import { NextResponse } from 'next/server';
import prisma from '@/utils/db';
import { printerManager } from '@/services/printer-integration/PrinterManager';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const printerId = searchParams.get('printerId'); 

    if (printerId) {
      // Lookup single printer
      const printer = await prisma.printer.findUnique({
        where: { id: printerId }
      });

      if (!printer || !printer.cloudAccountId || !printer.cloudPrinterId) {
        return NextResponse.json({ status: 'error', message: 'Printer is not linked to Cloud' }, { status: 400 });
      }

      const status = await printerManager.getStatusAsync(printer.cloudAccountId, printer.cloudPrinterId);
      return NextResponse.json({ status: 'success', data: status || { status: 'offline' } });
    }

    // Lookup all linked printers
    const linkedPrinters = await prisma.printer.findMany({
      where: { cloudAccountId: { not: null }, cloudPrinterId: { not: null } }
    });

    // Lấy status tất cả máy in song song thay vì tuần tự
    const results: Record<string, any> = {};
    await Promise.all(
      linkedPrinters.map(async (prt) => {
        if (prt.cloudAccountId && prt.cloudPrinterId) {
          const st = await printerManager.getStatusAsync(prt.cloudAccountId, prt.cloudPrinterId);
          results[prt.id] = st || { status: 'offline' };
        }
      })
    );

    return NextResponse.json({ status: 'success', data: results });

  } catch (error: any) {
    console.error('[API Cloud Status] Error:', error);
    return NextResponse.json({ status: 'error', message: 'Internal Server Error' }, { status: 500 });
  }
}
