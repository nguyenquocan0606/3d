'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Braces, CheckCircle2, KeyRound, Loader2, LogIn, RefreshCw, Save, ShieldCheck, XCircle } from 'lucide-react';

type MisaCredentialPublic = {
  hasToken: boolean;
  tokenPreview: string | null;
  hasCookie: boolean;
  deviceId: string | null;
  msBid: string | null;
  dbid: string | null;
  tid: string | null;
  tco: string | null;
  brid: string | null;
  /** Môi trường MISA của tenant ("g2"/"g3") — quyết định đường dẫn API. */
  env: string;
  tokenExpiresAt: string | null;
  updatedAt: string | null;
  lastCheckedAt: string | null;
  lastCheckOk: boolean | null;
  lastCheckMessage: string | null;
};

/** Trạng thái phiên MISA — xem `kiemTraTrangThaiMisa` phía server. */
type TrangThaiDangNhap = {
  dangNhap: {
    trangThai: 'song' | 'het-han' | 'chua-co' | 'loi';
    message: string;
    tenantId: string | null;
    env: string | null;
  };
  bearer: { co: boolean; hetHanLuc: string | null; conLaiPhut: number | null };
  coRefreshToken: boolean;
  coTokenMisaId: boolean;
  tuLoDuoc: boolean;
  tomTat: string;
};

type ApiResponse<T> = { status?: string; data?: T; message?: string };

/** Màu + chữ cho ô trạng thái đăng nhập. */
const KIEU_DANG_NHAP: Record<TrangThaiDangNhap['dangNhap']['trangThai'], { chu: string; lop: string }> = {
  song: {
    chu: 'Đang đăng nhập',
    lop: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-900',
  },
  'het-han': {
    chu: 'Hết phiên',
    lop: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-900',
  },
  'chua-co': {
    chu: 'Chưa đăng nhập',
    lop: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  },
  loi: {
    chu: 'Không kiểm tra được',
    lop: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-900',
  },
};

const LOP_THE = 'rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#111827]';
const LOP_NHAP =
  'h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900';
const LOP_TEXTAREA =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900';
const LOP_NHAN = 'mb-1.5 block text-xs font-semibold text-slate-500 dark:text-slate-400';

function dinhDangThoiGian(iso: string | null) {
  if (!iso) return 'Chưa kiểm tra lần nào';
  return new Date(iso).toLocaleString('vi-VN');
}

/**
 * Mô tả hạn token đọc từ chính JWT (claim `exp`) — token MISA sống khoảng 20,5 tiếng nên gần như
 * ngày nào cũng phải cấp lại.
 */
function moTaHanToken(iso: string | null): { chu: string; mau: string } {
  if (!iso) return { chu: 'Không đọc được hạn từ token', mau: 'text-slate-500' };

  const conLaiMs = new Date(iso).getTime() - Date.now();
  const thoiDiem = new Date(iso).toLocaleString('vi-VN');

  if (conLaiMs <= 0) return { chu: `ĐÃ HẾT HẠN lúc ${thoiDiem}`, mau: 'text-red-600 dark:text-red-400 font-semibold' };

  const gio = Math.floor(conLaiMs / 3600000);
  const phut = Math.floor((conLaiMs % 3600000) / 60000);
  const conLai = gio > 0 ? `${gio} giờ ${phut} phút` : `${phut} phút`;

  return {
    chu: `Còn ${conLai} (hết hạn ${thoiDiem})`,
    mau: conLaiMs < 2 * 3600000 ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-emerald-600 dark:text-emerald-400',
  };
}

/**
 * Chuyển JSON cookie xuất từ DevTools (Application → Cookies → export, dạng mảng
 * [{name, value, ...}]) thành chuỗi "name=value; name2=value2" dùng cho header Cookie.
 * Bỏ qua các phần tử thiếu name/value thay vì làm hỏng cả chuỗi.
 */
function chuyenJsonCookieThanhChuoi(jsonText: string): { chuoi: string; loi: string | null } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { chuoi: '', loi: 'JSON không hợp lệ — kiểm tra lại định dạng đã dán.' };
  }

  if (!Array.isArray(parsed)) {
    return { chuoi: '', loi: 'JSON phải là một mảng cookie (dạng [{"name":...,"value":...}, ...]).' };
  }

  const cap = parsed
    .filter((item): item is { name: string; value: string } => {
      const o = item as Record<string, unknown>;
      return o && typeof o.name === 'string' && typeof o.value === 'string';
    })
    .map((item) => `${item.name}=${item.value}`);

  if (cap.length === 0) {
    return { chuoi: '', loi: 'Không tìm thấy cookie hợp lệ nào (cần field "name" và "value") trong JSON.' };
  }

  return { chuoi: cap.join('; '), loi: null };
}

