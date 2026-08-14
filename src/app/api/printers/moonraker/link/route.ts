import { NextResponse } from 'next/server';
import prisma from '@/utils/db';

export async function POST(request: Request) {
  try {
    const { accountId, mappings } = await request.json();

    if (!accountId || !mappings || !Array.isArray(mappings)) {
      return NextResponse.json({ status: 'error', message: 'Invalid payload' }, { status: 400 });
    }

    // Verify account exists
    const account = await prisma.cloudAccount.findUnique({ where: { id: accountId } });
    if (!account) {
      return NextResponse.json({ status: 'error', message: 'Cloud account not found' }, { status: 404 });
    }

    for (const mapping of mappings) {
      const { cloudPrinterId, cloudPrinterName, localPrinterId, model } = mapping;

      if (localPrinterId === 'NEW') {
        const localId = `PRT-MK-${cloudPrinterId}`;
        await prisma.printer.upsert({
          where: { id: localId },
          update: {
            name: cloudPrinterName || 'Moonraker Printer',
            model: model || 'Klipper Printer',
            cloudAccountId: accountId,
            cloudPrinterId: cloudPrinterId.toString(),
          },
          create: {
            id: localId,
            name: cloudPrinterName || 'Moonraker Printer',
            model: model || 'Klipper Printer',
            status: 'idle',
            cloudAccountId: accountId,
            cloudPrinterId: cloudPrinterId.toString(),
          }
        });
      } else {
        // Link to existing printer
        await prisma.printer.update({
          where: { id: localPrinterId },
          data: {
            cloudAccountId: accountId,
            cloudPrinterId: cloudPrinterId.toString(),
          }
        });
      }
    }

    return NextResponse.json({ status: 'success' });

  } catch (error: any) {
    console.error('[API Moonraker Link] Error:', error);
    return NextResponse.json({ status: 'error', message: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
