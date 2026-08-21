import { createHmac } from 'node:crypto';
import spec from '@/config/eshop-open-api-spec.json';
import specMsk from '@/config/mshopkeeper-open-api-spec.json';

/**
 * Cầu nối gọi thử MISA eShop Open Platform (dùng cho trang "eShop API test").
 *
 * Vì sao phải gọi qua server: `eshopapp.misa.vn` không mở CORS nên fetch trực tiếp từ trình duyệt sẽ
 * bị chặn; đồng thời App ID/App Key không nên lộ trong tab Network của người dùng khác. Route
 * `/api/eshop-api-test/*` nhận cấu hình rồi tự gọi sang MISA.
 *
 * Đây là công cụ thử nghiệm nên base URL và tên header vẫn cho sửa tay; riêng phần lấy token thì làm
 * đúng tài liệu (nhóm `Token`, xem `layTokenOpenApi`).
 */

/**
 * Chỉ cho phép proxy sang hạ tầng MISA — tránh biến route này thành proxy mở (SSRF).
 * `mshopkeeper.vn` là tên miền cũ của chính eShop, nơi cổng GraphAPI (đời trước) vẫn đang chạy.
 */
const HOST_CHO_PHEP = ['misa.vn', 'misacdn.net', 'mshopkeeper.vn'];

export const BASE_URL_MAC_DINH = 'https://eshopapp.misa.vn/api/platform';

/** Cổng xác thực nằm ở base URL riêng (`auth-platform`), không chung với các endpoint nghiệp vụ. */
export const AUTH_BASE_URL_MAC_DINH = 'https://eshopapp.misa.vn/api/auth-platform';
export const DUONG_DAN_TAO_TOKEN = 'tokens/create';
export const DUONG_DAN_LAM_MOI_TOKEN = 'tokens/refresh-token';

/** Tên header mặc định mang App ID/App Key. Tài liệu không nêu, nên cho sửa được ở giao diện. */
export const HEADER_APP_ID_MAC_DINH = 'x-app-id';
export const HEADER_APP_KEY_MAC_DINH = 'x-app-key';

export type ThamSoGoi = {
  method: string;
  /** URL đầy đủ đã ghép base + path (đã thay các đoạn `{...}`). */
  url: string;
  /** Query string dạng cặp key/value — bỏ qua value rỗng. */
  query?: Record<string, string>;
  /** Body JSON (chuỗi thô do người dùng nhập, hoặc object). Bỏ trống nếu method không có body. */
  body?: string | null;
  accessToken?: string | null;
  appId?: string | null;
  appKey?: string | null;
  appIdHeader?: string | null;
  appKeyHeader?: string | null;
  extraHeaders?: Record<string, string>;
  timeoutMs?: number;
};

export type KetQuaGoi = {
  ok: boolean;
  status: number;
  statusText: string;
  durationMs: number;
  /** Header trả về (đã lowercase theo chuẩn fetch). */
  responseHeaders: Record<string, string>;
  /** Body đã parse nếu là JSON, ngược lại là chuỗi thô. */
  body: unknown;
  /** true nếu `body` là JSON đã parse. */
  bodyIsJson: boolean;
  /** Ảnh chụp request đã gửi — App ID/Key được che, dùng để đối chiếu/copy cURL. */
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body: string | null;
  };
};

export class EshopOpenApiError extends Error {}

/** Ghép base URL + path + query thành URL cuối cùng, chặn host lạ. */
export function dungUrl(baseUrl: string, path: string, query?: Record<string, string>): string {
  const goc = (baseUrl || BASE_URL_MAC_DINH).trim().replace(/\/+$/, '');
  const duoi = (path || '').trim().replace(/^\/+/, '');

  let url: URL;
  try {
    url = new URL(duoi ? `${goc}/${duoi}` : goc);
  } catch {
    throw new EshopOpenApiError('URL không hợp lệ');
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new EshopOpenApiError('Chỉ hỗ trợ http/https');
  }

  const host = url.hostname.toLowerCase();
  if (!HOST_CHO_PHEP.some((d) => host === d || host.endsWith(`.${d}`))) {
    throw new EshopOpenApiError(`Chỉ được gọi sang tên miền MISA (${HOST_CHO_PHEP.join(', ')}), không phải ${host}`);
  }

  for (const [k, v] of Object.entries(query ?? {})) {
    const ten = k.trim();
    if (!ten || v === undefined || v === null || String(v).trim() === '') continue;
    url.searchParams.set(ten, String(v));
  }

  return url.toString();
}

