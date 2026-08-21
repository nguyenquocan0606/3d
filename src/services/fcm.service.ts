import { createSign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Gửi push tới app Flutter qua Firebase Cloud Messaging (HTTP v1).
 *
 * Không dùng `firebase-admin`: cả gói đó chỉ để làm đúng hai việc dưới đây — ký một JWT rồi POST
 * một JSON — trong khi kéo theo hàng chục MB phụ thuộc và một tầng khởi tạo toàn cục khó kiểm soát
 * trong môi trường hot-reload của Next.
 *
 * Cấu hình: đặt file service account (Firebase Console → Cài đặt dự án → Tài khoản dịch vụ → Tạo
 * khóa riêng tư mới) tại `data/fcm-service-account.json`, hoặc trỏ biến môi trường
 * `FCM_SERVICE_ACCOUNT_FILE` tới đường dẫn khác, hoặc dán nguyên nội dung JSON vào
 * `FCM_SERVICE_ACCOUNT`. Thiếu cấu hình thì mọi lời gọi trả về "chưa cấu hình" chứ không ném lỗi —
 * vòng giám sát máy in không được phép chết chỉ vì chưa cài Firebase.
 */

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

const PHAM_VI = 'https://www.googleapis.com/auth/firebase.messaging';
const URL_TOKEN = 'https://oauth2.googleapis.com/token';

let taiKhoan: ServiceAccount | null | undefined; // undefined = chưa đọc, null = không có
let tokenHienTai: { value: string; hetHanLuc: number } | null = null;

/** Đọc service account một lần rồi nhớ luôn. Trả null nếu chưa cấu hình hoặc file hỏng. */
async function docTaiKhoan(): Promise<ServiceAccount | null> {
  if (taiKhoan !== undefined) return taiKhoan;

  const thoRaw = process.env.FCM_SERVICE_ACCOUNT;
  let raw: string | null = thoRaw?.trim() ? thoRaw : null;

  if (!raw) {
    const duongDan =
      process.env.FCM_SERVICE_ACCOUNT_FILE ||
      path.join(process.cwd(), 'data', 'fcm-service-account.json');
    raw = await readFile(duongDan, 'utf8').catch(() => null);
  }

  if (!raw) {
    taiKhoan = null;
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as ServiceAccount;
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
      console.warn('[FCM] File service account thiếu project_id/client_email/private_key.');
      taiKhoan = null;
      return null;
    }
    // JSON dán qua biến môi trường thường bị escape xuống dòng thành "\\n".
    parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    taiKhoan = parsed;
    return parsed;
  } catch (loi) {
    console.warn('[FCM] Không đọc được service account:', loi);
    taiKhoan = null;
    return null;
  }
}

/** Cho phép nạp lại cấu hình mà không cần restart server (sau khi vừa copy file vào `data/`). */
export function quenCauHinhFcm() {
  taiKhoan = undefined;
  tokenHienTai = null;
}

export async function fcmDaCauHinh(): Promise<boolean> {
  return (await docTaiKhoan()) !== null;
}

function base64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Access token của Google, hạn 1 giờ. Xin lại trước hạn 5 phút để không bao giờ dùng token sắp chết
 * (đồng hồ máy chủ lệch vài giây là đủ để Google từ chối).
 */
