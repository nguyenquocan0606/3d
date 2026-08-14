import { NextResponse } from 'next/server';

/**
 * Helper thống nhất format response API toàn app:
 *   Thành công: { status: 'success', data, message? }
 *   Thất bại:   { status: 'error', message }
 *
 * Client kiểm tra bằng `data.status === 'success'`.
 */

export function ok<T>(data: T, message?: string) {
  return NextResponse.json({ status: 'success', data, ...(message ? { message } : {}) });
}

export function fail(message: string, status: number = 500) {
  return NextResponse.json({ status: 'error', message }, { status });
}