/** Che bớt chuỗi bí mật khi trả về giao diện: giữ 4 ký tự đầu/cuối. */
export function cheBiMat(giaTri: string): string {
  const s = giaTri.trim();
  if (s.length <= 8) return '••••';
  return `${s.slice(0, 4)}••••${s.slice(-4)}`;
}

function ghepHeader(p: ThamSoGoi, coBody: boolean): { thuc: Record<string, string>; hienThi: Record<string, string> } {
  const thuc: Record<string, string> = { Accept: 'application/json' };
  const hienThi: Record<string, string> = { Accept: 'application/json' };

  if (coBody) {
    thuc['Content-Type'] = 'application/json';
    hienThi['Content-Type'] = 'application/json';
  }

  const token = (p.accessToken || '').trim().replace(/^Bearer\s+/i, '');
  if (token) {
    thuc.Authorization = `Bearer ${token}`;
    hienThi.Authorization = `Bearer ${cheBiMat(token)}`;
  }

  const appId = (p.appId || '').trim();
  if (appId) {
    const ten = (p.appIdHeader || HEADER_APP_ID_MAC_DINH).trim() || HEADER_APP_ID_MAC_DINH;
    thuc[ten] = appId;
    hienThi[ten] = appId;
  }

  const appKey = (p.appKey || '').trim();
  if (appKey) {
    const ten = (p.appKeyHeader || HEADER_APP_KEY_MAC_DINH).trim() || HEADER_APP_KEY_MAC_DINH;
    thuc[ten] = appKey;
    hienThi[ten] = cheBiMat(appKey);
  }

  // Header người dùng tự thêm được ưu tiên cuối — cho phép ghi đè mọi mặc định ở trên.
  for (const [k, v] of Object.entries(p.extraHeaders ?? {})) {
    const ten = k.trim();
    if (!ten || v === undefined || v === null) continue;
    thuc[ten] = String(v);
    hienThi[ten] = /authorization|key|secret|token/i.test(ten) ? cheBiMat(String(v)) : String(v);
  }

  return { thuc, hienThi };
}

/** Gọi 1 request tùy ý sang MISA và trả về đầy đủ status/header/body + thời gian phản hồi. */
export async function goiApi(p: ThamSoGoi): Promise<KetQuaGoi> {
  const method = (p.method || 'GET').toUpperCase();
  const coBody = method !== 'GET' && method !== 'HEAD' && !!(p.body && p.body.trim());
  const bodyChuoi = coBody ? (p.body as string).trim() : null;

  if (bodyChuoi) {
    try {
      JSON.parse(bodyChuoi);
    } catch {
      throw new EshopOpenApiError('Body không phải JSON hợp lệ');
    }
  }

  const { thuc, hienThi } = ghepHeader(p, coBody);
  const url = dungUrl(p.url, '', p.query);

  const hetHan = AbortSignal.timeout(Math.min(Math.max(p.timeoutMs ?? 30_000, 1_000), 120_000));
  const batDau = Date.now();

  let res: Response;
  try {
    res = await fetch(url, { method, headers: thuc, body: bodyChuoi, signal: hetHan, cache: 'no-store' });
  } catch (e) {
    const loi = e instanceof Error ? e.message : String(e);
    throw new EshopOpenApiError(`Không gọi được MISA: ${loi}`);
  }

  const chuoi = await res.text();
  let body: unknown = chuoi;
  let bodyIsJson = false;
  if (chuoi) {
    try {
      body = JSON.parse(chuoi);
      bodyIsJson = true;
    } catch {
      // Giữ nguyên chuỗi thô — MISA trả HTML/text khi lỗi hạ tầng, xem thô mới đoán được nguyên nhân.
    }
  }

  const responseHeaders: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    responseHeaders[k] = v;
  });

  return {
    ok: res.ok,
    status: res.status,
    statusText: res.statusText,
    durationMs: Date.now() - batDau,
    responseHeaders,
    body,
    bodyIsJson,
    request: { method, url, headers: hienThi, body: bodyChuoi },
  };
}

