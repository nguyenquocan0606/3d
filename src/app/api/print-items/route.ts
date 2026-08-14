import { NextResponse } from 'next/server';
import prisma from '@/utils/db';

export async function GET() {
  try {
    const items = await prisma.printItem.findMany({
      include: {
        product: {
          include: {
            order: true
          }
        },
        peiSheet: true,
        printer: true
      },
      orderBy: { createdAt: 'desc' }
    });
    
    return NextResponse.json({ status: 'success', data: items });
  } catch (error: any) {
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}
