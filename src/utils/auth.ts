/**
 * Xác thực cho **bản web**. App Flutter không dùng phần này: mọi route `/api/*`
 * vẫn mở như cũ (xem `src/middleware.ts`), nếu chặn API thì app trên máy thật
 * mất kết nối ngay.
 *
 * Không thêm thư viện ngoài (bcrypt/jose/next-auth) mà dùng thẳng Web Crypto:
 *   - Có sẵn cả trong Node runtime (route handler) lẫn Edge runtime (middleware),
 *     nên cùng một file dùng được ở cả hai nơi.
 *   - bcrypt là gói native, build trong Docker phải kéo thêm toolchain.
 *
 * Mật khẩu băm bằng PBKDF2-SHA256, phiên đăng nhập là cookie tự ký HMAC-SHA256
 * (không tra DB mỗi request — middleware chạy trước mọi trang, tra DB ở đó sẽ
 * cộng thêm một lượt truy vấn vào từng lần tải trang).
 */

export type VaiTro = 'admin' | 'nhanVien';

/** Dữ liệu đọc được từ cookie phiên. */
export interface PhienDangNhap {
  id: string;
  tenDangNhap: string;
  hoTen: string;
  vaiTro: VaiTro;
  /** Thời điểm hết hạn, tính bằng giây (Unix epoch). */
  exp: number;
}

export const TEN_COOKIE_PHIEN = 'phien_3d';

/** Phiên sống 30 ngày — máy trong xưởng dùng suốt ngày, bắt đăng nhập lại liên tục rất phiền. */
const SO_GIAY_SONG = 30 * 24 * 60 * 60;

const PBKDF2_VONG_LAP = 120_000;

const boMaHoa = new TextEncoder();

function b64urlTuBytes(bytes: Uint8Array): string {
  let chuoi = '';
  for (const byte of bytes) chuoi += String.fromCharCode(byte);
  return btoa(chuoi).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function bytesTuB64url(chuoi: string): Uint8Array {
  const base64 = chuoi.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (chuoi.length % 4)) % 4);
  const thoChuoi = atob(base64);
  const bytes = new Uint8Array(thoChuoi.length);
  for (let i = 0; i < thoChuoi.length; i += 1) bytes[i] = thoChuoi.charCodeAt(i);
  return bytes;
}

/** So sánh không phụ thuộc thời gian — tránh lộ dần chữ ký qua việc đo thời gian phản hồi. */
function bangNhauAnToan(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let khac = 0;
  for (let i = 0; i < a.length; i += 1) khac |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return khac === 0;
}

async function danXuatPbkdf2(matKhau: string, muoi: Uint8Array, soVongLap: number): Promise<Uint8Array> {
  const khoaGoc = await crypto.subtle.importKey('raw', boMaHoa.encode(matKhau), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: muoi as BufferSource, iterations: soVongLap, hash: 'SHA-256' },
    khoaGoc,
    256,
  );
  return new Uint8Array(bits);
}

/**
 * Băm mật khẩu ra chuỗi tự mô tả `pbkdf2$<vòng lặp>$<muối>$<băm>` — số vòng lặp
 * nằm trong chuỗi nên sau này tăng lên vẫn xác thực được mật khẩu băm từ trước.
 */
export async function bamMatKhau(matKhau: string): Promise<string> {
  const muoi = crypto.getRandomValues(new Uint8Array(16));
  const bam = await danXuatPbkdf2(matKhau, muoi, PBKDF2_VONG_LAP);
  return `pbkdf2$${PBKDF2_VONG_LAP}$${b64urlTuBytes(muoi)}$${b64urlTuBytes(bam)}`;
}

export async function kiemTraMatKhau(matKhau: string, chuoiBam: string): Promise<boolean> {
  const phan = chuoiBam.split('$');
  if (phan.length !== 4 || phan[0] !== 'pbkdf2') return false;
  const soVongLap = Number(phan[1]);
  if (!Number.isInteger(soVongLap) || soVongLap <= 0) return false;

  const bam = await danXuatPbkdf2(matKhau, bytesTuB64url(phan[2]), soVongLap);
  return bangNhauAnToan(b64urlTuBytes(bam), phan[3]);
}

function layKhoaBiMat(): string {
  const khoa = process.env.AUTH_SECRET;
  if (!khoa || khoa.length < 16) {
    throw new Error('Thiếu biến môi trường AUTH_SECRET (chuỗi ngẫu nhiên >= 16 ký tự) để ký cookie đăng nhập.');
  }
  return khoa;
}

async function khoaHmac(): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', boMaHoa.encode(layKhoaBiMat()), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
}

async function ky(duLieu: string): Promise<string> {
  const chuKy = await crypto.subtle.sign('HMAC', await khoaHmac(), boMaHoa.encode(duLieu));
  return b64urlTuBytes(new Uint8Array(chuKy));
}

/** Tạo token phiên dạng `<payload>.<chữ ký>`. */
export async function taoToken(nguoiDung: Omit<PhienDangNhap, 'exp'>): Promise<string> {
  const phien: PhienDangNhap = { ...nguoiDung, exp: Math.floor(Date.now() / 1000) + SO_GIAY_SONG };
  const payload = b64urlTuBytes(boMaHoa.encode(JSON.stringify(phien)));
  return `${payload}.${await ky(payload)}`;
}

/** Đọc token; trả `null` nếu sai chữ ký, sai định dạng hoặc đã hết hạn. */
export async function docToken(token: string | undefined | null): Promise<PhienDangNhap | null> {
  if (!token) return null;
  const [payload, chuKy] = token.split('.');
  if (!payload || !chuKy) return null;

  let chuKyDung: string;
  try {
    chuKyDung = await ky(payload);
  } catch {
    // Thiếu AUTH_SECRET: coi như chưa đăng nhập thay vì đổ lỗi 500 ra toàn bộ trang.
    return null;
  }
  if (!bangNhauAnToan(chuKy, chuKyDung)) return null;

  try {
    const phien = JSON.parse(new TextDecoder().decode(bytesTuB64url(payload))) as PhienDangNhap;
    if (!phien?.id || !phien.exp || phien.exp < Math.floor(Date.now() / 1000)) return null;
    if (phien.vaiTro !== 'admin' && phien.vaiTro !== 'nhanVien') return null;
    return phien;
  } catch {
    return null;
  }
}

/** Tùy chọn cookie dùng chung cho lúc đặt và lúc xóa, tránh đặt một kiểu xóa một kiểu. */
export function tuyChonCookie(songGiay: number = SO_GIAY_SONG) {
  return {
    name: TEN_COOKIE_PHIEN,
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: songGiay,
    // Xưởng chạy HTTP trong LAN, bật `secure` là trình duyệt bỏ luôn cookie.
    // Khi ra domain https thì đặt AUTH_COOKIE_SECURE=true.
    secure: process.env.AUTH_COOKIE_SECURE === 'true',
  };
}

/**
 * Trang mà nhân viên được vào. Mọi đường dẫn khác bị đẩy về `TRANG_NHAN_VIEN`.
 */
export const TRANG_NHAN_VIEN = '/hang-hoa-cua-hang';

export function nhanVienDuocVao(pathname: string): boolean {
  return pathname === TRANG_NHAN_VIEN || pathname.startsWith(`${TRANG_NHAN_VIEN}/`);
}
