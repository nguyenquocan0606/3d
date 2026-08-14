import { NextResponse } from 'next/server';
import { FilamentService } from '@/services/filament.service';
import prisma from '@/utils/db';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
      id, 
      filamentId, 
      locationId,
      printerId,
      type, 
      colorName, 
      colorHex, 
      brand, 
      initialWeightG, 
      emptySpoolWeightG, 
      remainingWeightG, 
      status 
    } = body;

    if (!id || initialWeightG === undefined || remainingWeightG === undefined) {
      return NextResponse.json(
        {
          status: 'error',
          data: null,
          message: 'Các trường id, initialWeightG, remainingWeightG là bắt buộc',
          error: { code: 'VALIDATION_ERROR', details: 'Missing required fields' },
        },
        { status: 400 }
      );
    }

    if (!filamentId && (!type || !colorName)) {
      return NextResponse.json(
        {
          status: 'error',
          data: null,
          message: 'filamentId hoặc bộ thông tin nhựa (loại nhựa & tên màu sắc) là bắt buộc',
          error: { code: 'VALIDATION_ERROR', details: 'Missing filament identifiers' },
        },
        { status: 400 }
      );
    }

    const result = await FilamentService.createSpoolUnified({
      id,
      filamentId,
      locationId,
      printerId,
      type,
      colorName,
      colorHex,
      brand,
      initialWeightG: parseFloat(initialWeightG),
      emptySpoolWeightG: emptySpoolWeightG ? parseFloat(emptySpoolWeightG) : undefined,
      remainingWeightG: parseFloat(remainingWeightG),
      status,
    });


    if (result.success) {
      const spoolWithFilament = await prisma.spool.findUnique({
        where: { id: result.data.id },
        include: { filament: true, location: true },
      });

      return NextResponse.json({
        status: 'success',
        data: spoolWithFilament || result.data,
        message: 'Thêm cuộn nhựa mới thành công',
      });
    } else {
      return NextResponse.json(
        {
          status: 'error',
          data: null,
          message: result.error,
          error: { code: 'BAD_REQUEST', details: result.error },
        },
        { status: 400 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        data: null,
        message: 'Dữ liệu yêu cầu không hợp lệ',
        error: { code: 'BAD_REQUEST', details: error instanceof Error ? error.message : 'Unknown' },
      },
      { status: 400 }
    );
  }
}
