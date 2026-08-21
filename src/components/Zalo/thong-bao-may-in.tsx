'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Bell, BellOff, Loader2, RefreshCw, Send, Smartphone, Trash2 } from 'lucide-react';

/**
 * Bảng cấu hình thông báo hoạt động máy in.
 *
 * Đặt trong tab Zalo vì phần cần chọn tay nhiều nhất là "gửi vào hội thoại/nhóm Zalo nào" — danh
 * sách hội thoại đã có sẵn ngay đây, khỏi phải dựng thêm bộ chọn ở tab khác.
 */

type CaiDat = {
  bat: boolean;
  guiApp: boolean;
  guiZalo: boolean;
  zaloThreadId: string | null;
  zaloTenHoiThoai: string | null;
  loaiTat: string[];
  nguongZalo: string;
};

type MucLoai = { loai: string; nhan: string; mucDo: string; icon: string };

type ThietBi = {
  id: string;
  nenTang: string;
  tenMay: string | null;
  hoatDong: boolean;
  lanCuoi: string;
  duoiToken: string;
};

type SuKien = {
  id: string;
  tenMay: string;
  loai: string;
  mucDo: string;
  tieuDe: string;
  noiDung: string;
  daGui: boolean;
  loiGui: string | null;
  createdAt: string;
};

type ThreadGon = {
  id: string;
  type: number;
  name: string | null;
  account: { nhan: string | null; displayName: string | null };
};

type ApiResponse<T> = { status?: string; data?: T; message?: string };

const LOP_THE = 'rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#111827]';
const LOP_NHAP =
  'h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900';
const LOP_NUT =
  'inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50';

const MAU_MUC_DO: Record<string, string> = {
  loi: 'text-rose-500',
  canhBao: 'text-amber-500',
  tin: 'text-slate-500',
};

function thongBao(message: string, type: 'success' | 'error' | 'info') {
  window.dispatchEvent(new CustomEvent('appToast', { detail: { message, type } }));
}

