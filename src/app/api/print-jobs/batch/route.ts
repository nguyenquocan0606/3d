import { NextResponse } from 'next/server';
import prisma from '@/utils/db';
import { buildOrderBarcodeTSPLCommand, sendToPrinter } from '@/utils/tspl-printer';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { jobs } = body;

    if (!jobs || !Array.isArray(jobs) || jobs.length === 0) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Vui lòng cung cấp danh sách jobs hợp lệ',
        },
        { status: 400 }
      );
    }

    let combinedTSPL = '';
    const dbJobsToCreate = [];

    for (const job of jobs) {
      const { qrCode, labelData } = job;
      if (qrCode && labelData) {
        // Sinh lệnh TSPL cho kích thước tem 40mm x 30mm sử dụng 1D Barcode
        const tsplCommand = buildOrderBarcodeTSPLCommand(qrCode, labelData);
        combinedTSPL += tsplCommand + '\n';
        
        dbJobsToCreate.push({
          qrCode,
          label: JSON.stringify(labelData),
          status: 'pending' // Sẽ cập nhật sau
        });
      }
    }

    if (!combinedTSPL) {
      return NextResponse.json({ status: 'error', message: 'Không có dữ liệu in hợp lệ' }, { status: 400 });
    }

    // Gửi trực tiếp tới máy in USB
    let printStatus = 'completed';
    let printError = '';
    try {
      await sendToPrinter(combinedTSPL);
    } catch (err) {
      printStatus = 'failed';
      printError = err instanceof Error ? err.message : 'Lỗi không xác định khi ghi cổng USB';
    }

    // Lưu các lệnh in vào DB (bulk insert 1 lần)
    const jobsData = dbJobsToCreate.map((data) => ({ ...data, status: printStatus }));
    await prisma.printJob.createMany({ data: jobsData });

    if (printStatus === 'failed') {
      return NextResponse.json(
        {
          status: 'error',
          message: `Lỗi khi in tem: ${printError}`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      status: 'success',
      message: `Đã in thành công ${jobsData.length} tem qua máy in USB`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message: 'Lỗi khi tạo lệnh in hàng loạt',
        error: error instanceof Error ? error.message : 'Unknown',
      },
      { status: 500 }
    );
  }
}
