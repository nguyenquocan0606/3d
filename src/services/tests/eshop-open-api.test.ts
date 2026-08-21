import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AUTH_BASE_URL_MAC_DINH,
  BASE_URL_MAC_DINH,
  EshopOpenApiError,
  cheBiMat,
  dangNhapGraphApi,
  dungLoginTime,
  dungUrl,
  goiApi,
  kyChuoi,
  kyDangNhapOpenApi,
  lamMoiTokenOpenApi,
  laySpec,
  layTokenOpenApi,
} from '../eshop-open-api.service';

/**
 * Trang "eShop API test" cho người dùng sửa gần như mọi thứ (base URL, tên header, body), nên các
 * chốt an toàn dưới đây phải được khóa bằng test: chỉ gọi được tên miền MISA, App Key/token không
 * bao giờ trả nguyên văn về giao diện, và body sai JSON phải chặn ngay tại server.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

describe('dungUrl', () => {
  it('ghép base + path + query, bỏ query rỗng', () => {
    const url = dungUrl(BASE_URL_MAC_DINH, '/branchs/list', { page: '2', size: '10', sort: '' });
    expect(url).toBe('https://eshopapp.misa.vn/api/platform/branchs/list?page=2&size=10');
  });

  it('chặn tên miền ngoài MISA — route này không được thành proxy mở', () => {
    expect(() => dungUrl('https://evil.example.com', 'x')).toThrow(EshopOpenApiError);
    expect(() => dungUrl('https://eshopapp.misa.vn.evil.com/api', 'x')).toThrow(EshopOpenApiError);
  });

  it('cho phép các máy chủ con của misa.vn', () => {
    expect(dungUrl('https://amisapp.misa.vn/eshop/g3/api', 'ping')).toBe('https://amisapp.misa.vn/eshop/g3/api/ping');
  });
});

describe('cheBiMat', () => {
  it('giữ 4 ký tự đầu/cuối, chuỗi ngắn thì che hết', () => {
    expect(cheBiMat('abcd1234efgh')).toBe('abcd••••efgh');
    expect(cheBiMat('ngan')).toBe('••••');
  });
});

describe('goiApi', () => {
  it('gửi Bearer + header App ID/Key và che bí mật trong phần request trả về', async () => {
    const fetchGia = vi.fn().mockResolvedValue(new Response('{"Status":{"Success":true}}', { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchGia);

    const r = await goiApi({
      method: 'POST',
      url: `${BASE_URL_MAC_DINH}/inventoryitems/list`,
      body: '{"page":1}',
      accessToken: 'Bearer token-that-la-dai-de-bi-che',
      appId: 'app-id-cong-khai',
      appKey: 'app-key-rat-bi-mat-nen-phai-che',
    });

    const headerDaGui = (fetchGia.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    // Token người dùng dán kèm chữ "Bearer" không được ghép thành "Bearer Bearer ..."
    expect(headerDaGui.Authorization).toBe('Bearer token-that-la-dai-de-bi-che');
    expect(headerDaGui['x-app-id']).toBe('app-id-cong-khai');
    expect(headerDaGui['x-app-key']).toBe('app-key-rat-bi-mat-nen-phai-che');

    expect(r.status).toBe(200);
    expect(r.bodyIsJson).toBe(true);
    expect(r.request.headers['x-app-key']).toBe('app-••••-che');
    expect(r.request.headers.Authorization).not.toContain('token-that-la-dai-de-bi-che');
  });

  it('không nuốt lỗi 401 — trả nguyên status để người test đọc được', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })));

    const r = await goiApi({ method: 'GET', url: `${BASE_URL_MAC_DINH}/branchs/list` });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(401);
    expect(r.bodyIsJson).toBe(false);
  });

  it('chặn body sai JSON trước khi gọi MISA', async () => {
    const fetchGia = vi.fn();
    vi.stubGlobal('fetch', fetchGia);

    await expect(goiApi({ method: 'POST', url: `${BASE_URL_MAC_DINH}/x`, body: '{page:1}' })).rejects.toThrow(EshopOpenApiError);
    expect(fetchGia).not.toHaveBeenCalled();
  });
});

describe('lấy token eShop', () => {
  const PHAN_HOI_OK = JSON.stringify({
    Status: { Success: true, ErrorCode: 200, Message: null },
    Data: { token: 'tok-' + 'a'.repeat(40), refresh_token: 'rft-' + 'b'.repeat(40), expires_in: '2026-08-19T03:00:00Z', token_type: 'Bearer' },
  });

  it('ký HMAC-SHA256 hex thường và gửi body phẳng {app_id, login_time, sign}', async () => {
    const fetchGia = vi.fn().mockResolvedValue(new Response(PHAN_HOI_OK, { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchGia);

    const r = await layTokenOpenApi({ appId: 'APP-1', appKey: 'khoa-bi-mat', loginTime: 1_733_389_200_000 });

    expect(fetchGia.mock.calls[0][0]).toBe(`${AUTH_BASE_URL_MAC_DINH}/tokens/create`);

    // Bọc thêm lớp `loginParam` thì cổng trả ErrorCode 1000, nên thứ tự/độ phẳng của body phải khóa lại.
    const body = JSON.parse((fetchGia.mock.calls[0][1] as RequestInit).body as string) as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(['app_id', 'login_time', 'sign']);
    expect(body.login_time).toBe(1_733_389_200_000);
    expect(body.sign).toBe(kyDangNhapOpenApi('APP-1', 'khoa-bi-mat', 1_733_389_200_000));
    expect(body.sign).toMatch(/^[0-9a-f]{64}$/);

    // App Key chỉ dùng để ký tại chỗ, tuyệt đối không gửi lên MISA.
    expect((fetchGia.mock.calls[0][1] as RequestInit).body as string).not.toContain('khoa-bi-mat');

    expect(r.thanhCong).toBe(true);
    expect(r.token).toBe('tok-' + 'a'.repeat(40));
    expect(r.refreshToken).toBe('rft-' + 'b'.repeat(40));
    expect(r.hetHan).toBe('2026-08-19T03:00:00Z');
    // Chữ ký suy ra từ App Key nên ảnh chụp request trả về giao diện phải che.
    expect(r.goi.request.body).not.toContain(body.sign as string);
  });

  it('HTTP 200 kèm Status.Success=false vẫn là thất bại, giữ nguyên ErrorCode để đọc', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ Status: { Success: false, ErrorCode: 1300, Message: 'Không tìm thấy thông tin app_id' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const r = await layTokenOpenApi({ appId: 'sai', appKey: 'sai' });
    expect(r.goi.ok).toBe(true);
    expect(r.thanhCong).toBe(false);
    expect(r.maLoi).toBe(1300);
    expect(r.thongBao).toBe('Không tìm thấy thông tin app_id');
    expect(r.token).toBeNull();
  });

  it('làm mới token gửi cặp {token, refresh_token} và che cả hai khi trả về', async () => {
    const fetchGia = vi.fn().mockResolvedValue(new Response(PHAN_HOI_OK, { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchGia);

    const cu = 'tok-cu-' + 'c'.repeat(30);
    const rft = 'rft-cu-' + 'd'.repeat(30);
    const r = await lamMoiTokenOpenApi({ token: cu, refreshToken: rft });

    expect(fetchGia.mock.calls[0][0]).toBe(`${AUTH_BASE_URL_MAC_DINH}/tokens/refresh-token`);
    expect(JSON.parse((fetchGia.mock.calls[0][1] as RequestInit).body as string)).toEqual({ token: cu, refresh_token: rft });

    expect(r.thanhCong).toBe(true);
    expect(r.goi.request.body).not.toContain(cu);
    expect(r.goi.request.body).not.toContain(rft);
  });
});

describe('spec bóc từ tài liệu MISA', () => {
  it('có đủ nhóm/endpoint và mọi endpoint đều trỏ về misa.vn', () => {
    const spec = laySpec();
    expect(spec.sections.length).toBeGreaterThan(5);
    expect(spec.endpoints.length).toBeGreaterThan(20);

    for (const e of spec.endpoints) {
      expect(e.baseUrl).toContain('misa.vn');
      expect(['GET', 'POST', 'PUT', 'DELETE']).toContain(e.method);
    }

    // Endpoint mốc: danh mục hàng hóa eShop — dùng làm phép thử nhanh trên giao diện.
    const ds = spec.endpoints.find((e) => e.id === 'GetList');
    expect(ds?.path).toBe('inventoryitems/list');
    expect(ds?.parameters.some((p) => p.location === 'Body')).toBe(true);
  });

  it('giữ được nhóm Token — trang tài liệu chia dữ liệu thành nhiều lần push, dễ bóc thiếu', () => {
    const spec = laySpec();
    expect(spec.sections.some((s) => s.id === 'Token')).toBe(true);

    const tao = spec.endpoints.find((e) => e.id === 'GeneralToken');
    expect(tao?.path).toBe('tokens/create');
    // Cổng xác thực nằm ở base URL riêng, không dùng chung với endpoint nghiệp vụ.
    expect(tao?.baseUrl).toBe(AUTH_BASE_URL_MAC_DINH);
    expect(spec.endpoints.find((e) => e.id === 'RefreshToken')?.path).toBe('tokens/refresh-token');
  });
});

describe('đăng nhập GraphAPI (MShopKeeper)', () => {
  it('ký HMACSHA256 chuỗi JSON {Domain, AppID, LoginTime} và gửi đúng LoginParam', async () => {
    const fetchGia = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ Code: 200, ErrorType: 0, Success: true, Data: { AccessToken: 'tok-' + 'x'.repeat(30), CompanyCode: 'cuahang', Environment: 'g1' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchGia);

    const r = await dangNhapGraphApi({ domain: 'shop.mshopkeeper.vn', appId: 'app-1', secretKey: 'khoa-bi-mat' });

    expect(fetchGia).toHaveBeenCalledTimes(1);
    expect(fetchGia.mock.calls[0][0]).toBe('https://graphapi.mshopkeeper.vn/auth/api/Account/Login');

    const body = JSON.parse((fetchGia.mock.calls[0][1] as RequestInit).body as string) as Record<string, string>;
    expect(Object.keys(body)).toEqual(['Domain', 'AppID', 'LoginTime', 'SignatureInfo']);
    expect(body.SignatureInfo).toBe(
      kyChuoi(JSON.stringify({ Domain: 'shop.mshopkeeper.vn', AppID: 'app-1', LoginTime: body.LoginTime }), 'khoa-bi-mat', 'base64'),
    );

    expect(r.thanhCong).toBe(true);
    expect(r.companyCode).toBe('cuahang');
    // Environment do login trả về được ghép luôn thành base URL gọi dữ liệu.
    expect(r.dataUrl).toBe('https://graphapi.mshopkeeper.vn/g1');
  });

  it('chỉ thử tổ hợp ký khác khi ErrorType = 4 (chữ ký sai), lỗi khác thì dừng ngay', async () => {
    // Mỗi lần gọi phải là Response mới: body của Response chỉ đọc được một lần.
    const fetchChuKySai = vi.fn(async () => new Response(JSON.stringify({ ErrorType: 4, Success: false }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchChuKySai);
    const nhieu = await dangNhapGraphApi({ domain: 'd', appId: 'a', secretKey: 's' });
    expect(nhieu.cacLanThu.length).toBeGreaterThan(1);
    expect(nhieu.thanhCong).toBe(false);

    vi.restoreAllMocks();
    const fetchSaiDomain = vi.fn(
      async () => new Response(JSON.stringify({ ErrorType: 2, ErrorMessage: 'CompanyCode not found.', Success: false }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', fetchSaiDomain);
    const mot = await dangNhapGraphApi({ domain: 'd', appId: 'a', secretKey: 's' });
    expect(mot.cacLanThu).toHaveLength(1);
    expect(mot.cacLanThu[0].errorMessage).toBe('CompanyCode not found.');
  });

  it('dungLoginTime trả đúng ba dạng giờ UTC', () => {
    const luc = new Date('2026-08-18T03:04:05.678Z');
    expect(dungLoginTime('iso', luc)).toBe('2026-08-18T03:04:05.678Z');
    expect(dungLoginTime('iso-khong-ms', luc)).toBe('2026-08-18T03:04:05Z');
    expect(dungLoginTime('sql', luc)).toBe('2026-08-18 03:04:05');
  });

  it('cho phép gọi graphapi.mshopkeeper.vn — tên miền cũ của chính eShop', () => {
    expect(dungUrl('https://graphapi.mshopkeeper.vn/g1', 'api/v1/branchs/all')).toBe('https://graphapi.mshopkeeper.vn/g1/api/v1/branchs/all');
  });
});