/* ==================== Lấy token (nhóm Token trong tài liệu eShop) ==================== */

export type KetQuaTokenOpenApi = {
  thanhCong: boolean;
  /** Chuỗi gửi kèm `Authorization: Bearer` khi gọi các endpoint nghiệp vụ. */
  token: string | null;
  refreshToken: string | null;
  /** Thời điểm token hết hạn, giữ nguyên văn chuỗi MISA trả về. */
  hetHan: string | null;
  loaiToken: string | null;
  /** `Status.ErrorCode` của MISA — 1300 là không thấy app_id, 1000 là tham số không hợp lệ. */
  maLoi: number | null;
  thongBao: string | null;
  /** Ảnh chụp lời gọi (chữ ký/token trong body đã che) để đối chiếu khi thất bại. */
  goi: KetQuaGoi;
};

/**
 * Chữ ký đăng nhập theo tài liệu: HMAC-SHA256 chuỗi `app_id:{app_id};login_time:{login_time}` với
 * salt là App Key, xuất ra hex chữ thường.
 */
export function kyDangNhapOpenApi(appId: string, appKey: string, loginTime: number): string {
  return createHmac('sha256', appKey).update(`app_id:${appId};login_time:${loginTime}`, 'utf8').digest('hex');
}

/** Che các chuỗi nhạy cảm trong ảnh chụp body request — nó được trả thẳng về giao diện để copy. */
function cheTrongBody(r: KetQuaGoi, ...biMat: Array<string | null>): KetQuaGoi {
  if (!r.request.body) return r;

  let body = r.request.body;
  for (const s of biMat) {
    if (s) body = body.replaceAll(s, cheBiMat(s));
  }

  return { ...r, request: { ...r.request, body } };
}

/**
 * Bóc phản hồi `OpenAuthResponse`.
 *
 * Cổng xác thực luôn trả HTTP 200, kể cả khi sai App ID — thành/bại nằm ở `Status.Success`, nên
 * không được nhìn `r.ok` để kết luận.
 */
function docPhanHoiToken(r: KetQuaGoi): KetQuaTokenOpenApi {
  const doc = r.bodyIsJson && r.body && typeof r.body === 'object' ? (r.body as Record<string, unknown>) : {};
  const trangThai = (doc.Status ?? {}) as Record<string, unknown>;
  const dulieu = (doc.Data ?? {}) as Record<string, unknown>;
  const chuoi = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);

  return {
    thanhCong: trangThai.Success === true && !!chuoi(dulieu.token),
    token: chuoi(dulieu.token),
    refreshToken: chuoi(dulieu.refresh_token),
    hetHan: chuoi(dulieu.expires_in),
    loaiToken: chuoi(dulieu.token_type),
    maLoi: typeof trangThai.ErrorCode === 'number' ? trangThai.ErrorCode : null,
    thongBao: chuoi(trangThai.Message),
    goi: r,
  };
}

export type ThamSoLayToken = {
  authBaseUrl?: string;
  appId: string;
  appKey: string;
  /** Unix timestamp mili giây (UTC). Truyền vào để test cho ổn định; mặc định lấy giờ hiện tại. */
  loginTime?: number;
};

/**
 * `GeneralToken`: POST `tokens/create` để lấy access token + refresh token.
 *
 * App Key chỉ dùng để ký tại chỗ, không bao giờ được gửi lên MISA. Body phải phẳng — bọc thêm một
 * lớp `loginParam` thì cổng trả `ErrorCode 1000 — Tham số không hợp lệ`.
 */
