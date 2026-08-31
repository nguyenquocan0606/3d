'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, LogOut, Shield, User, Users } from 'lucide-react';

export interface NguoiDungHienTai {
  id: string;
  tenDangNhap: string;
  hoTen: string;
  vaiTro: 'admin' | 'nhanVien';
}

/**
 * Đọc tài khoản đang đăng nhập từ `/api/auth/toi`.
 *
 * Cookie phiên là `httpOnly` nên JS không đọc trực tiếp được — phải hỏi máy chủ.
 * Trả `undefined` khi chưa tải xong để giao diện khỏi chớp nội dung sai vai trò.
 */
export function useNguoiDungHienTai(): NguoiDungHienTai | null | undefined {
  const [nguoiDung, setNguoiDung] = useState<NguoiDungHienTai | null | undefined>(undefined);

  useEffect(() => {
    let conGan = true;
    fetch('/api/auth/toi')
      .then((res) => res.json())
      .then((duLieu) => {
        if (conGan) setNguoiDung(duLieu?.data ?? null);
      })
      .catch(() => {
        if (conGan) setNguoiDung(null);
      });
    return () => {
      conGan = false;
    };
  }, []);

  return nguoiDung;
}

/** Thẻ tài khoản: tên + vai trò, bấm ra menu đổi mật khẩu / quản lý tài khoản / đăng xuất. */
export default function TheNguoiDung({
  thuGon = false,
  huong = 'len',
}: {
  /** Chỉ hiện avatar, giấu tên — dùng khi thanh bên đang thu gọn. */
  thuGon?: boolean;
  /** Menu bung lên (thẻ nằm dưới cùng thanh bên) hay bung xuống (thẻ nằm trên header). */
  huong?: 'len' | 'xuong';
}) {
  const router = useRouter();
  const nguoiDung = useNguoiDungHienTai();
  const [moMenu, setMoMenu] = useState(false);
  const [moDoiMatKhau, setMoDoiMatKhau] = useState(false);
  const boc = useRef<HTMLDivElement>(null);

  // Bấm ra ngoài thì đóng menu.
  useEffect(() => {
    if (!moMenu) return;
    const xuLy = (event: MouseEvent) => {
      if (boc.current && !boc.current.contains(event.target as Node)) setMoMenu(false);
    };
    document.addEventListener('mousedown', xuLy);
    return () => document.removeEventListener('mousedown', xuLy);
  }, [moMenu]);

  if (!nguoiDung) return null;

  const laAdmin = nguoiDung.vaiTro === 'admin';

  const dangXuat = async () => {
    await fetch('/api/auth/dang-xuat', { method: 'POST' });
    router.replace('/dang-nhap');
    router.refresh();
  };

  return (
    <div className="relative" ref={boc}>
      <button
        type="button"
        onClick={() => setMoMenu((giaTri) => !giaTri)}
        title={`${nguoiDung.hoTen} (${laAdmin ? 'Quản trị' : 'Nhân viên'})`}
        className={`flex items-center gap-2.5 rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-left hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800 ${
          thuGon ? 'justify-center' : 'w-full'
        }`}
      >
        <span
          className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${
            laAdmin ? 'bg-indigo-600/10 text-indigo-500' : 'bg-emerald-600/10 text-emerald-600'
          }`}
        >
          {laAdmin ? <Shield className="size-4" /> : <User className="size-4" />}
        </span>
        {!thuGon && (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{nguoiDung.hoTen}</span>
            <span className="block truncate text-xs text-slate-500">{laAdmin ? 'Quản trị' : 'Nhân viên'}</span>
          </span>
        )}
      </button>

      {moMenu && (
        <div className={`absolute right-0 z-50 w-56 ${huong === 'len' ? 'bottom-full mb-2' : 'top-full mt-2'} overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-[#0f1729]`}>
          <button
            type="button"
            onClick={() => {
              setMoMenu(false);
              setMoDoiMatKhau(true);
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <KeyRound className="size-4 text-slate-500" />
            Đổi mật khẩu
          </button>
          {laAdmin && (
            <button
              type="button"
              onClick={() => {
                setMoMenu(false);
                router.push('/tai-khoan');
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Users className="size-4 text-slate-500" />
              Quản lý tài khoản
            </button>
          )}
          <button
            type="button"
            onClick={dangXuat}
            className="flex w-full items-center gap-2.5 border-t border-slate-200 px-3 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 dark:border-slate-700 dark:text-red-300 dark:hover:bg-red-950/40"
          >
            <LogOut className="size-4" />
            Đăng xuất
          </button>
        </div>
      )}

      {moDoiMatKhau && <ModalDoiMatKhau dong={() => setMoDoiMatKhau(false)} />}
    </div>
  );
}

function ModalDoiMatKhau({ dong }: { dong: () => void }) {
  const [matKhauCu, setMatKhauCu] = useState('');
  const [matKhauMoi, setMatKhauMoi] = useState('');
  const [nhapLai, setNhapLai] = useState('');
  const [thongBao, setThongBao] = useState<{ loi: boolean; chu: string } | null>(null);
  const [dangGui, setDangGui] = useState(false);

  const gui = async (event: React.FormEvent) => {
    event.preventDefault();
    if (matKhauMoi !== nhapLai) {
      setThongBao({ loi: true, chu: 'Hai lần nhập mật khẩu mới không khớp' });
      return;
    }
    setDangGui(true);
    try {
      const res = await fetch('/api/auth/doi-mat-khau', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matKhauCu, matKhauMoi }),
      });
      const duLieu = await res.json();
      if (duLieu.status !== 'success') {
        setThongBao({ loi: true, chu: duLieu.message ?? 'Không đổi được mật khẩu' });
        return;
      }
      setThongBao({ loi: false, chu: 'Đã đổi mật khẩu' });
      setTimeout(dong, 900);
    } catch {
      setThongBao({ loi: true, chu: 'Không kết nối được máy chủ' });
    } finally {
      setDangGui(false);
    }
  };

  const oNhap =
    'h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onMouseDown={dong}>
      <form
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={gui}
        className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-[#0f1729]"
      >
        <h2 className="mb-4 text-base font-bold">Đổi mật khẩu</h2>

        <label className="mb-1 block text-xs font-semibold text-slate-500">Mật khẩu hiện tại</label>
        <input
          type="password"
          value={matKhauCu}
          onChange={(event) => setMatKhauCu(event.target.value)}
          className={`${oNhap} mb-3`}
          autoComplete="current-password"
        />

        <label className="mb-1 block text-xs font-semibold text-slate-500">Mật khẩu mới (từ 6 ký tự)</label>
        <input
          type="password"
          value={matKhauMoi}
          onChange={(event) => setMatKhauMoi(event.target.value)}
          className={`${oNhap} mb-3`}
          autoComplete="new-password"
        />

        <label className="mb-1 block text-xs font-semibold text-slate-500">Nhập lại mật khẩu mới</label>
        <input
          type="password"
          value={nhapLai}
          onChange={(event) => setNhapLai(event.target.value)}
          className={`${oNhap} mb-4`}
          autoComplete="new-password"
        />

        {thongBao && (
          <p
            className={`mb-3 rounded-lg px-3 py-2 text-sm ${
              thongBao.loi
                ? 'border border-red-500/30 bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-200'
                : 'border border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200'
            }`}
          >
            {thongBao.chu}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={dong}
            className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={dangGui || !matKhauCu || !matKhauMoi}
            className="h-10 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {dangGui ? 'Đang lưu...' : 'Lưu'}
          </button>
        </div>
      </form>
    </div>
  );
}
