import { NextResponse } from 'next/server';
import prisma from '@/utils/db';
import { dangKyThietBi, huyDangKyThietBi } from '@/services/thong-bao.service';

/** GET /api/thong-bao/thiet-bi — danh sách máy đang nhận thông báo (để web xem/gỡ). */
export async function GET() {
  const thietBi = await prisma.thietBiThongBao.findMany({
    orderBy: { lanCuoi: 'desc' },
    // Token là bí mật của thiết bị, không trả ra ngoài; chỉ trả 8 ký tự cuối để phân biệt.
    select: { id: true, nenTang: true, tenMay: true, hoatDong: true, lanCuoi: true, token: true },
  });

  return NextResponse.json({
    status: 'success',
    data: thietBi.map(({ token, ...t }) => ({ ...t, duoiToken: token.slice(-8) })),
  });
}

/**
 * POST /api/thong-bao/thiet-bi — app Flutter gọi mỗi lần mở app và mỗi lần Firebase xoay token.
 * Body: `{ token, nenTang: 'android' | 'ios', tenMay? }`
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { token?: string; nenTang?: string; tenMay?: string };

    if (!body.token || typeof body.token !== 'string') {
      return NextResponse.json({ status: 'error', message: 'Thiếu token thiết bị.' }, { status: 400 });
    }
    if (body.nenTang !== 'android' && body.nenTang !== 'ios') {
      return NextResponse.json({ status: 'error', message: 'nenTang phải là android hoặc ios.' }, { status: 400 });
    }

    const thietBi = await dangKyThietBi({
      token: body.token,
      nenTang: body.nenTang,
      tenMay: body.tenMay ?? null,
    });

    return NextResponse.json({ status: 'success', data: { id: thietBi.id } });
  } catch (error) {
    console.error('[API Thông báo] Lỗi đăng ký thiết bị:', error);
    return NextResponse.json({ status: 'error', message: 'Không đăng ký được thiết bị.' }, { status: 500 });
  }
}

/** DELETE /api/thong-bao/thiet-bi?token=... hoặc ?id=... — gỡ một máy khỏi danh sách nhận. */
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  const id = searchParams.get('id');

  if (token) {
    await huyDangKyThietBi(token);
  } else if (id) {
    await prisma.thietBiThongBao.deleteMany({ where: { id } });
  } else {
    return NextResponse.json({ status: 'error', message: 'Cần token hoặc id.' }, { status: 400 });
  }

  return NextResponse.json({ status: 'success', data: { ok: true } });
}
