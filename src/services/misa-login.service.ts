import prisma from '@/utils/db';
import { chuanHoaBearer, docThongTinToken } from './misa.service';

/**
 * Đăng nhập MISA bằng tài khoản/mật khẩu (dùng tài khoản phụ, để không tranh phiên với máy chính).
 *
 * Luồng thật của trang login MISA, bắt từ DevTools:
 *   1. POST /Account/status                  {UserName}                → cấp cookie x-deviceid
 *   2. POST /Account/login                   {UserName, Password}      → Code 99/SubCode 8 = cần 2FA
 *   3. POST /Account/loginwithotpanotherway  {Token}                   → bắn OTP về SĐT
 *   4. POST /Account/loginwithotp            {OTP, Token, Remember}    → cấp cookie phiên
 *
 * Token tạm ở bước 2 sống khoảng 10 phút nên phải nhập OTP nhanh.
 */
const AUTHEN_API = 'https://amisapp.misa.vn/APIS/AuthenAPI/api/Account';
const REFERER_LOGIN = 'https://amisapp.misa.vn/login/';
const CREDENTIAL_ID = 'default';

/**
 * MISA trả `Code: 99` cho MỌI lỗi đăng nhập, phải nhìn `SubCode` mới biết chuyện gì:
 *   SubCode 8   = cần xác thực 2 lớp (không phải lỗi thật, chỉ là cần thêm OTP)
 *   SubCode 102 = sai tên đăng nhập hoặc mật khẩu
 * Kiểm mỗi `Code: 99` là nhận nhầm đăng nhập sai thành "cần OTP" — đã dính lúc chạy thử.
 */
const SUBCODE_CAN_2FA = 8;

export class LoiDangNhapMisa extends Error {}

/**
 * Cookie đăng nhập MISA đã hết hạn (bị đá về trang login).
 *
 * Tách riêng khỏi lỗi thường vì đây là ca duy nhất bắt buộc người dùng phải nhập lại mật khẩu —
 * chỗ hiển thị trạng thái cần phân biệt được "hết phiên" với "MISA lỗi/mạng hỏng".
 */
export class LoiPhienHetHan extends LoiDangNhapMisa {}

type PhanHoiMisa = {
  Success?: boolean;
  Code?: number;
  SubCode?: number;
  UserMessage?: string | null;
  SystemMessage?: string | null;
  Data?: unknown;
};

/** Gom cookie dạng "name=value" — dùng cả để gửi đi và để lưu lại vào MisaCredential. */
type BinhCookie = Map<string, string>;

function nhapSetCookie(binh: BinhCookie, setCookie: string[]) {
  for (const dong of setCookie) {
    const cap = dong.split(';')[0];
    const viTri = cap.indexOf('=');
    if (viTri <= 0) continue;

    const ten = cap.slice(0, viTri).trim();
    const giaTri = cap.slice(viTri + 1).trim();
    // MISA xóa cookie bằng cách set giá trị rỗng kèm expires quá khứ (VD x-tenantid) — bỏ qua,
    // không thì cookie rỗng đè mất giá trị thật được set ngay sau đó.
    if (!giaTri) continue;
    binh.set(ten, giaTri);
  }
}

