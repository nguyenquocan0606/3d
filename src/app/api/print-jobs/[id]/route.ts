import { NextResponse } from 'next/server';
import prisma from '@/utils/db';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status } = body;

    if (!id || !status) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Thiếu ID hoặc trạng thái',
        },
        { status: 400 }
      );
    }

    const job = await prisma.printJob.update({
      where: { id },
      data: { status },
    });

    return NextResponse.json({
      status: 'success',
      data: job,
      message: 'Cập nhật trạng thái in thành công',
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message: 'Lỗi khi cập nhật lệnh in',
        error: error instanceof Error ? error.message : 'Unknown',
      },
      { status: 500 }
    );
  }
}
