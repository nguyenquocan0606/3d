import { NextResponse } from 'next/server';
import prisma from '@/utils/db';
import { MoonrakerProvider } from '@/services/printer-integration/providers/moonraker';
import { printerManager } from '@/services/printer-integration/PrinterManager';

export async function POST(request: Request) {
  try {
    const { url, apiKey, reset } = await request.json();

    if (!url) {
      return NextResponse.json({ status: 'error', message: 'URL is required' }, { status: 400 });
    }

    // 1. Check connection and fetch printer info via MoonrakerProvider
    const tempProvider = new MoonrakerProvider(url);
    
    let cloudPrinters: any[] = [];
    try {
      await tempProvider.connect();
      cloudPrinters = await tempProvider.fetchPrinters();
    } catch (error: any) {
      return NextResponse.json({ status: 'error', message: 'Cannot connect to Moonraker: ' + error.message }, { status: 401 });
    }

    // 2. Save to DB
    let account = await prisma.cloudAccount.findFirst({
      where: {
        provider: 'moonraker',
        email: url // Use email to store URL
      }
    });

    let isExistingAccount = false;
    if (account) {
      if (reset) {
        // Disconnect old provider
        printerManager.removeProvider(account.id);
        await prisma.cloudAccount.delete({ where: { id: account.id } });
        
        account = await prisma.cloudAccount.create({
          data: {
            provider: 'moonraker',
            email: url,
            token: apiKey || ''
          }
        });
      } else {
        isExistingAccount = true;
        account = await prisma.cloudAccount.update({
          where: { id: account.id },
          data: { token: apiKey || '', isActive: true }
        });
      }
    } else {
      account = await prisma.cloudAccount.create({
        data: {
          provider: 'moonraker',
          email: url,
          token: apiKey || ''
        }
      });
    }

    const existingPrinters = await prisma.printer.findMany({
      where: { cloudAccountId: account.id }
    });

    const cloudPrintersWithMapping = cloudPrinters.map((cp: any) => {
      const linked = existingPrinters.find(p => p.cloudPrinterId === cp.id.toString());
      return {
        ...cp,
        linkedLocalId: linked ? linked.id : null
      };
    });

    // 3. Register real provider
    const realProvider = new MoonrakerProvider(url);
    printerManager.registerProvider(account.id, realProvider);
    
    realProvider.connect().catch(async (err: any) => {
      console.error(`[API Moonraker] Connect failed in background for ${url}:`, err);
      await prisma.cloudAccount.update({ where: { id: account.id }, data: { isActive: false } }).catch(() => {});
    });

    return NextResponse.json({ 
      status: 'success',
      data: {
        accountId: account.id,
        email: account.email,
        isExistingAccount,
        cloudPrinters: cloudPrintersWithMapping
      } 
    });

  } catch (error: any) {
    console.error('[API Moonraker Login] Error:', error);
    return NextResponse.json({ status: 'error', message: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
