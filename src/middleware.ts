import { NextRequest, NextResponse } from 'next/server';
import { TEN_COOKIE_PHIEN, TRANG_NHAN_VIEN, docToken, nhanVienDuocVao } from '@/utils/auth';

/**
 * Hai việc trong cùng một middleware:
 *
 * 1) **CORS cho `/api/*`** — app Flutter chạy trên thiết bị thật gọi API bình thường
 *    (không có khái niệm origin), nhưng khi test bằng `flutter run -d chrome` thì trình
 *    duyệt coi đây là cross-origin. Request có header `Content-Type: application/json`
 *    không thuộc nhóm "simple request", nên Chrome gửi **OPTIONS preflight** trước.
 *    Backend không trả lời OPTIONS → preflight fail → GET/POST thật không bao giờ được gửi.
 *
 *    Chỉ mở cho localhost (Flutter web dev server dùng cổng ngẫu nhiên), dải IP LAN
 *    và domain của xưởng — KHÔNG dùng `*`.
 *
 * 2) **Chặn đăng nhập cho các trang web** — chưa đăng nhập thì đẩy về `/dang-nhap`,
 *    tài khoản `nhanVien` thì mọi trang đều đẩy về `/hang-hoa-cua-hang`.
 *
 * ⚠️ `/api/*` **cố ý không bị chặn đăng nhập**: app Flutter gọi thẳng các route này và
 * không có tài khoản (yêu cầu là "app thì không cần login"). Nghĩa là phân quyền nhân
 * viên chỉ chặn ở tầng giao diện web — ai gọi thẳng API vẫn làm được mọi thứ. Muốn siết
 * thật thì phải cấp khóa riêng cho app rồi bắt buộc xác thực ở đây.
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

/** Trang xem được khi chưa đăng nhập. */
const TRANG_CONG_KHAI = ['/dang-nhap'];

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

function xuLyApi(request: NextRequest) {
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

async function xuLyTrang(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const phien = await docToken(request.cookies.get(TEN_COOKIE_PHIEN)?.value);

  if (TRANG_CONG_KHAI.includes(pathname)) {
    // Đã đăng nhập rồi mà mở lại trang đăng nhập → đưa thẳng vào trang của vai trò đó.
    if (phien) {
      return NextResponse.redirect(new URL(phien.vaiTro === 'admin' ? '/' : TRANG_NHAN_VIEN, request.url));
    }
    return NextResponse.next();
  }

  if (!phien) {
    const url = new URL('/dang-nhap', request.url);
    // Nhớ trang đang muốn vào để đăng nhập xong quay lại đúng chỗ.
    if (pathname !== '/') url.searchParams.set('tiep', `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  if (phien.vaiTro === 'nhanVien' && !nhanVienDuocVao(pathname)) {
    return NextResponse.redirect(new URL(TRANG_NHAN_VIEN, request.url));
  }

  return NextResponse.next();
}

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/')) return xuLyApi(request);
  return xuLyTrang(request);
}

export const config = {
  matcher: [
    // Giữ nguyên phạm vi CORS như trước: mọi `/api/*`, kể cả đường dẫn kết thúc bằng đuôi file.
    '/api/:path*',
    // Các trang: bỏ qua tài nguyên tĩnh của Next và file trong `public/` (nhận diện qua đuôi file).
    '/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|mp4|mp3|wav|txt|xml)$).*)',
  ],
};
