import { NextResponse } from 'next/server';
import prisma from '@/utils/db';

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { itemIds, status, printerId } = body;

    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      return NextResponse.json({ status: 'error', message: 'Không có item nào được chọn' }, { status: 400 });
    }

    const dataToUpdate: any = {};
    if (status !== undefined) dataToUpdate.status = status;
    if (printerId !== undefined) dataToUpdate.printerId = printerId;

    if (Object.keys(dataToUpdate).length === 0) {
      return NextResponse.json({ status: 'error', message: 'Không có dữ liệu cập nhật' }, { status: 400 });
    }

    const result = await prisma.printItem.updateMany({
      where: {
        id: { in: itemIds }
      },
      data: dataToUpdate
    });

    return NextResponse.json({ status: 'success', data: result });
  } catch (error: any) {
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}
