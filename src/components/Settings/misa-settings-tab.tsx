'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Braces, CheckCircle2, KeyRound, Loader2, RefreshCw, Save, ShieldCheck, XCircle } from 'lucide-react';

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
  updatedAt: string | null;
  lastCheckedAt: string | null;
  lastCheckOk: boolean | null;
  lastCheckMessage: string | null;
};

type ApiResponse<T> = { status?: string; data?: T; message?: string };

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
  const [cookie, setCookie] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [msBid, setMsBid] = useState('');
  const [dbid, setDbid] = useState('');
  const [tid, setTid] = useState('');
  const [tco, setTco] = useState('');
  const [brid, setBrid] = useState('');

  const [ketQuaKiemTra, setKetQuaKiemTra] = useState<{ ok: boolean; message: string } | null>(null);

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
      }
    } finally {
      setDangTai(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      taiCredential();
    });
  }, [taiCredential]);

  const luuCredential = async () => {
    setDangLuu(true);
    setKetQuaKiemTra(null);
    try {
      const res = await fetch('/api/misa/credential', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(bearerToken.trim() ? { bearerToken: bearerToken.trim() } : {}),
          ...(cookie.trim() ? { cookie: cookie.trim() } : {}),
          deviceId,
          msBid,
          dbid,
          tid,
          tco,
          brid,
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
              Bearer token hết hạn theo phiên đăng nhập MISA — khi báo hết hạn, đăng nhập lại trên trình duyệt, lấy token mới (DevTools → Network → request bất kỳ → header <code>authorization</code>) rồi dán lại đây.
            </p>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-900/60">
          <span className="font-semibold">Token hiện tại:</span>
          <span className="font-mono text-xs text-slate-500">{credential?.hasToken ? credential.tokenPreview : 'Chưa cấu hình'}</span>
          <span className="text-slate-300 dark:text-slate-700">|</span>
          <span className="font-semibold">Cookie:</span>
          <span className="text-xs text-slate-500">{credential?.hasCookie ? 'Đã lưu' : 'Chưa lưu'}</span>
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
