import { NextResponse } from 'next/server';
import prisma from '@/utils/db';
import { BambuLabProvider } from '@/services/printer-integration/providers/bambulab';
import { printerManager } from '@/services/printer-integration/PrinterManager';

export async function POST(request: Request) {
  try {
    const { url, apiKey, reset } = await request.json();

    if (!url || !apiKey) {
      return NextResponse.json({ status: 'error', message: 'URL and API Key are required' }, { status: 400 });
    }

    // 1. Dùng BambuLabProvider để kiểm tra kết nối và lấy danh sách máy in
    const tempProvider = new BambuLabProvider(url, apiKey);
    
    let cloudPrinters: any[] = [];
    try {
      cloudPrinters = await tempProvider.fetchPrinters();
    } catch (error: any) {
      return NextResponse.json({ status: 'error', message: 'Cannot connect to Bambuddy: ' + error.message }, { status: 401 });
    }

    if (cloudPrinters.length === 0) {
      // It's possible there are no connected printers, but connection was successful.
      console.log('[BambuLab Login] Connected to Bambuddy but no connected printers found.');
    }

    // 2. Lưu vào DB
    let account = await prisma.cloudAccount.findFirst({
      where: {
        provider: 'bambulab',
        email: url // We use email field to store the URL for bambulab
      }
    });

    let isExistingAccount = false;
    if (account) {
      if (reset) {
        // Disconnect old provider
        printerManager.removeProvider(account.id);
        // Delete the account (Printers' cloudAccountId will be set to null due to onDelete: SetNull)
        await prisma.cloudAccount.delete({ where: { id: account.id } });
        
        // Create new account
        account = await prisma.cloudAccount.create({
          data: {
            provider: 'bambulab',
            email: url,
            token: apiKey
          }
        });
      } else {
        isExistingAccount = true;
        account = await prisma.cloudAccount.update({
          where: { id: account.id },
          data: { token: apiKey, isActive: true }
        });
      }
    } else {
      account = await prisma.cloudAccount.create({
        data: {
          provider: 'bambulab',
          email: url,
          token: apiKey
        }
      });
    }

    // Lấy danh sách máy in đã được liên kết
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

    // 3. Khởi tạo và đăng ký Provider thực sự với PrinterManager
    const realProvider = new BambuLabProvider(url, apiKey);
    printerManager.registerProvider(account.id, realProvider);
    
    realProvider.connect().catch(async (err: any) => {
      console.error(`[API BambuLab] Connect failed in background for ${url}:`, err);
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
    console.error('[API BambuLab Login] Error:', error);
    return NextResponse.json({ status: 'error', message: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
