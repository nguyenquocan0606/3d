import prisma from '../utils/db';
import type { Result } from '../types/result';

const CREDENTIAL_ID = 'default';

/**
 * Đường dẫn API đổi theo môi trường tenant (g2/g3) — đọc từ claim `env` trong Bearer token, lưu ở
 * cột MisaCredential.env. Gọi nhầm môi trường thì MISA trả 401/404 dù token còn hạn.
 */
export function misaBaseUrl(env?: string | null): string {
  const moiTruong = (env || 'g3').trim();
  return `https://amisapp.misa.vn/eshop/${moiTruong}/api`;
}

/**
 * Bỏ tiền tố "Bearer " nếu có, trả về JWT trần.
 *
 * Vì sao cần: API đổi phiên của eShop (`Accounts/login-amis`, `refresh-token`) trả token ĐÃ kèm sẵn
 * "Bearer ", trong khi `dungHeaderMisa` lại tự ghép "Bearer " lần nữa → header thành
 * "Bearer Bearer eyJ..." và MISA trả 401 IsAuthExpired dù token còn hạn. Chính app eShop cũng làm
 * bước cắt này (thấy trong bundle: `n.startsWith("Bearer ") && (n = n.slice(7))`).
 *
 * Người dùng dán tay token kèm chữ "Bearer " cũng dính y hệt, nên chuẩn hóa ở cả lúc ghi lẫn lúc dùng.
 */
export function chuanHoaBearer(token: string | null | undefined): string | null {
  const sach = token?.trim();
  if (!sach) return null;
  return sach.replace(/^Bearer\s+/i, '');
}

export type ThongTinToken = {
  /** Mốc hết hạn (claim `exp`). Token MISA sống khoảng 20,5 tiếng kể từ lúc đăng nhập. */
  hetHanLuc: Date | null;
  env: string | null;
  dbid: string | null;
  tid: string | null;
  tco: string | null;
};

/**
 * Đọc phần payload của Bearer token (JWT) — nó chứa sẵn hạn dùng và toàn bộ định danh tenant, nên
 * lưu token là suy ra được `env`/`dbid`/`tid`/`tco` mà không cần người dùng gõ tay.
 *
 * Chỉ giải mã (base64url), KHÔNG kiểm chữ ký — ta không có khóa của MISA và cũng không cần: token
 * này do chính người dùng dán vào, mục đích chỉ là đọc thông tin kèm theo.
 */
export function docThongTinToken(bearerToken: string | null | undefined): ThongTinToken {
  const rong: ThongTinToken = { hetHanLuc: null, env: null, dbid: null, tid: null, tco: null };
  if (!bearerToken) return rong;

  const phan = (chuanHoaBearer(bearerToken) ?? '').split('.');
  if (phan.length < 2) return rong;

  try {
    const payload = JSON.parse(Buffer.from(phan[1], 'base64url').toString('utf8')) as {
      exp?: number;
      env?: string;
      dbid?: string;
      tid?: string;
      tco?: string;
    };

    return {
      hetHanLuc: typeof payload.exp === 'number' ? new Date(payload.exp * 1000) : null,
      env: payload.env || null,
      dbid: payload.dbid || null,
      tid: payload.tid || null,
      tco: payload.tco || null,
    };
  } catch {
    // Token dán sai/cắt cụt — coi như không đọc được, phần còn lại vẫn lưu bình thường.
    return rong;
  }
}

export type MisaCredentialRow = {
  bearerToken: string | null;
  cookie: string | null;
  deviceId: string | null;
  msBid: string | null;
  dbid: string | null;
  tid: string | null;
  tco: string | null;
  brid: string | null;
  env: string;
};

/**
 * Bộ header cho mọi request lấy DỮ LIỆU của eShop: Bearer + context tenant/chi nhánh.
 *
 * CỐ TÌNH KHÔNG gửi cookie. Nghe ngược đời (gửi thêm bằng chứng đăng nhập thì phải chặt hơn chứ?)
 * nhưng đo thực tế ngày 16/08/2026: cùng một Bearer token vừa lấy, gửi kèm cookie đã lưu thì MISA
 * trả 422 {"Error":401,"IsAuthExpired":true}, bỏ cookie đi thì trả 200 kèm dữ liệu. Lý do: cookie
 * mang `x-sessionid` của phiên MISA ID cũ, mà eShop lại tin cookie hơn Bearer — phiên cũ hết hạn là
 * cả request hỏng theo, dù token mới tinh.
 *
 * Cookie vẫn cần cho luồng ĐĂNG NHẬP (chuỗi SSO, đổi phiên) — chỉ riêng API dữ liệu là không.
 */