async function layAccessToken(tk: ServiceAccount): Promise<string> {
  if (tokenHienTai && tokenHienTai.hetHanLuc > Date.now()) return tokenHienTai.value;

  const bayGio = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64Url(
    JSON.stringify({
      iss: tk.client_email,
      scope: PHAM_VI,
      aud: URL_TOKEN,
      iat: bayGio,
      exp: bayGio + 3600,
    }),
  );

  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  const chuKy = base64Url(signer.sign(tk.private_key));

  const res = await fetch(URL_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${payload}.${chuKy}`,
    }),
    signal: AbortSignal.timeout(15000),
  });

  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    error_description?: string;
    error?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(
      `Không lấy được access token Google: ${data.error_description || data.error || res.status}`,
    );
  }

  tokenHienTai = { value: data.access_token, hetHanLuc: Date.now() + 55 * 60 * 1000 };
  return data.access_token;
}

export type KetQuaGuiFcm = {
  /** Số token gửi thành công. */
  thanhCong: number;
  /** Token đã chết (app gỡ cài đặt, token xoay) — nơi gọi nên tắt chúng trong DB. */
  tokenChet: string[];
  /** Lỗi khác (mạng, cấu hình sai) để hiện lên UI. */
  loi: string[];
};

export type NoiDungPush = {
  tieuDe: string;
  noiDung: string;
  /** Đi kèm để app biết mở màn nào. Giá trị buộc phải là chuỗi — FCM từ chối kiểu khác. */
  duLieu?: Record<string, string>;
  /** loi | canhBao | tin — app dùng để chọn kênh (chuông to hay im). */
  mucDo?: string;
};

/**
 * Gửi tới nhiều token. Gửi tuần tự từng cái vì FCM v1 không còn API gửi lô, nhưng số máy trong
 * xưởng chỉ vài cái nên không đáng để song song hóa.
 */
export async function guiFcm(tokens: string[], noiDung: NoiDungPush): Promise<KetQuaGuiFcm> {
  const ketQua: KetQuaGuiFcm = { thanhCong: 0, tokenChet: [], loi: [] };
  if (tokens.length === 0) return ketQua;

  const tk = await docTaiKhoan();
  if (!tk) {
    ketQua.loi.push('Chưa cấu hình Firebase (thiếu data/fcm-service-account.json).');
    return ketQua;
  }

  let accessToken: string;
  try {
    accessToken = await layAccessToken(tk);
  } catch (loi) {
    ketQua.loi.push(loi instanceof Error ? loi.message : String(loi));
    return ketQua;
  }

  // Sự cố phải kêu ngay cả khi máy đang ngủ; tin thường thì để hệ điều hành gom cho đỡ tốn pin.
  const uuTien = noiDung.mucDo === 'loi' || noiDung.mucDo === 'canhBao';
  const kenh = noiDung.mucDo === 'loi' ? 'may_in_su_co' : 'may_in_hoat_dong';

  const url = `https://fcm.googleapis.com/v1/projects/${tk.project_id}/messages:send`;

  for (const token of tokens) {
    const message = {
      token,
      notification: { title: noiDung.tieuDe, body: noiDung.noiDung },
      data: { ...(noiDung.duLieu || {}), mucDo: noiDung.mucDo || 'tin' },
      android: {
        priority: uuTien ? 'HIGH' : 'NORMAL',
        notification: { channel_id: kenh, sound: 'default' },
      },
      apns: {
        headers: { 'apns-priority': uuTien ? '10' : '5' },
        payload: { aps: { sound: 'default', 'interruption-level': uuTien ? 'time-sensitive' : 'active' } },
      },
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message }),
        signal: AbortSignal.timeout(15000),
      });

      if (res.ok) {
        ketQua.thanhCong += 1;
        continue;
      }

      const loiData = (await res.json().catch(() => ({}))) as {
        error?: { status?: string; message?: string; details?: Array<{ errorCode?: string }> };
      };
      const ma =
        loiData.error?.details?.find((d) => d.errorCode)?.errorCode || loiData.error?.status || '';

      // UNREGISTERED: app đã gỡ. INVALID_ARGUMENT ở đây gần như luôn là token rác.
      if (ma === 'UNREGISTERED' || res.status === 404 || ma === 'INVALID_ARGUMENT') {
        ketQua.tokenChet.push(token);
      } else {
        ketQua.loi.push(loiData.error?.message || `FCM trả HTTP ${res.status}`);
      }
    } catch (loi) {
      ketQua.loi.push(loi instanceof Error ? loi.message : String(loi));
    }
  }

  return ketQua;
}
