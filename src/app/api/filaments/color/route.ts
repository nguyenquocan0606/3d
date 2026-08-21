import { NextResponse } from 'next/server';
import { FilamentService } from '@/services/filament.service';

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { colorName, colorHex } = body;

    if (!colorName || !colorHex) {
      return NextResponse.json({ success: false, error: 'Thiếu colorName hoặc colorHex' }, { status: 400 });
    }

    const result = await FilamentService.updateFilamentColor(colorName, colorHex);
    
    if (result.success) {
      return NextResponse.json({ success: true, data: result.data });
    } else {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }
  } catch (error) {
    console.error('Error in PUT /api/filaments/color:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