function chuoiCookie(binh: BinhCookie): string {
  return [...binh.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

/** Đọc chuỗi "a=1; b=2" đã lưu trong DB thành bình cookie để đi tiếp các bước sau. */
function docCookie(chuoi: string): BinhCookie {
  const binh: BinhCookie = new Map();
  for (const cap of chuoi.split(';')) {
    const viTri = cap.indexOf('=');
    if (viTri > 0) binh.set(cap.slice(0, viTri).trim(), cap.slice(viTri + 1).trim());
  }
  return binh;
}

/** Khuôn một JWT: ba đoạn base64url ngăn bởi dấu chấm, đoạn đầu luôn bắt đầu bằng `eyJ`. */
const KHUON_JWT = /eyJ[\w-]+\.[\w-]+\.[\w-]+/;

/**
 * Tìm JWT trong phản hồi mà không cần biết chính xác đường dẫn field.
 *
 * MISA để token đâu đó trong `Data` nhưng cấu trúc không cố định, nên duyệt cả cây tìm chuỗi có
 * dạng JWT — bền hơn là đoán tên field rồi sai.
 *
 * Ba cái bẫy đã dính, xử lý cả ba ở đây:
 *  1. `Data` nhiều khi là JSON ĐÃ ĐÓNG GÓI THÀNH CHUỖI (`"{\"AccessToken\":\"eyJ...\"}"`). Bản cũ
 *     so cả cục chuỗi với khuôn JWT, trượt, rồi trả null — token nằm ngay bên trong mà không thấy.
 *     Giờ gặp chuỗi trông như JSON thì mở ra duyệt tiếp.
 *  2. Token đôi khi nằm LỒNG trong chuỗi dài hơn (VD `"Bearer eyJ..."`), nên dò khuôn ở dạng tìm
 *     con, không bắt buộc khớp từ đầu đến cuối.
 *  3. Cây phản hồi của MISA sâu hơn 6 tầng ở vài endpoint.
 */
export function timJwt(node: unknown, sau = 0): string | null {
  if (sau > 10) return null;

  if (typeof node === 'string') {
    const chuoi = node.trim();

    const khop = chuoi.match(KHUON_JWT);
    if (khop) return khop[0];

    // Không chứa JWT nhưng có thể là JSON gói trong chuỗi — mở ra tìm tiếp.
    if (/^[[{]/.test(chuoi)) {
      try {
        return timJwt(JSON.parse(chuoi), sau + 1);
      } catch {
        // Không phải JSON thật — coi như chuỗi thường, hết đường.
      }
    }
    return null;
  }

  if (Array.isArray(node)) {
    for (const con of node) {
      const thay = timJwt(con, sau + 1);
      if (thay) return thay;
    }
    return null;
  }

  if (node && typeof node === 'object') {
    for (const con of Object.values(node as Record<string, unknown>)) {
      const thay = timJwt(con, sau + 1);
      if (thay) return thay;
    }
  }
  return null;
}

/**
 * Mô tả HÌNH DẠNG của phản hồi (tên field + kiểu + độ dài), KHÔNG in giá trị.
 *
 * Dùng để soi khi vẫn không tìm ra token: có cái này thì lần chạy hỏng tiếp theo tự nói cho ta biết
 * token nằm ở đâu, khỏi phải mò DevTools. Cố tình không in giá trị vì phản hồi chứa token thật —
 * log không phải chỗ để cất bí mật.
 */
function moTaCauTruc(node: unknown, sau = 0): unknown {
  if (sau > 4) return '…';
  if (node === null || node === undefined) return String(node);

  if (typeof node === 'string') {
    const nhan = `string(${node.length})`;
    if (KHUON_JWT.test(node)) return `${nhan} ← CÓ DẠNG JWT`;
    if (/^[[{]/.test(node.trim())) return `${nhan} ← JSON gói trong chuỗi`;
    return nhan;
  }
  if (typeof node !== 'object') return typeof node;
  if (Array.isArray(node)) return node.length === 0 ? '[]' : [moTaCauTruc(node[0], sau + 1), `…(${node.length})`];

  const ra: Record<string, unknown> = {};
  for (const [khoa, giaTri] of Object.entries(node as Record<string, unknown>)) {
    ra[khoa] = moTaCauTruc(giaTri, sau + 1);
  }
  return ra;
}

/** Gọi khi moi token thất bại — in hình dạng phản hồi ra log server để lần sau lần được manh mối. */
function ghiLogThieuToken(buoc: string, phanHoi: PhanHoiMisa) {
  console.warn(
    `[MISA] Không tìm thấy JWT trong phản hồi bước "${buoc}". Hình dạng phản hồi:`,
    JSON.stringify(moTaCauTruc(phanHoi), null, 2),
  );
}

async function goiAuthen(
  duongDan: string,
  body: Record<string, unknown>,
  binh: BinhCookie,
): Promise<PhanHoiMisa> {
  let res: Response;
  try {
    res = await fetch(`${AUTHEN_API}/${duongDan}`, {
      method: 'POST',
      headers: {
        Accept: '*/*',
        'Content-Type': 'application/json',
        Origin: 'https://amisapp.misa.vn',
        Referer: REFERER_LOGIN,
        'x-culture': 'vi',
        ...(binh.size > 0 ? { Cookie: chuoiCookie(binh) } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new LoiDangNhapMisa(
      `Không kết nối được tới MISA: ${error instanceof Error ? error.message : 'lỗi mạng'}`,
    );
  }

  if (typeof res.headers.getSetCookie === 'function') {
    nhapSetCookie(binh, res.headers.getSetCookie());
  }

  if (!res.ok) throw new LoiDangNhapMisa(`MISA trả lỗi HTTP ${res.status} ở bước ${duongDan}.`);

  try {
    return (await res.json()) as PhanHoiMisa;
  } catch {
    throw new LoiDangNhapMisa(`MISA trả dữ liệu không phải JSON ở bước ${duongDan}.`);
  }
}

export type KetQuaBuoc1 =
  | { canOtp: true; token: string; cookie: string; message: string }
  // Nhánh không cần OTP cũng phải mang `tokenMisaId` về: nó là thứ duy nhất đổi được sang phiên
  // eShop. Thiếu nó thì đăng nhập "thành công" nhưng không có Bearer token — vô dụng.
  | { canOtp: false; cookie: string; message: string; tokenMisaId: string | null };

/**
 * Bước 1: gửi tài khoản/mật khẩu. Tài khoản bật 2FA thì trả về token tạm + đã bắn OTP đi;
 * tài khoản không bật 2FA (hoặc thiết bị đã được ghi nhớ) thì đăng nhập xong luôn.
 */
export async function batDauDangNhapMisa(userName: string, password: string): Promise<KetQuaBuoc1> {
  if (!userName.trim() || !password) throw new LoiDangNhapMisa('Thiếu tài khoản hoặc mật khẩu.');

  const binh: BinhCookie = new Map();

  // Bước 1: lấy cookie x-deviceid. MISA gắn thiết bị vào cookie này, thiếu nó bước sau có thể hỏng.
  await goiAuthen('status', { UserName: userName.trim() }, binh);

  // Bước 2: gửi mật khẩu.
  const dangNhap = await goiAuthen(
    'login',
    { UserName: userName.trim(), Password: password },
    binh,
  );

  if (dangNhap.Success) {
    // Thiết bị đã được ghi nhớ từ lần trước (Remember: true) nên MISA bỏ qua OTP.
    // Khi đó token MISA ID nằm luôn trong phản hồi `login` này — KHÔNG có bước `loginwithotp` nào
    // chạy sau để lấy nữa, nên phải moi ra ngay tại đây.
    const tokenMisaId =
      timJwt(dangNhap.Data) ?? timJwt(dangNhap) ?? timJwt([...binh.values()]);
    if (!tokenMisaId) ghiLogThieuToken('login (bỏ qua OTP)', dangNhap);

    return {
      canOtp: false,
      cookie: chuoiCookie(binh),
      message: 'Đăng nhập thành công, không cần OTP.',
      tokenMisaId,
    };
  }

  if (dangNhap.SubCode !== SUBCODE_CAN_2FA) {
    throw new LoiDangNhapMisa(
      dangNhap.UserMessage || dangNhap.SystemMessage || 'Sai tài khoản hoặc mật khẩu.',
    );
  }

  const token = timJwt(dangNhap.Data);
  if (!token) {
    throw new LoiDangNhapMisa('MISA yêu cầu OTP nhưng không tìm thấy token tạm trong phản hồi.');
  }

  // Bước 3: yêu cầu MISA bắn OTP (về SĐT hoặc email tùy cấu hình tài khoản).
  const guiOtp = await goiAuthen('loginwithotpanotherway', { Token: token }, binh);

  return {
    canOtp: true,
    token,
    cookie: chuoiCookie(binh),
    message: guiOtp.UserMessage || dangNhap.UserMessage || 'Đã gửi mã OTP.',
  };
}

/**
 * Bước 2: gửi mã OTP kèm token tạm. `Remember: true` để MISA ghi nhớ thiết bị — lần đăng nhập sau
 * hy vọng không phải nhập OTP nữa.
 */
export async function xacThucOtpMisa(
  token: string,
  otp: string,
  cookieCu: string,
): Promise<{ cookie: string; tokenMisaId: string | null }> {
  if (!otp.trim()) throw new LoiDangNhapMisa('Chưa nhập mã OTP.');

  const binh = docCookie(cookieCu);

  const ketQua = await goiAuthen(
    'loginwithotp',
    { OTP: otp.trim(), UseAppAuthenticator: false, Remember: true, Token: token },
    binh,
  );

  if (!ketQua.Success) {
    throw new LoiDangNhapMisa(ketQua.UserMessage || ketQua.SystemMessage || 'Mã OTP không đúng.');
  }

  // Token MISA ID dùng để đổi lấy phiên eShop ở bước sau. Tìm trong `Data` trước (chỗ MISA hay để),
  // không thấy thì quét cả phản hồi phòng khi nó nằm ngoài `Data`.
  // Ba nơi có thể chứa token, dò lần lượt: `Data` (chỗ MISA hay để) → cả thân phản hồi → cookie
  // MISA vừa set (vài luồng SSO trả token qua cookie chứ không qua body).
  const tokenMisaId =
    timJwt(ketQua.Data) ?? timJwt(ketQua) ?? timJwt([...binh.values()]);
  if (!tokenMisaId) ghiLogThieuToken('loginwithotp', ketQua);

  return { cookie: chuoiCookie(binh), tokenMisaId };
}

/**
 * Đăng nhập MISA ID xong mới chỉ có phiên chung, CHƯA có Bearer token của eShop. Bước cuối là đổi
 * vé SSO lấy phiên eShop qua API riêng của eShop (tìm được trong bundle JS của app):
 *
 *   GET  {eshop}/auth/Accounts/login/{tenantId}?tokenMisaId=...&force=true
 *   GET  {eshop}/auth/Accounts/login-amis/{tenantId}?sessionId=...&force=true
 *   POST {eshop}/auth/Accounts/refresh-token   {RefreshToken}
 *
 * Phản hồi trả `token` (Bearer), `tokenTimeout`, `_eshop_rf_token` (refresh token), `currentBranch`
 * và `tokenMisaId` mới. `force=true` để vượt lỗi ExistLoginAnotherDevice khi tài khoản đang mở ở
 * máy khác.
 */
function urlAuthEshop(env: string, duongDan: string): string {
  return `https://amisapp.misa.vn/eshop/${(env || 'g3').trim()}/api/auth/Accounts/${duongDan}`;
}

type PhienEshop = {
  token?: string;
  tokenTimeout?: number;
  currentBranch?: { branch_id?: string } | null;
  _eshop_rf_token?: string;
  /** eShop cấp lại tokenMisaId mới mỗi lần đổi phiên — lưu để làm đường lùi khi refresh hỏng. */
  tokenMisaId?: string;
};

/** Gọi một endpoint đổi-vé-lấy-phiên của eShop và đọc phiên trong phản hồi. */
async function goiDoiPhienEshop(url: string, cookie: string): Promise<PhienEshop> {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json, text/plain, */*',
      Origin: 'https://amisapp.misa.vn',
      Referer: 'https://amisapp.misa.vn/eshop/management',
      Cookie: cookie,
    },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new LoiDangNhapMisa(`Không lấy được phiên eShop (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }

  try {
    return JSON.parse(text) as PhienEshop;
  } catch {
    throw new LoiDangNhapMisa('Phiên eShop trả về dữ liệu không phải JSON.');
  }
}

/** Đổi tokenMisaId lấy phiên eShop (Bearer + refresh token). */
export async function layPhienEshop(
  tokenMisaId: string,
  tenantId: string,
  cookie: string,
  env: string,
): Promise<PhienEshop> {
  const url = `${urlAuthEshop(env, `login/${tenantId}`)}?tokenMisaId=${encodeURIComponent(tokenMisaId)}&force=true`;
  return goiDoiPhienEshop(url, cookie);
}

/** Đổi phiên AMIS Platform (`sid`) lấy phiên eShop — nhánh dùng khi vào eShop từ tên miền AMIS. */
export async function layPhienEshopBangSid(
  sid: string,
  tenantId: string,
  cookie: string,
  env: string,
): Promise<PhienEshop> {
  const url = `${urlAuthEshop(env, `login-amis/${tenantId}`)}?sessionId=${encodeURIComponent(sid)}&force=true`;
  return goiDoiPhienEshop(url, cookie);
}

// ────────────────────────────────────────────────────────────────────────────
// Tự đi hết luồng SSO AMIS → eShop
//
// Trước đây chỗ này là ngõ cụt: tưởng `tokenMisaId` chỉ sinh ra trên trình duyệt nên bắt người dùng
// tự chép `KeyCacheMID` từ Local Storage. Đọc bundle JS của eShop mới thấy nó chỉ là tham số trên
// URL trang callback, mà URL đó thì chỉ cần cookie đăng nhập là xin được:
//
//   GET /eshop/api/oauth/oauth/amisplcallback          (kèm cookie phiên AMIS)
//     → 302 /eshop/management/login-amispl-callback?sid=…&tenantId=…&env=g3
//
// Chưa đăng nhập thì nó đá về /login, nhờ vậy phân biệt được "cookie hết hạn" với lỗi thật.
// Nhánh MISA ID cũng y hệt, chỉ khác tham số (`tokenMisaId` thay cho `sid`).
//
// Đã đo bằng chính tài khoản thật ngày 15/08/2026: 1 chặng là ra vé.
// ────────────────────────────────────────────────────────────────────────────

/** Mọi chặng của chuỗi SSO đều nằm trên tên miền này; ra khỏi đây là dừng, không gửi cookie đi tiếp. */
const HOST_MISA = 'amisapp.misa.vn';

/** Điểm vào luồng SSO sang eShop — đúng địa chỉ app eShop tự gọi khi cần đăng nhập lại (AMISPL.redirectUri). */
const CUA_VAO_SSO_ESHOP = `https://${HOST_MISA}/eshop/api/oauth/oauth/amisplcallback`;

/** Chặn vòng chuyển hướng vô hạn. Thực tế chỉ 1 chặng, để rộng phòng khi MISA chèn thêm bước. */
const SO_CHANG_TOI_DA = 12;

/** Vé đổi lấy phiên eShop, nhặt từ URL cuối của chuỗi SSO. */
type VeSso = {
  /** Nhánh AMIS Platform. */
  sid: string | null;
  /** Nhánh MISA ID. */
  tokenMisaId: string | null;
  tenantId: string | null;
  env: string | null;
};

/**
 * Bám theo chuỗi 302 của MISA cho tới trang callback rồi nhặt vé SSO trên URL.
 *
 * Cookie mới nhận dọc đường được nhập thẳng vào `binh` (bên gọi dùng lại để đổi phiên ngay sau đó).
 */
async function theoChuoiSsoEshop(binh: BinhCookie): Promise<VeSso> {
  let url = CUA_VAO_SSO_ESHOP;

  for (let chang = 0; chang < SO_CHANG_TOI_DA; chang += 1) {
    const diem = new URL(url);
    if (diem.hostname !== HOST_MISA) {
      throw new LoiDangNhapMisa(
        `Chuỗi SSO rẽ sang ${diem.hostname} — dừng lại, không gửi cookie đăng nhập ra ngoài ${HOST_MISA}.`,
      );
    }

    // Vé nằm ở query của chính URL đang định đi tới, nên phải soi TRƯỚC khi gọi: chặng cuối chỉ là
    // trang HTML của app eShop, gọi vào đó cũng không lấy thêm được gì.
    //
    // Phải có `tenantId` mới tính là vé thật. Dọc đường MISA còn một chặng `/eshop?sid=…` mang `sid`
    // dài 512 ký tự nhưng KHÔNG kèm tenantId — đó là vé nội bộ của AMIS, không đổi được phiên eShop.
    // Nhận nhầm nó là dừng sớm rồi gọi API với tenantId rỗng (đã dính lúc chạy thử với tài khoản thật).
    const q = diem.searchParams;
    if ((q.get('sid') || q.get('tokenMisaId')) && q.get('tenantId')) {
      return {
        sid: q.get('sid'),
        tokenMisaId: q.get('tokenMisaId'),
        tenantId: q.get('tenantId'),
        env: q.get('env'),
      };
    }
    if (q.get('hasTenant') === 'false') {
      throw new LoiDangNhapMisa('Tài khoản này không có cửa hàng eShop nào để vào.');
    }
    if (q.get('loginAMISPLFail') === 'true' || q.get('loginMisaFail') === 'true') {
      throw new LoiDangNhapMisa('MISA từ chối chuyển phiên sang eShop — thử đăng nhập lại.');
    }
    // Bị đá về trang đăng nhập = cookie đã hết hạn. Nói thẳng, đừng để lỗi hiện ra dưới dạng khó hiểu.
    if (diem.pathname === '/login' || diem.pathname.startsWith('/login/')) {
      throw new LoiPhienHetHan('Phiên đăng nhập MISA đã hết hạn — đăng nhập lại bằng tài khoản/mật khẩu.');
    }

    const res = await fetch(url, {
      redirect: 'manual',
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        Referer: 'https://amisapp.misa.vn/',
        Cookie: chuoiCookie(binh),
      },
    });

    if (typeof res.headers.getSetCookie === 'function') {
      nhapSetCookie(binh, res.headers.getSetCookie());
    }

    const ke = res.headers.get('location');
    if (!ke) {
      throw new LoiDangNhapMisa(
        `Chuỗi SSO dừng ở ${diem.pathname} (HTTP ${res.status}) mà chưa cấp vé vào eShop.`,
      );
    }
    // Location của MISA có chặng là đường dẫn tương đối ("/") — phải nối lại theo URL hiện tại.
    url = new URL(ke, url).toString();
  }

  throw new LoiDangNhapMisa(`Chuỗi SSO chuyển hướng quá ${SO_CHANG_TOI_DA} lần mà không tới nơi.`);
}

// ────────────────────────────────────────────────────────────────────────────
// Xem trạng thái phiên
// ────────────────────────────────────────────────────────────────────────────

export type TrangThaiDangNhap = {
  /** Cookie đăng nhập MISA — gốc rễ của mọi thứ, còn cái này là hệ thống còn tự xoay được token. */
  dangNhap: {
    trangThai: 'song' | 'het-han' | 'chua-co' | 'loi';
    message: string;
    tenantId: string | null;
    env: string | null;
  };
  bearer: {
    co: boolean;
    hetHanLuc: string | null;
    /** Âm nghĩa là đã hết hạn. Null khi chưa có token hoặc không đọc được hạn. */
    conLaiPhut: number | null;
  };
  coRefreshToken: boolean;
  coTokenMisaId: boolean;
  /** Có tự lấy được token mới mà không phải hỏi lại mật khẩu/OTP không. */
  tuLoDuoc: boolean;
  tomTat: string;
};

/**
 * Xem hiện trạng phiên MISA mà KHÔNG đụng gì tới nó.
 *
 * Mẹo ở đây: chuỗi SSO chỉ là mấy cú 302, đi tới lúc nhặt được vé rồi DỪNG — không gọi bước đổi
 * phiên. Nhờ vậy biết chắc "còn đăng nhập hay không" mà không cướp phiên eShop đang mở trên máy
 * chính, khác hẳn nút "Gia hạn token ngay".
 */
export async function kiemTraTrangThaiMisa(): Promise<TrangThaiDangNhap> {
  const row = await prisma.misaCredential.findUnique({ where: { id: CREDENTIAL_ID } });

  const conLaiPhut = row?.tokenExpiresAt
    ? Math.round((row.tokenExpiresAt.getTime() - Date.now()) / 60000)
    : null;

  const bearer = {
    co: !!row?.bearerToken,
    hetHanLuc: row?.tokenExpiresAt ? row.tokenExpiresAt.toISOString() : null,
    conLaiPhut,
  };

  let dangNhap: TrangThaiDangNhap['dangNhap'];
  if (!row?.cookie) {
    dangNhap = {
      trangThai: 'chua-co',
      message: 'Chưa đăng nhập MISA lần nào.',
      tenantId: null,
      env: null,
    };
  } else {
    try {
      // Dùng bản sao bình cookie: đây là hàm chỉ-xem, không được ghi đè cookie đã lưu.
      const ve = await theoChuoiSsoEshop(docCookie(row.cookie));
      dangNhap = {
        trangThai: 'song',
        message: 'Còn đăng nhập — hệ thống tự lấy được token mới bất cứ lúc nào.',
        tenantId: ve.tenantId,
        env: ve.env,
      };
    } catch (error) {
      const hetHan = error instanceof LoiPhienHetHan;
      dangNhap = {
        trangThai: hetHan ? 'het-han' : 'loi',
        message: error instanceof Error ? error.message : 'Không kiểm tra được phiên đăng nhập.',
        tenantId: null,
        env: null,
      };
    }
  }

  const tuLoDuoc =
    dangNhap.trangThai === 'song' || !!row?.refreshToken || !!row?.tokenMisaId;

  // Xếp theo mức nghiêm trọng: việc người dùng cần làm mới là thứ đáng hiện nhất.
  let tomTat: string;
  if (dangNhap.trangThai === 'het-han' && !tuLoDuoc) {
    tomTat = 'Phiên đã hết hạn — cần đăng nhập lại bằng tài khoản/mật khẩu.';
  } else if (!bearer.co) {
    tomTat = tuLoDuoc
      ? 'Chưa có Bearer token nhưng lấy được ngay — bấm "Gia hạn token ngay".'
      : 'Chưa có Bearer token và không còn đường tự lấy — đăng nhập lại.';
  } else if (conLaiPhut !== null && conLaiPhut <= 0) {
    tomTat = tuLoDuoc
      ? 'Token đã hết hạn nhưng hệ thống tự gia hạn được ở lần đồng bộ tới.'
      : 'Token đã hết hạn và không tự gia hạn được — đăng nhập lại.';
  } else if (conLaiPhut === null) {
    // Token dán tay hoặc lưu từ bản cũ nên không có mốc hết hạn. Đừng vống lên là "còn hạn" — ta
    // thật sự không biết, chỉ biết là có token.
    tomTat = tuLoDuoc
      ? 'Có Bearer token nhưng không rõ hạn — bấm "Gia hạn token ngay" để lấy token mới kèm hạn rõ ràng.'
      : 'Có Bearer token nhưng không rõ hạn và không có đường tự gia hạn.';
  } else if (!tuLoDuoc) {
    tomTat = 'Token còn dùng được, nhưng hết hạn xong sẽ phải đăng nhập lại bằng tay.';
  } else {
    tomTat = 'Mọi thứ bình thường — token còn hạn và hệ thống tự gia hạn được.';
  }

  return {
    dangNhap,
    bearer,
    coRefreshToken: !!row?.refreshToken,
    coTokenMisaId: !!row?.tokenMisaId,
    tuLoDuoc,
    tomTat,
  };
}

/**
 * Đổi cookie đăng nhập MISA thành phiên eShop đầy đủ (Bearer + refresh token).
 *
 * Đây là đường chính để có token: chỉ cần cookie — thứ mà bước đăng nhập tài khoản/mật khẩu + OTP đã
 * cấp sẵn — nên người dùng không phải mở DevTools chép gì hết.
 *
 * Trả về cả cookie đã cập nhật vì dọc chuỗi SSO MISA có set thêm cookie (env, phiên eShop).
 */
export async function doiCookieLayPhienEshop(
  cookie: string,
): Promise<{ phien: PhienEshop; cookie: string }> {
  if (!cookie.trim()) throw new LoiDangNhapMisa('Chưa có cookie đăng nhập MISA.');

  const binh = docCookie(cookie);
  const ve = await theoChuoiSsoEshop(binh);
  const cookieMoi = chuoiCookie(binh);

  if (!ve.tenantId) {
    throw new LoiDangNhapMisa('Chuỗi SSO không kèm tenantId — không biết vào cửa hàng nào.');
  }

  const env = ve.env || 'g3';
  const phien = ve.sid
    ? await layPhienEshopBangSid(ve.sid, ve.tenantId, cookieMoi, env)
    : await layPhienEshop(ve.tokenMisaId as string, ve.tenantId, cookieMoi, env);

  return { phien, cookie: cookieMoi };
}

/** Những gì đã lưu được, đủ để xin lại phiên eShop mà không cần hỏi người dùng lần nữa. */
type NguonPhien = {
  cookie: string | null;
  tokenMisaId: string | null;
  env: string;
  tid: string | null;
};

/**
 * Đường lùi thứ nhất khi refresh token hỏng: đi lại chuỗi SSO bằng cookie đăng nhập đã lưu.
 *
 * Cookie MISA sống lâu hơn hẳn Bearer token (~20,5 tiếng) và refresh token, nên đây mới là chỗ dựa
 * chính để hệ thống tự chạy mãi sau MỘT lần nhập OTP.
 */
async function xinPhienBangCookie(row: NguonPhien): Promise<{ ok: boolean; message: string }> {
  if (!row.cookie) return { ok: false, message: 'Chưa có cookie đăng nhập MISA.' };

  const { phien, cookie } = await doiCookieLayPhienEshop(row.cookie);
  if (!phien.token) return { ok: false, message: 'Chuỗi SSO không trả về Bearer token.' };

  await luuPhienEshop(phien, cookie);
  return { ok: true, message: 'Đã xin phiên eShop mới bằng cookie đăng nhập, không cần nhập lại gì.' };
}

/**
 * Đường lùi cuối: xin phiên bằng `tokenMisaId` đã lưu.
 *
 * Vé này do lần đổi phiên trước cấp (xem `luuPhienEshop`), hoặc do người dùng tự chép tay từ
 * Local Storage khoá `KeyCacheMID` khi mọi đường tự động đều tắc.
 */
async function xinPhienBangTokenMisaId(row: NguonPhien): Promise<{ ok: boolean; message: string }> {
  if (!row.tokenMisaId) {
    return {
      ok: false,
      message:
        'Không còn đường nào tự lấy được token — vào tab Cài đặt đăng nhập lại bằng tài khoản/mật khẩu MISA.',
    };
  }

  // Ưu tiên cookie, nhưng lùi được về `tid` — claim `tid` nằm sẵn trong Bearer token nên vẫn có
  // ngay cả khi cookie đã cũ hoặc chưa từng đăng nhập bằng form. Không có lối lùi này thì cookie
  // hết hạn là chặn luôn cả việc đổi tokenMisaId, dù bản thân nó vẫn còn dùng được.
  const tenantId = row.cookie?.match(/(?:^|;\s*)x-tenantid=([^;]+)/)?.[1] || row.tid || undefined;
  if (!tenantId) {
    return {
      ok: false,
      message: 'Chưa xác định được tenant — đăng nhập MISA một lần ở tab Cài đặt, hoặc dán Bearer token để lấy tid.',
    };
  }

  const phien = await layPhienEshop(row.tokenMisaId, tenantId, row.cookie || '', row.env);
  if (!phien.token) {
    // tokenMisaId cũng có hạn. Nói rõ để người dùng biết phải đi chép lại chứ không ngồi bấm lại.
    return { ok: false, message: 'tokenMisaId không còn dùng được — chép lại "KeyCacheMID" mới từ trình duyệt.' };
  }

  await luuPhienEshop(phien, row.cookie || '');
  return { ok: true, message: 'Đã xin phiên eShop mới bằng tokenMisaId.' };
}

/**
 * Thử lần lượt mọi đường lùi để có phiên eShop mới, dừng ở đường đầu tiên chạy được.
 *
 * Thứ tự theo độ bền: cookie đăng nhập (sống lâu nhất) trước, rồi mới tới `tokenMisaId`. Lỗi của
 * đường trước được gộp vào thông báo cuối để người dùng biết đã thử những gì.
 */
async function xinPhienDuPhong(row: NguonPhien): Promise<{ ok: boolean; message: string }> {
  const lyDo: string[] = [];

  for (const duong of [xinPhienBangCookie, xinPhienBangTokenMisaId]) {
    try {
      const kq = await duong(row);
      if (kq.ok) return kq;
      lyDo.push(kq.message);
    } catch (error) {
      lyDo.push(error instanceof Error ? error.message : 'lỗi không rõ');
    }
  }

  return { ok: false, message: lyDo.join(' ') };
}

/**
 * Gia hạn Bearer token bằng refresh token — KHÔNG cần mật khẩu, KHÔNG cần OTP.
 * Đây là đường để hệ thống tự chạy mãi sau một lần đăng nhập duy nhất.
 *
 * Refresh token hỏng thì lùi về cookie/`tokenMisaId`, thay vì bắt người dùng đăng nhập lại từ đầu.
 */
export async function lamMoiTokenEshop(): Promise<{ ok: boolean; message: string }> {
  const row = await prisma.misaCredential.findUnique({ where: { id: CREDENTIAL_ID } });
  if (!row) return { ok: false, message: 'Chưa có cấu hình MISA nào.' };

  if (!row.refreshToken) return xinPhienDuPhong(row);

  const res = await fetch(urlAuthEshop(row.env, 'refresh-token'), {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
      Origin: 'https://amisapp.misa.vn',
      Referer: 'https://amisapp.misa.vn/eshop/management',
      // BẮT BUỘC: thiếu header này MISA trả 204 rỗng (không phải lỗi rõ ràng), gia hạn im lặng
      // không bao giờ chạy được. Đo bằng tài khoản thật ngày 16/08/2026.
      ...(row.bearerToken ? { Authorization: `Bearer ${chuanHoaBearer(row.bearerToken)}` } : {}),
      ...(row.cookie ? { Cookie: row.cookie } : {}),
    },
    body: JSON.stringify({ RefreshToken: row.refreshToken }),
  });

  // Refresh token hết hạn/bị thu hồi là chuyện thường sau vài ngày — thử các đường lùi trước khi bỏ
  // cuộc, để hệ thống tự khỏi mà không cần ai đăng nhập lại.
  if (!res.ok) {
    const duPhong = await xinPhienDuPhong(row);
    return duPhong.ok
      ? duPhong
      : { ok: false, message: `MISA từ chối gia hạn (HTTP ${res.status}). ${duPhong.message}` };
  }

  // MISA từ chối gia hạn bằng 204 rỗng chứ không bằng mã lỗi (VD refresh token đã bị dùng — nó đổi
  // mới sau mỗi lần gia hạn thành công). Thân rỗng/không phải JSON đều quy về một mối: coi như hỏng
  // rồi đi đường lùi. Bản cũ trả lỗi luôn tại đây nên hệ thống không bao giờ tự khỏi được.
  let phien: PhienEshop | null = null;
  try {
    const text = await res.text();
    phien = text.trim() ? (JSON.parse(text) as PhienEshop) : null;
  } catch {
    phien = null;
  }

  if (!phien?.token) {
    const duPhong = await xinPhienDuPhong(row);
    return duPhong.ok
      ? duPhong
      : { ok: false, message: `MISA không cấp token mới (HTTP ${res.status}). ${duPhong.message}` };
  }

  await luuPhienEshop(phien, row.cookie || '');
  return { ok: true, message: 'Đã gia hạn Bearer token, không cần đăng nhập lại.' };
}

/** Ghi phiên eShop (Bearer + refresh + chi nhánh) vào MisaCredential. */
async function luuPhienEshop(phien: PhienEshop, cookie: string) {
  const data: Record<string, string | Date | null> = {};

  if (cookie) data.cookie = cookie;
  if (phien._eshop_rf_token) data.refreshToken = phien._eshop_rf_token;
  // eShop cấp tokenMisaId mới mỗi lần đổi phiên — ghi đè cái cũ để đường lùi luôn dùng vé mới nhất.
  if (phien.tokenMisaId) data.tokenMisaId = phien.tokenMisaId;
  if (phien.currentBranch?.branch_id) {
    data.brid = phien.currentBranch.branch_id;
    data.msBid = phien.currentBranch.branch_id;
  }

  if (phien.token) {
    // MISA trả token kèm sẵn "Bearer " — cắt đi, không thì header gửi đi thành "Bearer Bearer eyJ..."
    // và mọi request đều 401 IsAuthExpired dù token còn hạn.
    data.bearerToken = chuanHoaBearer(phien.token);
    const tt = docThongTinToken(phien.token);
    data.tokenExpiresAt = tt.hetHanLuc;
    if (tt.env) data.env = tt.env;
    if (tt.dbid) data.dbid = tt.dbid;
    if (tt.tid) data.tid = tt.tid;
    if (tt.tco) data.tco = tt.tco;
  }

  await prisma.misaCredential.upsert({
    where: { id: CREDENTIAL_ID },
    create: { id: CREDENTIAL_ID, ...data },
    update: data,
  });
}

/**
 * Lưu phiên vừa đăng nhập rồi đi tiếp chuỗi SSO để có luôn Bearer token — người dùng chỉ phải nhập
 * tài khoản/mật khẩu/OTP, không phải chép tay gì từ trình duyệt.
 *
 * `tokenMisaId` (nếu bước đăng nhập tình cờ trả về) chỉ là đường lùi khi chuỗi SSO trục trặc.
 */
export async function luuPhienDangNhap(
  cookie: string,
  tokenMisaId?: string | null,
): Promise<{ coBearerToken: boolean; ghiChu: string }> {
  const data: Record<string, string | Date | null> = { cookie };

  // x-deviceid nằm trong cookie nhưng MISA cũng đòi nó ở header riêng — tách ra lưu luôn.
  const deviceId = cookie.match(/(?:^|;\s*)x-deviceid=([^;]+)/)?.[1];
  if (deviceId) data.deviceId = deviceId;
  if (tokenMisaId) data.tokenMisaId = tokenMisaId;

  await prisma.misaCredential.upsert({
    where: { id: CREDENTIAL_ID },
    create: { id: CREDENTIAL_ID, ...data },
    update: data,
  });

  const row = await prisma.misaCredential.findUnique({ where: { id: CREDENTIAL_ID } });
  const kq = await xinPhienDuPhong({
    cookie,
    tokenMisaId: tokenMisaId ?? row?.tokenMisaId ?? null,
    env: row?.env || 'g3',
    tid: row?.tid ?? null,
  });

  return kq.ok
    ? { coBearerToken: true, ghiChu: 'Đã lấy được Bearer token và refresh token.' }
    : { coBearerToken: false, ghiChu: `Đã lưu phiên nhưng chưa lấy được Bearer token. ${kq.message}` };
}