export async function layTokenOpenApi(p: ThamSoLayToken): Promise<KetQuaTokenOpenApi> {
  const appId = p.appId.trim();
  const appKey = p.appKey.trim();
  const loginTime = p.loginTime ?? Date.now();
  const sign = kyDangNhapOpenApi(appId, appKey, loginTime);

  const r = await goiApi({
    method: 'POST',
    url: dungUrl(p.authBaseUrl?.trim() || AUTH_BASE_URL_MAC_DINH, DUONG_DAN_TAO_TOKEN),
    body: JSON.stringify({ app_id: appId, login_time: loginTime, sign }),
    timeoutMs: 20_000,
  });

  return docPhanHoiToken(cheTrongBody(r, sign));
}

export type ThamSoLamMoiToken = {
  authBaseUrl?: string;
  token: string;
  refreshToken: string;
};

/** `RefreshToken`: POST `tokens/refresh-token` — cấp cặp token mới từ cặp token cũ. */
export async function lamMoiTokenOpenApi(p: ThamSoLamMoiToken): Promise<KetQuaTokenOpenApi> {
  const token = p.token.trim();
  const refreshToken = p.refreshToken.trim();

  const r = await goiApi({
    method: 'POST',
    url: dungUrl(p.authBaseUrl?.trim() || AUTH_BASE_URL_MAC_DINH, DUONG_DAN_LAM_MOI_TOKEN),
    body: JSON.stringify({ token, refresh_token: refreshToken }),
    timeoutMs: 20_000,
  });

  return docPhanHoiToken(cheTrongBody(r, token, refreshToken));
}

export function laySpec() {
  return spec;
}

export function laySpecMshopkeeper() {
  return specMsk;
}

/* ==================== GraphAPI (MShopKeeper OpenPlatform — tên miền cũ của eShop) ==================== */

export const GRAPH_AUTH_URL_MAC_DINH = 'https://graphapi.mshopkeeper.vn/auth';

/**
 * Cách ký chuỗi đăng nhập. Tài liệu chỉ nói "bọc tham số dạng JSON rồi HMACSHA256 với salt là Secret
 * Key" mà không nêu định dạng chuỗi kết quả (hex hay base64) lẫn định dạng `LoginTime`, nên ta thử
 * lần lượt vài tổ hợp — server MShopKeeper trả `ErrorType: 4` riêng cho "chữ ký không hợp lệ/timeout"
 * nên phân biệt được tổ hợp nào đúng.
 */
export type KieuChuKy = 'hex' | 'hex-hoa' | 'base64';
export type KieuGio = 'iso' | 'iso-khong-ms' | 'sql';

const TO_HOP_CHU_KY: Array<{ chuKy: KieuChuKy; gio: KieuGio }> = [
  { chuKy: 'base64', gio: 'iso' },
  { chuKy: 'hex', gio: 'iso' },
  { chuKy: 'hex-hoa', gio: 'iso' },
  { chuKy: 'base64', gio: 'iso-khong-ms' },
  { chuKy: 'hex', gio: 'iso-khong-ms' },
  { chuKy: 'base64', gio: 'sql' },
  { chuKy: 'hex', gio: 'sql' },
];

export function dungLoginTime(kieu: KieuGio, luc = new Date()): string {
  const iso = luc.toISOString();
  if (kieu === 'iso') return iso;
  if (kieu === 'iso-khong-ms') return `${iso.slice(0, 19)}Z`;
  return iso.slice(0, 19).replace('T', ' ');
}

export function kyChuoi(noiDung: string, secretKey: string, kieu: KieuChuKy): string {
  const hmac = createHmac('sha256', secretKey).update(noiDung, 'utf8');
  if (kieu === 'base64') return hmac.digest('base64');
  const hex = hmac.digest('hex');
  return kieu === 'hex-hoa' ? hex.toUpperCase() : hex;
}

