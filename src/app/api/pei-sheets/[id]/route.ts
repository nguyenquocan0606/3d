import { NextResponse } from 'next/server';
import prisma from '@/utils/db';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { name, printerId } = await req.json();

    const sheet = await prisma.peiSheet.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(printerId !== undefined && { printerId }),
      }
    });

    return NextResponse.json({ status: 'success', data: sheet });
  } catch (error: any) {
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.peiSheet.delete({
      where: { id }
    });
    return NextResponse.json({ status: 'success' });
  } catch (error: any) {
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}
