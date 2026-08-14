import prisma from '../utils/db';
import type { Result } from '../types/result';

const MISA_BASE_URL = 'https://amisapp.misa.vn/eshop/g2/api';
const CREDENTIAL_ID = 'default';

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
      const data: Record<string, string> = {};
      for (const [key, value] of Object.entries(input)) {
        if (typeof value === 'string' && value.trim() !== '') data[key] = value.trim();
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

      const headers: Record<string, string> = {
        Accept: 'application/json, text/plain, */*',
        'Content-Type': 'application/json',
        Origin: 'https://amisapp.misa.vn',
        Referer: 'https://amisapp.misa.vn/eshop/management/general-info',
        Authorization: `Bearer ${row.bearerToken}`,
      };
      if (row.cookie) headers['Cookie'] = row.cookie;
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

      const res = await fetch(`${MISA_BASE_URL}/system/dBOptions/get-by-optionids`, {
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
          message = 'Token đã hết hạn (IsAuthExpired) — vào MISA đăng nhập lại rồi cập nhật token mới.';
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
