import { NextRequest, NextResponse } from 'next/server';

/**
 * CORS cho `/api/*`.
 *
 * Vì sao cần: app Flutter chạy trên thiết bị thật gọi API bình thường (không có
 * khái niệm origin), nhưng khi test bằng `flutter run -d chrome` thì trình duyệt
 * coi đây là cross-origin. Request có header `Content-Type: application/json`
 * không thuộc nhóm "simple request", nên Chrome gửi **OPTIONS preflight** trước.
 * Backend không trả lời OPTIONS → preflight fail → GET/POST thật không bao giờ
 * được gửi đi.
 *
 * Chỉ mở cho localhost (Flutter web dev server dùng cổng ngẫu nhiên), dải IP LAN
 * và domain của xưởng — KHÔNG dùng `*`, vì API hiện chưa có xác thực nên `*` sẽ
 * cho phép bất kỳ trang web nào người dùng mở cũng gọi được vào máy chủ này.
 */

const ALLOWED_ORIGIN_PATTERNS = [
  // Flutter web dev server / trình duyệt trên chính máy chủ
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  // Máy trong LAN xưởng (RFC1918)
  /^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/,
  /^https?:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/,
  /^https?:\/\/172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}(:\d+)?$/,
  // Domain đã dùng cho bản web
  /^https:\/\/(2d|3d)\.quocan\.click$/,
];

const ALLOWED_HEADERS = 'Content-Type, X-API-Key, Authorization';
const ALLOWED_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';

function corsHeaders(origin: string | null): Record<string, string> | null {
  if (!origin) return null;
  if (!ALLOWED_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin))) return null;

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': ALLOWED_METHODS,
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    // Cache preflight 1 ngày để trình duyệt khỏi hỏi lại mỗi request.
    'Access-Control-Max-Age': '86400',
    // Origin khác nhau trả header khác nhau → tránh proxy/CDN cache nhầm.
    Vary: 'Origin',
  };
}

export function middleware(request: NextRequest) {
  const headers = corsHeaders(request.headers.get('origin'));

  // Preflight: trả lời ngay, không đụng tới route handler.
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: headers ?? undefined });
  }

  const response = NextResponse.next();
  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      response.headers.set(key, value);
    }
  }
  return response;
}

export const config = {
  matcher: '/api/:path*',
};
