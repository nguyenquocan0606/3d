import { NextResponse } from 'next/server';
import prisma from '@/utils/db';
import { ghiBiaMo } from '@/services/sync.service';
import { baoThayDoi } from '@/services/sync-notify.service';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const item = await prisma.printItem.findUnique({
      where: { id },
      include: {
        product: {
          include: {
            order: true
          }
        }
      }
    });
    if (!item) return NextResponse.json({ status: 'error', message: 'Không tìm thấy tem' }, { status: 404 });
    return NextResponse.json({ status: 'success', data: item });
  } catch (error: any) {
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { status, peiSheetId, printerId, isChecked } = body;

    const item = await prisma.printItem.update({
      where: { id },
      data: {
        ...(status !== undefined && { status }),
        ...(peiSheetId !== undefined && { peiSheetId }),
        ...(printerId !== undefined && { printerId }),
        ...(isChecked !== undefined && { isChecked }),
      }
    });

    return NextResponse.json({ status: 'success', data: item });
  } catch (error: any) {
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.printItem.delete({
      where: { id }
    });
    await ghiBiaMo('printItems', id);
    void baoThayDoi(['printItems']);
    return NextResponse.json({ status: 'success' });
  } catch (error: any) {
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}
