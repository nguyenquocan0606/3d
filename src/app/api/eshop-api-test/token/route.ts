import { NextResponse } from 'next/server';
import { EshopOpenApiError, lamMoiTokenOpenApi, layTokenOpenApi } from '@/services/eshop-open-api.service';

type Payload = {
  /** `tao` = GeneralToken (ký bằng App Key), `lam-moi` = RefreshToken (dùng cặp token cũ). */
  hanhDong?: 'tao' | 'lam-moi';
  authBaseUrl?: string;
  appId?: string;
  appKey?: string;
  token?: string;
  refreshToken?: string;
};

/**
 * POST /api/eshop-api-test/token - Lấy hoặc làm mới token của MISA eShop Open Platform.
 *
 * Chạy ở server vì App Key phải được dùng để ký HMAC-SHA256 và không được lộ ra trình duyệt; kết quả
 * trả về đã che chữ ký lẫn token trong ảnh chụp request.
 *
 * Luôn trả HTTP 200 kèm nguyên phản hồi của MISA: cổng xác thực báo lỗi bằng `Status.ErrorCode` chứ
 * không bằng HTTP status, và người test cần đọc được mã lỗi đó.
 */
export async function POST(request: Request) {
  let payload: Payload;
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return NextResponse.json({ status: 'error', message: 'Dữ liệu không hợp lệ' }, { status: 400 });
  }

  try {
    if (payload.hanhDong === 'lam-moi') {
      const token = payload.token?.trim();
      const refreshToken = payload.refreshToken?.trim();
      if (!token || !refreshToken) {
        return NextResponse.json({ status: 'error', message: 'Cần có cả token và refresh token để làm mới' }, { status: 400 });
      }

      return NextResponse.json({ status: 'success', data: await lamMoiTokenOpenApi({ authBaseUrl: payload.authBaseUrl, token, refreshToken }) });
    }

    const appId = payload.appId?.trim();
    const appKey = payload.appKey?.trim();
    if (!appId || !appKey) {
      return NextResponse.json({ status: 'error', message: 'Cần nhập App ID và App Key' }, { status: 400 });
    }

    return NextResponse.json({ status: 'success', data: await layTokenOpenApi({ authBaseUrl: payload.authBaseUrl, appId, appKey }) });
  } catch (e) {
    const message = e instanceof EshopOpenApiError ? e.message : 'Lỗi không xác định khi lấy token';
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}