export default function MisaSettingsTab() {
  const [credential, setCredential] = useState<MisaCredentialPublic | null>(null);
  const [dangTai, setDangTai] = useState(true);
  const [dangLuu, setDangLuu] = useState(false);
  const [dangKiemTra, setDangKiemTra] = useState(false);

  const [bearerToken, setBearerToken] = useState('');
  const [tokenMisaId, setTokenMisaId] = useState('');
  const [cookie, setCookie] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [msBid, setMsBid] = useState('');
  const [dbid, setDbid] = useState('');
  const [tid, setTid] = useState('');
  const [tco, setTco] = useState('');
  const [brid, setBrid] = useState('');
  const [env, setEnv] = useState('g3');

  const [ketQuaKiemTra, setKetQuaKiemTra] = useState<{ ok: boolean; message: string } | null>(null);

  const [trangThai, setTrangThai] = useState<TrangThaiDangNhap | null>(null);
  const [dangSoiTrangThai, setDangSoiTrangThai] = useState(false);

  // Form đăng nhập MISA 2 bước: nhập tài khoản/mật khẩu → MISA bắn OTP → nhập OTP.
  const [taiKhoan, setTaiKhoan] = useState('');
  const [matKhau, setMatKhau] = useState('');
  const [otp, setOtp] = useState('');
  const [tokenTam, setTokenTam] = useState('');
  const [cookieTam, setCookieTam] = useState('');
  const [dangDangNhap, setDangDangNhap] = useState(false);
  const [thongDiepOtp, setThongDiepOtp] = useState('');

  const [hienNhapCookieJson, setHienNhapCookieJson] = useState(false);
  const [cookieJsonInput, setCookieJsonInput] = useState('');
  const [loiCookieJson, setLoiCookieJson] = useState<string | null>(null);

  const taiCredential = useCallback(async () => {
    setDangTai(true);
    try {
      const res = await fetch('/api/misa/credential');
      const data = (await res.json()) as ApiResponse<MisaCredentialPublic>;
      if (data.status === 'success' && data.data) {
        setCredential(data.data);
        setDeviceId(data.data.deviceId || '');
        setMsBid(data.data.msBid || '');
        setDbid(data.data.dbid || '');
        setTid(data.data.tid || '');
        setTco(data.data.tco || '');
        setBrid(data.data.brid || '');
        setEnv(data.data.env || 'g3');
      }
    } finally {
      setDangTai(false);
    }
  }, []);

  /**
   * Hỏi server xem phiên MISA còn sống không. Chỉ đọc — không đổi phiên, nên gọi thoải mái mà không
   * sợ đá phiên eShop đang mở trên máy chính.
   */
  const soiTrangThai = useCallback(async () => {
    setDangSoiTrangThai(true);
    try {
      const res = await fetch('/api/misa/trang-thai');
      const data = (await res.json()) as ApiResponse<TrangThaiDangNhap>;
      setTrangThai(data.status === 'success' && data.data ? data.data : null);
    } catch {
      setTrangThai(null);
    } finally {
      setDangSoiTrangThai(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      taiCredential();
      soiTrangThai();
    });
  }, [taiCredential, soiTrangThai]);

  const bao = (message: string, type: 'success' | 'error' | 'info') =>
    window.dispatchEvent(new CustomEvent('appToast', { detail: { message, type } }));

  /** Bước 1: gửi tài khoản/mật khẩu. Mật khẩu chỉ đi thẳng sang MISA, không được lưu lại. */
  const dangNhapMisa = async () => {
    setDangDangNhap(true);
    setThongDiepOtp('');
    try {
      const res = await fetch('/api/misa/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userName: taiKhoan.trim(), password: matKhau }),
      });
      const data = (await res.json()) as ApiResponse<{ canOtp: boolean; token?: string; cookie?: string }>;

      if (data.status !== 'success' || !data.data) {
        bao(data.message || 'Đăng nhập thất bại.', 'error');
        return;
      }

      setMatKhau(''); // không giữ mật khẩu trong bộ nhớ trình duyệt lâu hơn mức cần thiết

      if (data.data.canOtp) {
        setTokenTam(data.data.token || '');
        setCookieTam(data.data.cookie || '');
        setThongDiepOtp(data.message || 'Đã gửi mã OTP.');
      } else {
        bao(data.message || 'Đăng nhập thành công.', 'success');
        await taiCredential();
        await soiTrangThai();
      }
    } catch {
      bao('Lỗi kết nối máy chủ.', 'error');
    } finally {
      setDangDangNhap(false);
    }
  };

  /** Bước 2: gửi OTP. Xong là cookie phiên được ghi thẳng vào cấu hình MISA. */
  const xacThucOtp = async () => {
    setDangDangNhap(true);
    try {
      const res = await fetch('/api/misa/login/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenTam, otp: otp.trim(), cookie: cookieTam }),
      });
      const data = (await res.json()) as ApiResponse<unknown>;

      if (data.status === 'success') {
        bao(data.message || 'Đăng nhập thành công.', 'success');
        setTokenTam('');
        setCookieTam('');
        setOtp('');
        setThongDiepOtp('');
        await taiCredential();
        await soiTrangThai();
      } else {
        bao(data.message || 'Mã OTP không đúng.', 'error');
      }
    } catch {
      bao('Lỗi kết nối máy chủ.', 'error');
    } finally {
      setDangDangNhap(false);
    }
  };

  const luuCredential = async () => {
    setDangLuu(true);
    setKetQuaKiemTra(null);
    try {
      const res = await fetch('/api/misa/credential', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(bearerToken.trim() ? { bearerToken: bearerToken.trim() } : {}),
          ...(tokenMisaId.trim() ? { tokenMisaId: tokenMisaId.trim() } : {}),
          ...(cookie.trim() ? { cookie: cookie.trim() } : {}),
          deviceId,
          msBid,
          dbid,
          tid,
          tco,
          brid,
          env,
        }),
      });
      const data = (await res.json()) as ApiResponse<MisaCredentialPublic>;
      if (data.status === 'success' && data.data) {
        setCredential(data.data);
        setBearerToken('');
        setCookie('');
        window.dispatchEvent(new CustomEvent('appToast', { detail: { message: 'Đã lưu cấu hình MISA.', type: 'success' } }));
      } else {
        window.dispatchEvent(new CustomEvent('appToast', { detail: { message: data.message || 'Lưu thất bại.', type: 'error' } }));
      }
    } catch {
      window.dispatchEvent(new CustomEvent('appToast', { detail: { message: 'Lỗi kết nối máy chủ.', type: 'error' } }));
    } finally {
      setDangLuu(false);
    }
  };

  const apDungCookieJson = () => {
    const { chuoi, loi } = chuyenJsonCookieThanhChuoi(cookieJsonInput);
    if (loi) {
      setLoiCookieJson(loi);
      return;
    }
    setCookie(chuoi);
    setLoiCookieJson(null);
    setCookieJsonInput('');
    setHienNhapCookieJson(false);
    window.dispatchEvent(new CustomEvent('appToast', { detail: { message: 'Đã tách cookie từ JSON — nhớ bấm "Lưu cấu hình" để ghi lại.', type: 'success' } }));
  };

  const kiemTraToken = async () => {
    setDangKiemTra(true);
    setKetQuaKiemTra(null);
    try {
      const res = await fetch('/api/misa/check-token', { method: 'POST' });
      const data = (await res.json()) as ApiResponse<{ ok: boolean; status: number; message: string }>;
      if (data.status === 'success' && data.data) {
        setKetQuaKiemTra({ ok: data.data.ok, message: data.data.message });
      } else {
        setKetQuaKiemTra({ ok: false, message: data.message || 'Không kiểm tra được token.' });
      }
    } catch {
      setKetQuaKiemTra({ ok: false, message: 'Lỗi kết nối máy chủ.' });
    } finally {
      setDangKiemTra(false);
      taiCredential();
    }
  };

  if (dangTai) {
    return <div className="flex min-h-64 items-center justify-center text-slate-500">Đang tải cấu hình...</div>;
  }

  return (
    <div className="max-w-3xl space-y-5">
      <section className={`${LOP_THE} p-5`}>
        <div className="mb-4 flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600/10 text-indigo-500 dark:bg-indigo-500/15 dark:text-indigo-300">
            <KeyRound className="size-5" />
          </span>
          <div>
            <h2 className="text-base font-bold">Tích hợp MISA eShop</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Đăng nhập bằng tài khoản MISA ở dưới là xong — hệ thống tự lấy Bearer token và tự gia hạn về sau.
              Các ô dán token bên dưới chỉ dùng khi cần chữa cháy.
            </p>
          </div>
        </div>

        {/* Bảng trạng thái: trả lời đúng 2 câu — "còn đăng nhập không?" và "có phải làm gì không?" */}
        <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${
                trangThai ? KIEU_DANG_NHAP[trangThai.dangNhap.trangThai].lop : KIEU_DANG_NHAP['chua-co'].lop
              }`}
            >
              {dangSoiTrangThai ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : trangThai?.dangNhap.trangThai === 'song' ? (
                <CheckCircle2 className="size-3.5" />
              ) : trangThai?.dangNhap.trangThai === 'het-han' ? (
                <XCircle className="size-3.5" />
              ) : (
                <AlertCircle className="size-3.5" />
              )}
              {dangSoiTrangThai ? 'Đang kiểm tra...' : trangThai ? KIEU_DANG_NHAP[trangThai.dangNhap.trangThai].chu : 'Chưa rõ'}
            </span>

            {trangThai?.tuLoDuoc && trangThai.dangNhap.trangThai !== 'song' && (
              <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-300">
                Vẫn tự gia hạn được
              </span>
            )}

            <button
              type="button"
              onClick={soiTrangThai}
              disabled={dangSoiTrangThai}
              title="Chỉ xem — không đổi phiên, không đá phiên eShop trên máy chính"
              className="ml-auto inline-flex h-7 items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 text-xs font-semibold hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              <RefreshCw className={`size-3 ${dangSoiTrangThai ? 'animate-spin' : ''}`} />
              Kiểm tra lại
            </button>
          </div>

          {trangThai && (
            <p className="mb-2.5 text-xs text-slate-600 dark:text-slate-300">{trangThai.tomTat}</p>
          )}

          <div className="grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
            <div className="flex gap-2">
              <span className="font-semibold text-slate-500 dark:text-slate-400">Bearer token:</span>
              {/* Ưu tiên số liệu vừa soi được; chưa soi xong thì tạm dùng cấu hình đã tải. */}
              {(trangThai ? trangThai.bearer.co : credential?.hasToken) ? (
                <span className={moTaHanToken(trangThai?.bearer.hetHanLuc ?? credential?.tokenExpiresAt ?? null).mau}>
                  {moTaHanToken(trangThai?.bearer.hetHanLuc ?? credential?.tokenExpiresAt ?? null).chu}
                </span>
              ) : (
                <span className="text-slate-500">Chưa có</span>
              )}
            </div>
            <div className="flex gap-2">
              <span className="font-semibold text-slate-500 dark:text-slate-400">Tự gia hạn:</span>
              <span className={trangThai?.coRefreshToken ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}>
                {trangThai?.coRefreshToken ? 'Có refresh token' : 'Chưa có refresh token'}
              </span>
            </div>
            <div className="flex gap-2">
              <span className="font-semibold text-slate-500 dark:text-slate-400">Cửa hàng:</span>
              <span className="text-slate-500">
                {trangThai?.dangNhap.tenantId
                  ? `${trangThai.dangNhap.tenantId.slice(0, 8)}… (${trangThai.dangNhap.env ?? credential?.env})`
                  : credential?.tid
                    ? `${credential.tid.slice(0, 8)}… (${credential.env})`
                    : 'Chưa xác định'}
              </span>
            </div>
            <div className="flex gap-2">
              <span className="font-semibold text-slate-500 dark:text-slate-400">Mã token:</span>
              <span className="font-mono text-slate-500">{credential?.tokenPreview ?? '—'}</span>
            </div>
          </div>

          {trangThai && trangThai.dangNhap.trangThai !== 'song' && (
            <p className="mt-2.5 border-t border-slate-200 pt-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
              {trangThai.dangNhap.message}
            </p>
          )}
        </div>

        {/* Đăng nhập trực tiếp — thay cho việc mở DevTools chép token bằng tay */}
        <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-900 dark:bg-indigo-500/5">
          <div className="mb-1 flex items-center gap-2">
            <LogIn className="size-4 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-sm font-bold">Đăng nhập MISA</h3>
          </div>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
            Nên dùng <strong>tài khoản phụ</strong> để không tranh phiên với máy chính. Mật khẩu chỉ được gửi thẳng sang
            MISA, không lưu lại ở đây.
          </p>

          {!tokenTam ? (
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <div>
                <label className={LOP_NHAN}>Tài khoản (SĐT hoặc email)</label>
                <input
                  value={taiKhoan}
                  onChange={(event) => setTaiKhoan(event.target.value)}
                  autoComplete="username"
                  className={LOP_NHAP}
                />
              </div>
              <div>
                <label className={LOP_NHAN}>Mật khẩu</label>
                <input
                  type="password"
                  value={matKhau}
                  onChange={(event) => setMatKhau(event.target.value)}
                  autoComplete="current-password"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && taiKhoan.trim() && matKhau) dangNhapMisa();
                  }}
                  className={LOP_NHAP}
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={dangNhapMisa}
                  disabled={dangDangNhap || !taiKhoan.trim() || !matKhau}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {dangDangNhap ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
                  Đăng nhập
                </button>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
              <div>
                <label className={LOP_NHAN}>Mã OTP</label>
                <input
                  value={otp}
                  onChange={(event) => setOtp(event.target.value)}
                  inputMode="numeric"
                  placeholder="6 chữ số"
                  autoFocus
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && otp.trim()) xacThucOtp();
                  }}
                  className={LOP_NHAP}
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={xacThucOtp}
                  disabled={dangDangNhap || !otp.trim()}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {dangDangNhap ? <Loader2 className="size-4 animate-spin" /> : null}
                  Xác nhận
                </button>
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => {
                    setTokenTam('');
                    setCookieTam('');
                    setOtp('');
                    setThongDiepOtp('');
                  }}
                  className="inline-flex h-10 items-center rounded-lg border border-slate-300 px-3 text-sm dark:border-slate-700"
                >
                  Hủy
                </button>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={async () => {
              setDangDangNhap(true);
              try {
                const res = await fetch('/api/misa/refresh', { method: 'POST' });
                const data = (await res.json()) as ApiResponse<{ ok: boolean }>;
                bao(data.message || 'Đã gia hạn.', data.data?.ok ? 'success' : 'error');
                await taiCredential();
                await soiTrangThai();
              } catch {
                bao('Lỗi kết nối máy chủ.', 'error');
              } finally {
                setDangDangNhap(false);
              }
            }}
            disabled={dangDangNhap}
            title="Xin Bearer token mới bằng refresh token, hoặc đi lại chuỗi SSO bằng cookie đã lưu — không cần mật khẩu hay OTP"
            className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 px-3 text-xs font-semibold hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <RefreshCw className="size-3.5" />
            Gia hạn token ngay
          </button>

          {thongDiepOtp && (
            <p className="mt-2 text-xs font-semibold text-indigo-700 dark:text-indigo-400">
              {thongDiepOtp} Mã có hạn khoảng 10 phút.
            </p>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <label className={LOP_NHAN}>Authorization Bearer Token (bỏ trống nếu không đổi)</label>
            <textarea
              value={bearerToken}
              onChange={(event) => setBearerToken(event.target.value)}
              rows={3}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              className={LOP_TEXTAREA}
            />
          </div>

          <div>
            <label className={LOP_NHAN}>tokenMisaId (bỏ trống nếu không đổi)</label>
            <textarea
              value={tokenMisaId}
              onChange={(event) => setTokenMisaId(event.target.value)}
              rows={3}
              placeholder="eyJhbGciOi..."
              className={LOP_TEXTAREA}
            />
            {/* Ô này giờ chỉ là phao cứu sinh. Đăng nhập ở trên đã tự đi hết chuỗi SSO của MISA để
                lấy tokenMisaId lẫn Bearer token, nên bình thường không ai phải đụng vào đây. */}
            <p className="mt-1.5 text-xs text-slate-500">
              Không cần điền — đăng nhập ở trên là hệ thống tự lấy. Chỉ dùng khi MISA đổi luồng đăng nhập:
              mở eShop trên trình duyệt → F12 → tab <b>Application</b> → <b>Local Storage</b> → chép giá trị
              khoá <b>KeyCacheMID</b>.
            </p>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className={LOP_NHAN + ' mb-0'}>Cookie đầy đủ (bỏ trống nếu không đổi)</label>
              <button
                type="button"
                onClick={() => setHienNhapCookieJson((value) => !value)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
              >
                <Braces className="size-3.5" />
                {hienNhapCookieJson ? 'Đóng nhập JSON' : 'Nhập bằng JSON'}
              </button>
            </div>

            {hienNhapCookieJson && (
              <div className="mb-3 rounded-lg border border-indigo-200 bg-indigo-50/60 p-3 dark:border-indigo-900 dark:bg-indigo-500/5">
                <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                  Dán JSON cookie xuất từ DevTools (mảng <code>[{'{'}&quot;name&quot;,&quot;value&quot;,...{'}'}]</code>) — hệ thống tự tách thành chuỗi Cookie bên dưới.
                </p>
                <textarea
                  value={cookieJsonInput}
                  onChange={(event) => {
                    setCookieJsonInput(event.target.value);
                    setLoiCookieJson(null);
                  }}
                  rows={5}
                  placeholder='[{"name":"x-sessionid","value":"..."}, {"name":"cf_clearance","value":"..."}]'
                  className={LOP_TEXTAREA}
                />
                {loiCookieJson && <p className="mt-1.5 text-xs font-semibold text-red-600 dark:text-red-400">{loiCookieJson}</p>}
                <button
                  type="button"
                  onClick={apDungCookieJson}
                  disabled={!cookieJsonInput.trim()}
                  className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  Tách cookie từ JSON
                </button>
              </div>
            )}

            <textarea
              value={cookie}
              onChange={(event) => setCookie(event.target.value)}
              rows={3}
              placeholder="x-sessionid=...; cf_clearance=...; x-tenantid=..."
              className={LOP_TEXTAREA}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={LOP_NHAN}>x-deviceid</label>
              <input value={deviceId} onChange={(event) => setDeviceId(event.target.value)} className={LOP_NHAP} />
            </div>
            <div>
              <label className={LOP_NHAN}>x-ms-bid (branch id)</label>
              <input value={msBid} onChange={(event) => setMsBid(event.target.value)} className={LOP_NHAP} />
            </div>
            <div>
              <label className={LOP_NHAN}>x-ems-context.dbid</label>
              <input value={dbid} onChange={(event) => setDbid(event.target.value)} className={LOP_NHAP} />
            </div>
            <div>
              <label className={LOP_NHAN}>x-ems-context.tid</label>
              <input value={tid} onChange={(event) => setTid(event.target.value)} className={LOP_NHAP} />
            </div>
            <div>
              <label className={LOP_NHAN}>x-ems-context.tco</label>
              <input value={tco} onChange={(event) => setTco(event.target.value)} className={LOP_NHAP} />
            </div>
            <div>
              <label className={LOP_NHAN}>x-ems-context.brid</label>
              <input value={brid} onChange={(event) => setBrid(event.target.value)} className={LOP_NHAP} />
            </div>
            <div>
              <label className={LOP_NHAN}>Môi trường (claim &quot;env&quot; trong token)</label>
              <select value={env} onChange={(event) => setEnv(event.target.value)} className={LOP_NHAP}>
                <option value="g3">g3</option>
                <option value="g2">g2</option>
              </select>
              <p className="mt-1 text-[11px] text-slate-500">
                Sai môi trường thì MISA trả 401/404 dù token còn hạn. Xem trong URL request:
                <code> /eshop/g3/api/...</code>
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={luuCredential}
            disabled={dangLuu}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {dangLuu ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Lưu cấu hình
          </button>
          <button
            type="button"
            onClick={kiemTraToken}
            disabled={dangKiemTra || !credential?.hasToken}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
            title={!credential?.hasToken ? 'Cần lưu Bearer token trước' : 'Ping thử API MISA (chỉ đọc, không tạo dữ liệu)'}
          >
            {dangKiemTra ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
            Kiểm tra token
          </button>
          <button
            type="button"
            onClick={taiCredential}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
          >
            <RefreshCw className="size-4" />
          </button>
        </div>

        {ketQuaKiemTra && (
          <div
            className={`mt-4 flex items-start gap-2 rounded-xl border p-3 text-sm ${
              ketQuaKiemTra.ok
                ? 'border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                : 'border-red-500/30 bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300'
            }`}
          >
            {ketQuaKiemTra.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <XCircle className="mt-0.5 size-4 shrink-0" />}
            <span>{ketQuaKiemTra.message}</span>
          </div>
        )}

        <div className="mt-4 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <AlertCircle className="size-3.5 shrink-0" />
          Lần kiểm tra gần nhất: {dinhDangThoiGian(credential?.lastCheckedAt || null)}
          {credential?.lastCheckOk !== null && credential?.lastCheckOk !== undefined && (
            <span className={credential.lastCheckOk ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
              ({credential.lastCheckOk ? 'hoạt động' : 'lỗi'})
            </span>
          )}
        </div>
      </section>
    </div>
  );
}
