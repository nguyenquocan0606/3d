'use client';

import React, { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LogIn, Lock, PackageOpen, User } from 'lucide-react';

/**
 * Trang đăng nhập của bản web. Middleware đẩy mọi trang chưa đăng nhập về đây kèm
 * `?tiep=<đường dẫn>` để đăng nhập xong quay lại đúng chỗ đang muốn vào.
 *
 * App Flutter không dùng trang này (API vẫn mở cho app).
 */
function FormDangNhap() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tenDangNhap, setTenDangNhap] = useState('');
  const [matKhau, setMatKhau] = useState('');
  const [loi, setLoi] = useState<string | null>(null);
  const [dangGui, setDangGui] = useState(false);

  const guiForm = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoi(null);
    setDangGui(true);
    try {
      const res = await fetch('/api/auth/dang-nhap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenDangNhap, matKhau }),
      });
      const duLieu = await res.json();
      if (duLieu.status !== 'success') {
        setLoi(duLieu.message ?? 'Đăng nhập thất bại');
        return;
      }

      // Nhân viên luôn về trang hàng hóa, kể cả khi `tiep` trỏ chỗ khác — middleware
      // cũng chặn, nhưng điều hướng thẳng ở đây thì đỡ một vòng chuyển hướng.
      const tiep = searchParams.get('tiep');
      const dich = duLieu.data?.vaiTro === 'admin' ? tiep || '/' : '/hang-hoa-cua-hang';
      router.replace(dich);
      router.refresh();
    } catch {
      setLoi('Không kết nối được máy chủ');
    } finally {
      setDangGui(false);
    }
  };

  return (
    <form
      onSubmit={guiForm}
      className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-[#0f1729]"
    >
      <div className="mb-6 flex items-center gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white">
          <PackageOpen size={22} />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-base font-bold">3D Print Manager</h1>
          <p className="truncate text-xs text-slate-500">Đăng nhập để tiếp tục</p>
        </div>
      </div>

      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
        Tên đăng nhập
      </label>
      <div className="relative mb-4">
        <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <input
          value={tenDangNhap}
          onChange={(event) => setTenDangNhap(event.target.value)}
          autoFocus
          autoComplete="username"
          className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900"
          placeholder="admin"
        />
      </div>

      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">Mật khẩu</label>
      <div className="relative mb-5">
        <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <input
          type="password"
          value={matKhau}
          onChange={(event) => setMatKhau(event.target.value)}
          autoComplete="current-password"
          className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900"
          placeholder="••••••••"
        />
      </div>

      {loi && (
        <p className="mb-4 rounded-lg border border-red-500/30 bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-200">
          {loi}
        </p>
      )}

      <button
        type="submit"
        disabled={dangGui || !tenDangNhap || !matKhau}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <LogIn size={17} />
        {dangGui ? 'Đang đăng nhập...' : 'Đăng nhập'}
      </button>
    </form>
  );
}

export default function TrangDangNhap() {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-slate-50 p-4 dark:bg-[#090d16]">
      <Suspense fallback={null}>
        <FormDangNhap />
      </Suspense>
    </main>
  );
}
