import { NextResponse } from 'next/server';
import prisma from '@/utils/db';
import { printerManager } from '@/services/printer-integration/PrinterManager';

/**
 * GET /api/printers/cloud/discover?accountId=xxx
 * Lấy danh sách máy in hiện có trên 1 tài khoản Cloud đã kết nối sẵn (không cần nhập
 * lại URL/token) — dùng cho chức năng "Pair máy in" khi chỉ muốn ghép thêm 1 máy mới.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');

    if (!accountId) {
      return NextResponse.json({ status: 'error', message: 'Thiếu accountId' }, { status: 400 });
    }

    const account = await prisma.cloudAccount.findUnique({ where: { id: accountId } });
    if (!account) {
      return NextResponse.json({ status: 'error', message: 'Không tìm thấy tài khoản Cloud' }, { status: 404 });
    }

    const provider = await printerManager.getProviderAsync(accountId);
    if (!provider) {
      return NextResponse.json({ status: 'error', message: 'Không thể kết nối tới tài khoản Cloud này' }, { status: 502 });
    }

    let cloudPrinters: any[] = [];
    try {
      cloudPrinters = await provider.fetchPrinters();
    } catch (error: any) {
      return NextResponse.json({ status: 'error', message: 'Không lấy được danh sách máy in: ' + error.message }, { status: 502 });
    }

    const existingPrinters = await prisma.printer.findMany({
      where: { cloudAccountId: account.id },
    });

    const cloudPrintersWithMapping = cloudPrinters.map((cp: any) => {
      const linked = existingPrinters.find((p) => p.cloudPrinterId === cp.id.toString());
      return {
        ...cp,
        linkedLocalId: linked ? linked.id : null,
      };
    });

    return NextResponse.json({
      status: 'success',
      data: {
        accountId: account.id,
        provider: account.provider,
        cloudPrinters: cloudPrintersWithMapping,
      },
    });
  } catch (error: any) {
    console.error('[API Cloud Discover] Error:', error);
    return NextResponse.json({ status: 'error', message: 'Lỗi server' }, { status: 500 });
  }
}
