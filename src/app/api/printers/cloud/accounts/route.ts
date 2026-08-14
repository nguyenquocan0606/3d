import { NextResponse } from 'next/server';
import prisma from '@/utils/db';

/**
 * GET /api/printers/cloud/accounts - Danh sách tài khoản Cloud đã kết nối
 * (dùng cho chức năng "Pair máy in" — không trả token về client)
 */
export async function GET() {
  try {
    const accounts = await prisma.cloudAccount.findMany({
      where: { isActive: true },
      select: { id: true, provider: true, email: true },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({ status: 'success', data: accounts });
  } catch (error: any) {
    console.error('[API Cloud Accounts] Error:', error);
    return NextResponse.json({ status: 'error', message: 'Lỗi server' }, { status: 500 });
  }
}
