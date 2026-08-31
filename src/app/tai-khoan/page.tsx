'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { KeyRound, Plus, Shield, Trash2, User, Users } from 'lucide-react';

/**
 * Trang quản lý tài khoản web — chỉ admin vào được (middleware chặn nhân viên,
 * và API `/api/nguoi-dung` cũng tự kiểm tra vai trò).
 */

interface NguoiDung {
  id: string;
  tenDangNhap: string;
  hoTen: string;
  vaiTro: 'admin' | 'nhanVien';
  hoatDong: boolean;
  lanDangNhapCuoi: string | null;
  createdAt: string;
}

const dinhDangNgay = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' });

export default function TrangTaiKhoan() {
  const [danhSach, setDanhSach] = useState<NguoiDung[]>([]);
  const [dangTai, setDangTai] = useState(true);
  const [thongBao, setThongBao] = useState<{ loi: boolean; chu: string } | null>(null);
  const [moThemMoi, setMoThemMoi] = useState(false);
  const [doiMatKhauCho, setDoiMatKhauCho] = useState<NguoiDung | null>(null);

  const taiDanhSach = useCallback(async () => {
    try {
      const res = await fetch('/api/nguoi-dung');
      const duLieu = await res.json();
      if (duLieu.status === 'success') setDanhSach(duLieu.data);
      else setThongBao({ loi: true, chu: duLieu.message });
    } catch {
      setThongBao({ loi: true, chu: 'Không tải được danh sách tài khoản' });
    } finally {
      setDangTai(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await taiDanhSach();
    })();
  }, [taiDanhSach]);

  const goiApi = async (duongDan: string, tuyChon: RequestInit, chuThanhCong: string) => {
    try {
      const res = await fetch(duongDan, {
        ...tuyChon,
        headers: { 'Content-Type': 'application/json', ...(tuyChon.headers ?? {}) },
      });
      const duLieu = await res.json();
      if (duLieu.status !== 'success') {
        setThongBao({ loi: true, chu: duLieu.message ?? 'Thao tác thất bại' });
        return false;
      }
      setThongBao({ loi: false, chu: chuThanhCong });
      await taiDanhSach();
      return true;
    } catch {
      setThongBao({ loi: true, chu: 'Không kết nối được máy chủ' });
      return false;
    }
  };

  const doiVaiTro = (muc: NguoiDung, vaiTro: NguoiDung['vaiTro']) =>
    goiApi(`/api/nguoi-dung/${muc.id}`, { method: 'PATCH', body: JSON.stringify({ vaiTro }) }, 'Đã đổi vai trò');

  const doiHoatDong = (muc: NguoiDung) =>
    goiApi(
      `/api/nguoi-dung/${muc.id}`,
      { method: 'PATCH', body: JSON.stringify({ hoatDong: !muc.hoatDong }) },
      muc.hoatDong ? 'Đã khóa tài khoản' : 'Đã mở khóa tài khoản',
    );

  const xoa = (muc: NguoiDung) => {
    if (!confirm(`Xóa tài khoản "${muc.tenDangNhap}"?`)) return;
    return goiApi(`/api/nguoi-dung/${muc.id}`, { method: 'DELETE' }, 'Đã xóa tài khoản');
  };

  return (
    <main className="min-h-[100dvh] bg-slate-50 text-slate-900 dark:bg-[#090d16] dark:text-white">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5 dark:border-slate-800 dark:bg-[#090d16]">
        <Link
          href="/"
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          &larr; Quay lại
        </Link>
        <span className="flex size-8 items-center justify-center rounded-lg bg-indigo-600/10 text-indigo-500 dark:bg-indigo-500/15 dark:text-indigo-300">
          <Users className="size-4" />
        </span>
        <h1 className="text-base font-bold">Tài khoản đăng nhập</h1>
        <button
          type="button"
          onClick={() => setMoThemMoi(true)}
          className="ml-auto inline-flex h-9 items-center gap-2 rounded-lg bg-indigo-600 px-3 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          <Plus size={16} />
          Thêm tài khoản
        </button>
      </header>

      <div className="p-5">
        <p className="mb-4 rounded-xl border border-amber-500/30 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          Nhân viên chỉ vào được trang <b>Hàng hóa cửa hàng</b>; đăng nhập xong sẽ tự chuyển sang trang đó. Lưu ý: giới
          hạn này áp dụng cho giao diện web — các đường API vẫn để mở cho app di động.
        </p>

        {thongBao && (
          <p
            className={`mb-4 rounded-xl px-4 py-3 text-sm ${
              thongBao.loi
                ? 'border border-red-500/30 bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-200'
                : 'border border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200'
            }`}
          >
            {thongBao.chu}
          </p>
        )}

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0f1729]">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wider text-slate-500 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3">Tài khoản</th>
                <th className="px-4 py-3">Vai trò</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3">Đăng nhập cuối</th>
                <th className="px-4 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {dangTai && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                    Đang tải...
                  </td>
                </tr>
              )}
              {!dangTai && danhSach.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                    Chưa có tài khoản nào
                  </td>
                </tr>
              )}
              {danhSach.map((muc) => (
                <tr key={muc.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800/70">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`flex size-8 items-center justify-center rounded-lg ${
                          muc.vaiTro === 'admin'
                            ? 'bg-indigo-600/10 text-indigo-500'
                            : 'bg-emerald-600/10 text-emerald-600'
                        }`}
                      >
                        {muc.vaiTro === 'admin' ? <Shield className="size-4" /> : <User className="size-4" />}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{muc.hoTen}</div>
                        <div className="truncate text-xs text-slate-500">{muc.tenDangNhap}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={muc.vaiTro}
                      onChange={(event) => doiVaiTro(muc, event.target.value as NguoiDung['vaiTro'])}
                      className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900"
                    >
                      <option value="admin">Quản trị (toàn quyền)</option>
                      <option value="nhanVien">Nhân viên (hàng hóa cửa hàng)</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => doiHoatDong(muc)}
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        muc.hoatDong
                          ? 'bg-emerald-600/10 text-emerald-600 dark:text-emerald-300'
                          : 'bg-slate-500/10 text-slate-500'
                      }`}
                    >
                      {muc.hoatDong ? 'Đang hoạt động' : 'Đã khóa'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {muc.lanDangNhapCuoi ? dinhDangNgay.format(new Date(muc.lanDangNhapCuoi)) : 'Chưa đăng nhập'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setDoiMatKhauCho(muc)}
                        title="Đặt lại mật khẩu"
                        className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        <KeyRound className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => xoa(muc)}
                        title="Xóa tài khoản"
                        className="rounded-lg border border-red-500/30 p-2 text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {moThemMoi && (
        <ModalThemTaiKhoan
          dong={() => setMoThemMoi(false)}
          xong={async (body) => {
            const ok = await goiApi('/api/nguoi-dung', { method: 'POST', body: JSON.stringify(body) }, 'Đã tạo tài khoản');
            if (ok) setMoThemMoi(false);
            return ok;
          }}
        />
      )}

      {doiMatKhauCho && (
        <ModalDatLaiMatKhau
          muc={doiMatKhauCho}
          dong={() => setDoiMatKhauCho(null)}
          xong={async (matKhau) => {
            const ok = await goiApi(
              `/api/nguoi-dung/${doiMatKhauCho.id}`,
              { method: 'PATCH', body: JSON.stringify({ matKhau }) },
              'Đã đặt lại mật khẩu',
            );
            if (ok) setDoiMatKhauCho(null);
            return ok;
          }}
        />
      )}
    </main>
  );
}

