import { NextResponse } from 'next/server';
import { tuyChonCookie } from '@/utils/auth';

export async function POST() {
  const response = NextResponse.json({ status: 'success', data: null, message: 'Đã đăng xuất' });
  // Ghi đè cookie bằng chuỗi rỗng, hạn 0 — xóa hẳn thay vì để token cũ còn hiệu lực.
  response.cookies.set({ ...tuyChonCookie(0), value: '' });
  return response;
}