function gio(iso: string) {
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ThongBaoMayIn({ threads }: { threads: ThreadGon[] }) {
  const [caiDat, setCaiDat] = useState<CaiDat | null>(null);
  const [danhMuc, setDanhMuc] = useState<MucLoai[]>([]);
  const [firebaseSanSang, setFirebaseSanSang] = useState(true);
  const [thietBi, setThietBi] = useState<ThietBi[]>([]);
  const [suKien, setSuKien] = useState<SuKien[]>([]);
  const [dangLuu, setDangLuu] = useState(false);
  const [moRong, setMoRong] = useState(false);

  const tai = useCallback(async () => {
    try {
      const [resCaiDat, resThietBi, resSuKien] = await Promise.all([
        fetch('/api/thong-bao/cai-dat', { cache: 'no-store' }),
        fetch('/api/thong-bao/thiet-bi', { cache: 'no-store' }),
        fetch('/api/thong-bao/su-kien?limit=20', { cache: 'no-store' }),
      ]);

      const dCaiDat = (await resCaiDat.json()) as ApiResponse<{
        caiDat: CaiDat;
        firebaseSanSang: boolean;
        danhMucLoai: MucLoai[];
      }>;
      if (dCaiDat.status === 'success' && dCaiDat.data) {
        setCaiDat(dCaiDat.data.caiDat);
        setDanhMuc(dCaiDat.data.danhMucLoai);
        setFirebaseSanSang(dCaiDat.data.firebaseSanSang);
      }

      const dThietBi = (await resThietBi.json()) as ApiResponse<ThietBi[]>;
      if (dThietBi.status === 'success' && dThietBi.data) setThietBi(dThietBi.data);

      const dSuKien = (await resSuKien.json()) as ApiResponse<SuKien[]>;
      if (dSuKien.status === 'success' && dSuKien.data) setSuKien(dSuKien.data);
    } catch {
      // Lỗi mạng vặt — bấm "Làm mới" là xong, không cần chen toast.
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void tai());
  }, [tai]);

  // Sự kiện mới sinh liên tục ở nền, nhưng chỉ tải lại khi bảng đang mở để đỡ tốn.
  useEffect(() => {
    if (!moRong) return;
    const id = window.setInterval(() => void tai(), 15000);
    return () => window.clearInterval(id);
  }, [moRong, tai]);

  const luu = async (thayDoi: Partial<CaiDat>) => {
    if (!caiDat) return;
    const truoc = caiDat;
    setCaiDat({ ...caiDat, ...thayDoi }); // đổi ngay trên UI, hỏng thì trả lại
    setDangLuu(true);
    try {
      const res = await fetch('/api/thong-bao/cai-dat', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(thayDoi),
      });
      const data = (await res.json()) as ApiResponse<CaiDat>;
      if (data.status === 'success' && data.data) {
        setCaiDat(data.data);
      } else {
        setCaiDat(truoc);
        thongBao(data.message || 'Không lưu được cài đặt.', 'error');
      }
    } catch {
      setCaiDat(truoc);
      thongBao('Lỗi kết nối máy chủ.', 'error');
    } finally {
      setDangLuu(false);
    }
  };

  const guiThu = async () => {
    setDangLuu(true);
    try {
      const res = await fetch('/api/thong-bao/thu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quetLuon: true }),
      });
      const data = (await res.json()) as ApiResponse<unknown>;
      thongBao(
        data.status === 'success' ? 'Đã gửi thông báo thử.' : data.message || 'Không gửi được.',
        data.status === 'success' ? 'success' : 'error',
      );
      await tai();
    } catch {
      thongBao('Lỗi kết nối máy chủ.', 'error');
    } finally {
      setDangLuu(false);
    }
  };

  const goThietBi = async (tb: ThietBi) => {
    if (!window.confirm(`Gỡ máy "${tb.tenMay || tb.duoiToken}" khỏi danh sách nhận thông báo?`)) return;
    await fetch(`/api/thong-bao/thiet-bi?id=${encodeURIComponent(tb.id)}`, { method: 'DELETE' });
    await tai();
  };

  if (!caiDat) {
    return (
      <div className={`${LOP_THE} flex items-center gap-2 p-4 text-sm text-slate-500`}>
        <Loader2 className="h-4 w-4 animate-spin" /> Đang tải cài đặt thông báo...
      </div>
    );
  }

  const soMayNhan = thietBi.filter((t) => t.hoatDong).length;

  return (
    <div className={`${LOP_THE} p-4`}>
      <div className="flex flex-wrap items-center gap-2">
        {caiDat.bat ? (
          <Bell className="h-4 w-4 text-indigo-500" />
        ) : (
          <BellOff className="h-4 w-4 text-slate-400" />
        )}
        <h3 className="text-sm font-semibold">Thông báo hoạt động máy in</h3>
        <span className="text-xs text-slate-500">
          {caiDat.bat
            ? `${soMayNhan} máy nhận qua app${caiDat.guiZalo && caiDat.zaloThreadId ? ` · Zalo: ${caiDat.zaloTenHoiThoai || caiDat.zaloThreadId}` : ''}`
            : 'Đang tắt — vẫn ghi lịch sử nhưng không báo cho ai.'}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={() => void tai()} className={`${LOP_NUT} border border-slate-300 dark:border-slate-700`}>
            <RefreshCw className="h-4 w-4" /> Làm mới
          </button>
          <button
            type="button"
            onClick={() => void guiThu()}
            disabled={dangLuu || !caiDat.bat}
            className={`${LOP_NUT} border border-slate-300 dark:border-slate-700`}
          >
            <Send className="h-4 w-4" /> Gửi thử
          </button>
          <button
            type="button"
            onClick={() => void luu({ bat: !caiDat.bat })}
            disabled={dangLuu}
            className={`${LOP_NUT} ${caiDat.bat ? 'bg-slate-600' : 'bg-indigo-600'} text-white`}
          >
            {caiDat.bat ? 'Tắt thông báo' : 'Bật thông báo'}
          </button>
          <button
            type="button"
            onClick={() => setMoRong((v) => !v)}
            className={`${LOP_NUT} border border-slate-300 dark:border-slate-700`}
          >
            {moRong ? 'Thu gọn' : 'Cài đặt & lịch sử'}
          </button>
        </div>
      </div>

      {moRong && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {/* ── Kênh gửi ── */}
          <div className="space-y-3">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={caiDat.guiApp}
                onChange={(e) => void luu({ guiApp: e.target.checked })}
                className="mt-1"
              />
              <span>
                <b>Đẩy về app trên điện thoại</b> (Firebase)
                {!firebaseSanSang && (
                  <span className="block text-xs text-rose-500">
                    Chưa có khóa Firebase. Tải service account JSON từ Firebase Console rồi đặt tại{' '}
                    <code>data/fcm-service-account.json</code> trên máy chủ.
                  </span>
                )}
              </span>
            </label>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={caiDat.guiZalo}
                onChange={(e) => void luu({ guiZalo: e.target.checked })}
                className="mt-1"
              />
              <span>
                <b>Gửi tin nhắn Zalo</b> vào hội thoại/nhóm chọn bên dưới
              </span>
            </label>

            <div className="grid gap-2 sm:grid-cols-2">
              <label className="space-y-1 text-xs text-slate-500">
                <span>Hội thoại nhận</span>
                <select
                  value={caiDat.zaloThreadId || ''}
                  onChange={(e) => {
                    const t = threads.find((x) => x.id === e.target.value);
                    void luu({
                      zaloThreadId: e.target.value || null,
                      zaloTenHoiThoai: t ? t.name || t.id : null,
                    });
                  }}
                  className={`${LOP_NHAP} w-full`}
                >
                  <option value="">— Chưa chọn —</option>
                  {threads.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.type === 1 ? '👥 ' : ''}
                      {t.name || t.id}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-xs text-slate-500">
                <span>Zalo chỉ nhận từ mức</span>
                <select
                  value={caiDat.nguongZalo}
                  onChange={(e) => void luu({ nguongZalo: e.target.value })}
                  className={`${LOP_NHAP} w-full`}
                >
                  <option value="tin">Mọi hoạt động</option>
                  <option value="canhBao">Cảnh báo trở lên</option>
                  <option value="loi">Chỉ sự cố</option>
                </select>
              </label>
            </div>

            <div>
              <p className="mb-1 text-xs font-semibold text-slate-500">Loại hoạt động được báo</p>
              <div className="grid grid-cols-2 gap-1">
                {danhMuc.map((m) => {
                  const bat = !caiDat.loaiTat.includes(m.loai);
                  return (
                    <label key={m.loai} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={bat}
                        onChange={(e) =>
                          void luu({
                            loaiTat: e.target.checked
                              ? caiDat.loaiTat.filter((l) => l !== m.loai)
                              : [...caiDat.loaiTat, m.loai],
                          })
                        }
                      />
                      <span className={MAU_MUC_DO[m.mucDo]}>
                        {m.icon} {m.nhan}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="mb-1 text-xs font-semibold text-slate-500">
                Máy đã đăng ký nhận ({thietBi.length})
              </p>
              {thietBi.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Chưa máy nào đăng ký. Mở app 3D Manage trên điện thoại và cho phép quyền thông báo.
                </p>
              ) : (
                <ul className="space-y-1">
                  {thietBi.map((tb) => (
                    <li key={tb.id} className="flex items-center gap-2 text-sm">
                      <Smartphone className={`h-4 w-4 ${tb.hoatDong ? 'text-emerald-500' : 'text-slate-400'}`} />
                      <span className={tb.hoatDong ? '' : 'text-slate-400 line-through'}>
                        {tb.tenMay || `(${tb.nenTang})`} · …{tb.duoiToken}
                      </span>
                      <span className="text-xs text-slate-500">{gio(tb.lanCuoi)}</span>
                      <button
                        type="button"
                        onClick={() => void goThietBi(tb)}
                        className="ml-auto text-slate-400 hover:text-rose-500"
                        aria-label="Gỡ máy"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* ── Lịch sử ── */}
          <div>
            <p className="mb-1 text-xs font-semibold text-slate-500">20 hoạt động gần nhất</p>
            {suKien.length === 0 ? (
              <p className="text-xs text-slate-500">
                Chưa ghi được hoạt động nào. Máy in phải được liên kết cloud (Home Assistant / Moonraker) thì
                mới theo dõi được.
              </p>
            ) : (
              <ul className="max-h-96 space-y-1 overflow-y-auto pr-1">
                {suKien.map((s) => (
                  <li key={s.id} className="rounded-lg border border-slate-200 p-2 text-sm dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <span className={`font-semibold ${MAU_MUC_DO[s.mucDo]}`}>{s.tieuDe}</span>
                      <span className="ml-auto text-xs text-slate-500">{gio(s.createdAt)}</span>
                    </div>
                    <p className="whitespace-pre-line text-xs text-slate-500">{s.noiDung}</p>
                    {!s.daGui && (
                      <p className="text-xs text-amber-500">Chưa đẩy được{s.loiGui ? `: ${s.loiGui}` : '.'}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
