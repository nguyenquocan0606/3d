import { NextResponse } from 'next/server';
import { NguoiDungService } from '@/services/nguoi-dung.service';
import { VaiTro, taoToken, tuyChonCookie } from '@/utils/auth';
import { fail } from '@/utils/api-response';

export async function POST(request: Request) {
  try {
    const { tenDangNhap, matKhau } = (await request.json()) as { tenDangNhap?: string; matKhau?: string };
    if (!tenDangNhap || !matKhau) return fail('Nhập tên đăng nhập và mật khẩu', 400);

    const nguoiDung = await NguoiDungService.xacThuc(tenDangNhap, matKhau);
    if (!nguoiDung) return fail('Tên đăng nhập hoặc mật khẩu không đúng', 401);

    const token = await taoToken({
      id: nguoiDung.id,
      tenDangNhap: nguoiDung.tenDangNhap,
      hoTen: nguoiDung.hoTen,
      vaiTro: nguoiDung.vaiTro as VaiTro,
    });

    const response = NextResponse.json({ status: 'success', data: nguoiDung, message: 'Đăng nhập thành công' });
    response.cookies.set({ ...tuyChonCookie(), value: token });
    return response;
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Không đăng nhập được', 500);
  }
}
