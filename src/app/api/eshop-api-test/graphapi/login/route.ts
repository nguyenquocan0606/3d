import { NextResponse } from 'next/server';
import { EshopOpenApiError, dangNhapGraphApi, type KieuChuKy, type KieuGio } from '@/services/eshop-open-api.service';

type Payload = {
  authUrl?: string;
  domain?: string;
  appId?: string;
  secretKey?: string;
  chuKy?: KieuChuKy;
  gio?: KieuGio;
};

/**
 * POST /api/eshop-api-test/graphapi/login - Lấy AccessToken/CompanyCode/Environment ở cổng GraphAPI
 * (MShopKeeper OpenPlatform — tên miền cũ của eShop).
 *
 * Chữ ký HMACSHA256 phải ký ở server vì Secret Key không được lộ ra trình duyệt.
 */
export async function POST(request: Request) {
  let payload: Payload;
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return NextResponse.json({ status: 'error', message: 'Dữ liệu không hợp lệ' }, { status: 400 });
  }

  const domain = payload.domain?.trim();
  const appId = payload.appId?.trim();
  const secretKey = payload.secretKey?.trim();

  if (!domain || !appId || !secretKey) {
    return NextResponse.json({ status: 'error', message: 'Cần nhập Domain, AppID và Secret Key' }, { status: 400 });
  }

  try {
    const ketQua = await dangNhapGraphApi({ authUrl: payload.authUrl, domain, appId, secretKey, chuKy: payload.chuKy, gio: payload.gio });
    return NextResponse.json({ status: 'success', data: ketQua });
  } catch (e) {
    const message = e instanceof EshopOpenApiError ? e.message : 'Lỗi không xác định khi đăng nhập GraphAPI';
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}