export function dungHeaderMisa(row: MisaCredentialRow, referer: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json, text/plain, */*',
    'Content-Type': 'application/json',
    Origin: 'https://amisapp.misa.vn',
    Referer: referer,
    // Chuẩn hóa ngay tại đây nữa (dù lúc ghi đã cắt) để hàng đã lỡ lưu kèm "Bearer " từ bản cũ vẫn
    // gọi được, khỏi phải chạy migration sửa dữ liệu.
    Authorization: `Bearer ${chuanHoaBearer(row.bearerToken) ?? ''}`,
  };
  if (row.deviceId) headers['x-deviceid'] = row.deviceId;
  if (row.msBid) headers['x-ms-bid'] = row.msBid;
  if (row.dbid && row.tid) {
    headers['x-ems-context'] = JSON.stringify({
      dbid: row.dbid,
      tid: row.tid,
      tco: row.tco || '',
      lang: 'vi',
      brid: row.brid || '',
      shtype: 3,
      ica: false,
    });
  }
  return headers;
}

/** Credential đầy đủ (kèm token) — chỉ dùng phía server, không bao giờ trả về client. */
export async function layCredentialMisa(): Promise<MisaCredentialRow | null> {
  const row = await prisma.misaCredential.findUnique({ where: { id: CREDENTIAL_ID } });
  return row?.bearerToken ? row : null;
}

export type MisaCredentialPublic = {
  hasToken: boolean;
  tokenPreview: string | null;
  hasCookie: boolean;
  deviceId: string | null;
  msBid: string | null;
  dbid: string | null;
  tid: string | null;
  tco: string | null;
  brid: string | null;
  env: string;
  /** ISO mốc hết hạn token, null nếu chưa lưu token hoặc không đọc được. */
  tokenExpiresAt: string | null;
  updatedAt: string | null;
  lastCheckedAt: string | null;
  lastCheckOk: boolean | null;
  lastCheckMessage: string | null;
};

export type MisaCredentialInput = {
  bearerToken?: string;
  cookie?: string;
  deviceId?: string;
  msBid?: string;
  dbid?: string;
  tid?: string;
  tco?: string;
  brid?: string;
  env?: string;
};

export type MisaCheckResult = {
  ok: boolean;
  status: number;
  message: string;
};

/** Không bao giờ trả bearerToken/cookie đầy đủ về client — chỉ vài ký tự cuối để nhận biết đã lưu token nào. */
function toPublic(row: {
  bearerToken: string | null;
  cookie: string | null;
  deviceId: string | null;
  msBid: string | null;
  dbid: string | null;
  tid: string | null;
  tco: string | null;
  brid: string | null;
  env: string;
  tokenExpiresAt: Date | null;
  updatedAt: Date;
  lastCheckedAt: Date | null;
  lastCheckOk: boolean | null;
  lastCheckMessage: string | null;
} | null): MisaCredentialPublic {
  if (!row) {
    return {
      hasToken: false,
      tokenPreview: null,
      hasCookie: false,
      deviceId: null,
      msBid: null,
      dbid: null,
      tid: null,
      tco: null,
      brid: null,
      env: 'g3',
      tokenExpiresAt: null,
      updatedAt: null,
      lastCheckedAt: null,
      lastCheckOk: null,
      lastCheckMessage: null,
    };
  }

  return {
    hasToken: !!row.bearerToken,
    tokenPreview: row.bearerToken ? `...${row.bearerToken.slice(-10)}` : null,
    hasCookie: !!row.cookie,
    deviceId: row.deviceId,
    msBid: row.msBid,
    dbid: row.dbid,
    tid: row.tid,
    tco: row.tco,
    brid: row.brid,
    env: row.env,
    tokenExpiresAt: row.tokenExpiresAt ? row.tokenExpiresAt.toISOString() : null,
    updatedAt: row.updatedAt.toISOString(),
    lastCheckedAt: row.lastCheckedAt ? row.lastCheckedAt.toISOString() : null,
    lastCheckOk: row.lastCheckOk,
    lastCheckMessage: row.lastCheckMessage,
  };
}

export class MisaService {
  /** Lấy thông tin credential đã lưu (đã ẩn token/cookie) để hiển thị ở trang Cài đặt. */
  static async getCredential(): Promise<Result<MisaCredentialPublic>> {
    try {
      const row = await prisma.misaCredential.findUnique({ where: { id: CREDENTIAL_ID } });
      return { success: true, data: toPublic(row) };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Lỗi khi lấy cấu hình MISA' };
    }
  }

  /** Cập nhật từng phần — field nào không gửi lên (undefined) thì giữ nguyên giá trị cũ. */
  static async saveCredential(input: MisaCredentialInput): Promise<Result<MisaCredentialPublic>> {
    try {
      const data: Record<string, string | Date | null> = {};
      for (const [key, value] of Object.entries(input)) {
        if (typeof value === 'string' && value.trim() !== '') data[key] = value.trim();
      }

      // Token mới thì lấy luôn hạn dùng + định danh tenant từ chính nó, đỡ phải gõ tay. Giá trị
      // người dùng tự nhập vẫn được ưu tiên (đã nằm sẵn trong `data`).
      if (typeof data.bearerToken === 'string') {
        // Dán cả cụm "Bearer eyJ..." từ DevTools là chuyện thường — cắt tiền tố, không thì header
        // gửi đi thành "Bearer Bearer eyJ..." và MISA trả 401.
        data.bearerToken = chuanHoaBearer(data.bearerToken);
        const tt = docThongTinToken(data.bearerToken);
        data.tokenExpiresAt = tt.hetHanLuc;
        for (const khoa of ['env', 'dbid', 'tid', 'tco'] as const) {
          if (!data[khoa] && tt[khoa]) data[khoa] = tt[khoa];
        }
      }

      const row = await prisma.misaCredential.upsert({
        where: { id: CREDENTIAL_ID },
        create: { id: CREDENTIAL_ID, ...data },
        update: data,
      });
      return { success: true, data: toPublic(row) };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Lỗi khi lưu cấu hình MISA' };
    }
  }

  /**
   * Ping thử API MISA bằng credential đã lưu — gọi dBOptions/get-by-optionids (chỉ đọc, không tạo
   * dữ liệu) để kiểm tra Bearer token còn hoạt động hay đã hết hạn (IsAuthExpired).
   */
  static async checkToken(): Promise<Result<MisaCheckResult>> {
    try {
      const row = await prisma.misaCredential.findUnique({ where: { id: CREDENTIAL_ID } });

      if (!row?.bearerToken) {
        const result: MisaCheckResult = { ok: false, status: 0, message: 'Chưa cấu hình Bearer token.' };
        return { success: true, data: result };
      }

      const headers = dungHeaderMisa(row, 'https://amisapp.misa.vn/eshop/management/general-info');

      const res = await fetch(`${misaBaseUrl(row.env)}/system/dBOptions/get-by-optionids`, {
        method: 'POST',
        headers,
        body: JSON.stringify(['ManageLotAndExceedDate']),
      });

      let ok = res.ok;
      let message = ok ? 'Token còn hoạt động.' : `Lỗi HTTP ${res.status}.`;

      try {
        const json = (await res.json()) as { Error?: number; IsAuthExpired?: boolean };
        if (json?.IsAuthExpired) {
          ok = false;
          message = 'Token đã hết hạn (IsAuthExpired) — bấm "Gia hạn token ngay" ở tab Cài đặt.';
        }
      } catch {
        // Body không phải JSON hợp lệ — giữ nguyên message theo status HTTP ở trên.
      }

      const result: MisaCheckResult = { ok, status: res.status, message };

      await prisma.misaCredential.update({
        where: { id: CREDENTIAL_ID },
        data: { lastCheckedAt: new Date(), lastCheckOk: ok, lastCheckMessage: message },
      });

      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không kết nối được tới MISA.';
      try {
        await prisma.misaCredential.update({
          where: { id: CREDENTIAL_ID },
          data: { lastCheckedAt: new Date(), lastCheckOk: false, lastCheckMessage: message },
        });
      } catch {
        // Chưa có row (chưa từng lưu credential) — bỏ qua, đã trả lỗi ở nhánh success:false bên dưới.
      }
      return { success: false, error: message };
    }
  }
}
