import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/utils/db';
import { printerManager } from '@/services/printer-integration/PrinterManager';

export async function POST(req: NextRequest) {
  try {
    const { printerId, amsId, trayId, type, colorHex } = await req.json();

    if (!printerId || amsId === undefined || trayId === undefined || !type || !colorHex) {
      return NextResponse.json({ status: 'error', message: 'Thiếu thông số bắt buộc' }, { status: 400 });
    }

    // Lấy thông tin cloudAccountId từ DB
    const printerRow = await prisma.printer.findUnique({
      where: { id: printerId }
    });

    if (!printerRow || !printerRow.cloudAccountId || !printerRow.cloudPrinterId) {
      return NextResponse.json({ status: 'error', message: 'Không tìm thấy tài khoản cloud cho máy in này' }, { status: 404 });
    }

    const success = await printerManager.setFilamentAsync(
      printerRow.cloudAccountId,
      printerRow.cloudPrinterId, // ID thực tế trên Cloud
      amsId,
      trayId,
      type,
      colorHex
    );

    if (success) {
      return NextResponse.json({ status: 'success' });
    } else {
      // Return a hint if it failed (likely because it's Anycubic which doesn't support it yet)
      return NextResponse.json({ status: 'error', message: 'Lệnh cấu hình không được hỗ trợ bởi thiết bị hoặc nhà cung cấp này.' }, { status: 400 });
    }

  } catch (error: any) {
    console.error('Lỗi khi set filament:', error);
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}
