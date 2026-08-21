import { NextResponse } from 'next/server';
import { EshopOpenApiError, goiApi } from '@/services/eshop-open-api.service';

type Payload = {
  method?: string;
  url?: string;
  query?: Record<string, string>;
  body?: string | null;
  accessToken?: string | null;
  appId?: string | null;
  appKey?: string | null;
  appIdHeader?: string | null;
  appKeyHeader?: string | null;
  extraHeaders?: Record<string, string>;
  timeoutMs?: number;
};

/**
 * POST /api/eshop-api-test/request - Gọi hộ 1 request sang MISA eShop Open Platform.
 *
 * Luôn trả HTTP 200 kèm nguyên trạng status/header/body của MISA: đây là công cụ test, người dùng cần
 * xem cả trường hợp lỗi 400/401 chứ không phải nhận lỗi chung của route.
 */
export async function POST(request: Request) {
  let payload: Payload;
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return NextResponse.json({ status: 'error', message: 'Dữ liệu không hợp lệ' }, { status: 400 });
  }

  if (!payload.url?.trim()) {
    return NextResponse.json({ status: 'error', message: 'Thiếu URL' }, { status: 400 });
  }

  try {
    const ketQua = await goiApi({
      method: payload.method || 'GET',
      url: payload.url,
      query: payload.query,
      body: payload.body ?? null,
      accessToken: payload.accessToken ?? null,
      appId: payload.appId ?? null,
      appKey: payload.appKey ?? null,
      appIdHeader: payload.appIdHeader ?? null,
      appKeyHeader: payload.appKeyHeader ?? null,
      extraHeaders: payload.extraHeaders,
      timeoutMs: payload.timeoutMs,
    });

    return NextResponse.json({ status: 'success', data: ketQua });
  } catch (e) {
    const message = e instanceof EshopOpenApiError ? e.message : 'Lỗi không xác định khi gọi MISA';
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}