const O_NHAP =
  'h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900';

function KhungModal({ dong, children, onSubmit }: { dong: () => void; children: React.ReactNode; onSubmit: (e: React.FormEvent) => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={dong}>
      <form
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-[#0f1729]"
      >
        {children}
      </form>
    </div>
  );
}

function ModalThemTaiKhoan({
  dong,
  xong,
}: {
  dong: () => void;
  xong: (body: { tenDangNhap: string; hoTen: string; matKhau: string; vaiTro: string }) => Promise<boolean>;
}) {
  const [tenDangNhap, setTenDangNhap] = useState('');
  const [hoTen, setHoTen] = useState('');
  const [matKhau, setMatKhau] = useState('');
  const [vaiTro, setVaiTro] = useState('nhanVien');
  const [dangGui, setDangGui] = useState(false);

  return (
    <KhungModal
      dong={dong}
      onSubmit={async (event) => {
        event.preventDefault();
        setDangGui(true);
        await xong({ tenDangNhap, hoTen, matKhau, vaiTro });
        setDangGui(false);
      }}
    >
      <h2 className="mb-4 text-base font-bold">Thêm tài khoản</h2>

      <label className="mb-1 block text-xs font-semibold text-slate-500">Tên đăng nhập</label>
      <input value={tenDangNhap} onChange={(e) => setTenDangNhap(e.target.value)} className={`${O_NHAP} mb-3`} placeholder="vd: nhanvien2" />

      <label className="mb-1 block text-xs font-semibold text-slate-500">Họ tên</label>
      <input value={hoTen} onChange={(e) => setHoTen(e.target.value)} className={`${O_NHAP} mb-3`} placeholder="vd: Nguyễn Văn A" />

      <label className="mb-1 block text-xs font-semibold text-slate-500">Mật khẩu (từ 6 ký tự)</label>
      <input type="password" value={matKhau} onChange={(e) => setMatKhau(e.target.value)} className={`${O_NHAP} mb-3`} autoComplete="new-password" />

      <label className="mb-1 block text-xs font-semibold text-slate-500">Vai trò</label>
      <select value={vaiTro} onChange={(e) => setVaiTro(e.target.value)} className={`${O_NHAP} mb-4`}>
        <option value="nhanVien">Nhân viên (chỉ hàng hóa cửa hàng)</option>
        <option value="admin">Quản trị (toàn quyền)</option>
      </select>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={dong} className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">
          Hủy
        </button>
        <button type="submit" disabled={dangGui || !tenDangNhap || !hoTen || !matKhau} className="h-10 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
          {dangGui ? 'Đang tạo...' : 'Tạo'}
        </button>
      </div>
    </KhungModal>
  );
}

function ModalDatLaiMatKhau({ muc, dong, xong }: { muc: NguoiDung; dong: () => void; xong: (matKhau: string) => Promise<boolean> }) {
  const [matKhau, setMatKhau] = useState('');
  const [dangGui, setDangGui] = useState(false);

  return (
    <KhungModal
      dong={dong}
      onSubmit={async (event) => {
        event.preventDefault();
        setDangGui(true);
        await xong(matKhau);
        setDangGui(false);
      }}
    >
      <h2 className="mb-1 text-base font-bold">Đặt lại mật khẩu</h2>
      <p className="mb-4 text-sm text-slate-500">
        Tài khoản <b>{muc.tenDangNhap}</b>
      </p>

      <label className="mb-1 block text-xs font-semibold text-slate-500">Mật khẩu mới (từ 6 ký tự)</label>
      <input type="password" value={matKhau} onChange={(e) => setMatKhau(e.target.value)} className={`${O_NHAP} mb-4`} autoComplete="new-password" />

      <div className="flex justify-end gap-2">
        <button type="button" onClick={dong} className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">
          Hủy
        </button>
        <button type="submit" disabled={dangGui || matKhau.length < 6} className="h-10 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
          {dangGui ? 'Đang lưu...' : 'Lưu'}
        </button>
      </div>
    </KhungModal>
  );
}