export type ThamSoDangNhapGraph = {
  authUrl?: string;
  domain: string;
  appId: string;
  secretKey: string;
  /** Chỉ định 1 tổ hợp cụ thể; bỏ trống thì thử lần lượt cho tới khi qua được bước chữ ký. */
  chuKy?: KieuChuKy;
  gio?: KieuGio;
};

export type LanThuDangNhap = {
  chuKy: KieuChuKy;
  gio: KieuGio;
  loginTime: string;
  /** Chuỗi JSON đã đem đi ký — hiện ra để đối chiếu khi phải dò tay. */
  chuoiKy: string;
  status: number;
  errorType: number | null;
  errorMessage: string | null;
  success: boolean;
  body: unknown;
};

export type KetQuaDangNhapGraph = {
  thanhCong: boolean;
  accessToken: string | null;
  companyCode: string | null;
  environment: string | null;
  /** Base URL để gọi dữ liệu, đã ghép `{Environment}` mà login trả về. */
  dataUrl: string | null;
  cachKy: { chuKy: KieuChuKy; gio: KieuGio } | null;
  cacLanThu: LanThuDangNhap[];
};

/**
 * Đăng nhập cổng GraphAPI để lấy AccessToken + CompanyCode + Environment.
 *
 * Body theo tài liệu: `LoginParam { Domain, AppID, LoginTime, SignatureInfo }`, trong đó
 * SignatureInfo là HMACSHA256 của JSON `LoginData { Domain, AppID, LoginTime }`.
 */
export async function dangNhapGraphApi(p: ThamSoDangNhapGraph): Promise<KetQuaDangNhapGraph> {
  const authUrl = p.authUrl?.trim() || GRAPH_AUTH_URL_MAC_DINH;
  const url = dungUrl(authUrl, 'api/Account/Login');
  const toHop = p.chuKy && p.gio ? [{ chuKy: p.chuKy, gio: p.gio }] : TO_HOP_CHU_KY;

  const cacLanThu: LanThuDangNhap[] = [];

  for (const cach of toHop) {
    const loginTime = dungLoginTime(cach.gio);
    const chuoiKy = JSON.stringify({ Domain: p.domain, AppID: p.appId, LoginTime: loginTime });
    const body = JSON.stringify({
      Domain: p.domain,
      AppID: p.appId,
      LoginTime: loginTime,
      SignatureInfo: kyChuoi(chuoiKy, p.secretKey, cach.chuKy),
    });

    const r = await goiApi({ method: 'POST', url, body, timeoutMs: 20_000 });
    const doc = r.bodyIsJson && r.body && typeof r.body === 'object' ? (r.body as Record<string, unknown>) : {};
    const errorType = typeof doc.ErrorType === 'number' ? doc.ErrorType : null;
    const success = doc.Success === true;

    cacLanThu.push({
      ...cach,
      loginTime,
      chuoiKy,
      status: r.status,
      errorType,
      errorMessage: typeof doc.ErrorMessage === 'string' ? doc.ErrorMessage : null,
      success,
      body: r.body,
    });

    if (success) {
      const data = (doc.Data ?? {}) as Record<string, unknown>;
      const environment = typeof data.Environment === 'string' ? data.Environment : typeof doc.Environment === 'string' ? doc.Environment : null;
      const goc = authUrl.replace(/\/auth\/?$/, '');

      return {
        thanhCong: true,
        accessToken: typeof data.AccessToken === 'string' ? data.AccessToken : null,
        companyCode: typeof data.CompanyCode === 'string' ? data.CompanyCode : null,
        environment,
        dataUrl: environment ? `${goc}/${environment}` : null,
        cachKy: cach,
        cacLanThu,
      };
    }

    // ErrorType 4 = chữ ký sai/timeout → chỉ khi đó mới bõ công thử tổ hợp khác. Các lỗi còn lại
    // (2: sai Domain, 3: sai AppID...) có thử tiếp cũng vậy, dừng luôn cho nhanh và đỡ dội request.
    if (errorType !== 4) break;
  }

  return { thanhCong: false, accessToken: null, companyCode: null, environment: null, dataUrl: null, cachKy: null, cacLanThu };
}
