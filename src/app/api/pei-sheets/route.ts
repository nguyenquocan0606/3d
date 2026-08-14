import { NextResponse } from 'next/server';
import prisma from '@/utils/db';

export async function GET() {
  try {
    const sheets = await prisma.peiSheet.findMany({
      include: {
        items: true,
        printer: true
      },
      orderBy: { createdAt: 'desc' }
    });
    return NextResponse.json({ status: 'success', data: sheets });
  } catch (error: any) {
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { name } = await req.json();
    const sheet = await prisma.peiSheet.create({
      data: { name }
    });
    return NextResponse.json({ status: 'success', data: sheet });
  } catch (error: any) {
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}
