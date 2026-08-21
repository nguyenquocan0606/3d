'use client';

import React from 'react';
import { TrendingUp } from 'lucide-react';
import BieudoCot from './bieu-do-cot';
import BieudoDuong from './bieu-do-duong';
import type { KetQuaXuHuong } from '@/types/dashboard.types';

// Khối xu hướng 30 ngày: 4 biểu đồ + 4 bảng xếp hạng (§4.3, §8.3)

interface KhoiXuHuongProps {
  data: KetQuaXuHuong | null;
  loading: boolean;
  setActiveTab: (tab: string) => void;
}

export default function KhoiXuHuong({ data, loading, setActiveTab }: KhoiXuHuongProps) {
  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-3 w-36 rounded bg-slate-700" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-52 rounded-2xl bg-slate-800" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-2xl border border-slate-800/40 p-4 text-sm text-slate-500">
        Không tải được dữ liệu xu hướng
      </div>
    );
  }

  const { ngay, chuoi, xepHang } = data;

  const dinhDangTien = (v: number) =>
    v >= 1_000_000
      ? `${(v / 1_000_000).toFixed(1)}tr`
      : v >= 1_000
        ? `${Math.round(v / 1_000)}k`
        : v.toLocaleString('vi-VN');

  const dinhDangKg = (v: number) =>
    v >= 1000 ? `${(v / 1000).toFixed(2)}kg` : `${v.toLocaleString('vi-VN')}g`;

  return (
    <div className="space-y-8">
      {/* 4 biểu đồ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sản lượng */}
        <div className="rounded-2xl border border-slate-800/60 bg-[#111827] p-4">
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp size={14} className="text-indigo-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Sản lượng con / ngày
            </span>
          </div>
          <BieudoCot
            ngay={ngay}
            giaTri={chuoi.conXong}
            nhan="con"
            mau="#6366f1"
          />
        </div>

        {/* Tỉ lệ lỗi — đường, đứt đoạn khi null */}
        <div className="rounded-2xl border border-slate-800/60 bg-[#111827] p-4">
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp size={14} className="text-amber-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Tỉ lệ lỗi / ngày
            </span>
            <span
              title="null = ngày không sản xuất, hiện đứt đoạn không nối 0 — đây là nguyên tắc của biểu đồ"
              className="ml-auto cursor-help text-xs text-amber-400"
            >
              ⓘ
            </span>
          </div>
          <BieudoDuong
            ngay={ngay}
            giaTri={chuoi.tiLeLoi}
            nhan="lỗi"
            mau="#f59e0b"
            phanTram
          />
        </div>

        {/* Nhựa tiêu hao */}
        <div className="rounded-2xl border border-slate-800/60 bg-[#111827] p-4">
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp size={14} className="text-cyan-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Nhựa đã trừ / ngày
            </span>
            <span
              title="Dữ liệu dựa trên Task3DSpoolUsage (trừ theo job), chưa phải tiêu hao cân thực"
              className="ml-auto cursor-help text-xs text-amber-400"
            >
              ⓘ
            </span>
          </div>
          <BieudoCot
            ngay={ngay}
            giaTri={chuoi.nhuaTru}
            nhan=""
            mau="#22d3ee"
            dinhDang={dinhDangKg}
          />
        </div>

        {/* Doanh thu eShop */}
        <div className="rounded-2xl border border-slate-800/60 bg-[#111827] p-4">
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp size={14} className="text-emerald-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Doanh thu eShop / ngày
            </span>
            <span
              title="Từ trường totalRevenue MISA — chưa đối chiếu phí sàn/giảm giá"
              className="ml-auto cursor-help text-xs text-amber-400"
            >
              ⓘ
            </span>
          </div>
          <BieudoCot
            ngay={ngay}
            giaTri={chuoi.doanhThu}
            nhan="₫"
            mau="#10b981"
            dinhDang={dinhDangTien}
          />
        </div>
      </div>

      {/* Bảng xếp hạng */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Top máy theo sản lượng */}
        <BangXepHang
          tieu_de="Máy theo sản lượng"
          hang={xepHang.mayTheoSanLuong.map((m) => ({
            ten: m.tenMay,
            gia_tri: m.soConXong.toLocaleString('vi-VN'),
            phu: 'con',
          }))}
          onBam={() => setActiveTab('printers')}
        />

        {/* Top máy hay lỗi */}
        <BangXepHang
          tieu_de="Máy hay lỗi nhất"
          hang={xepHang.mayTheoLoi.map((m) => ({
            ten: m.tenMay,
            gia_tri: m.soLanLoi.toString(),
            phu: 'lần',
            mau: 'text-red-400',
          }))}
          onBam={() => setActiveTab('printers')}
        />

        {/* Nhựa tiêu hao */}
        <BangXepHang
          tieu_de="Nhựa tiêu hao nhiều nhất"
          hang={xepHang.nhuaTieuHao.map((n) => ({
            ten: `${n.loai} ${n.mau}`,
            gia_tri: dinhDangKg(n.tong_g),
            hex: n.hex ?? undefined,
          }))}
          onBam={() => setActiveTab('spools')}
        />

        {/* SKU bán chạy */}
        <BangXepHang
          tieu_de="SKU bán chạy 30 ngày"
          hang={xepHang.skuBanChay.map((s) => ({
            ten: s.ten || s.sku,
            gia_tri: s.soLuong.toLocaleString('vi-VN'),
            phu: 'cái',
          }))}
          onBam={() => window.open('/hang-hoa-cua-hang', '_blank')}
        />
      </div>
    </div>
  );
}

interface HangItem {
  ten: string;
  gia_tri: string;
  phu?: string;
  mau?: string;
  hex?: string;
}

function BangXepHang({
  tieu_de,
  hang,
  onBam,
}: {
  tieu_de: string;
  hang: HangItem[];
  onBam: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onBam}
      className="flex flex-col gap-2 rounded-2xl border border-slate-800/60 bg-[#111827] p-4 text-left transition-colors hover:border-indigo-500/20 w-full"
    >
      <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{tieu_de}</p>
      {!hang.length ? (
        <p className="text-xs text-slate-600">Chưa có dữ liệu</p>
      ) : (
        <div className="space-y-1.5 w-full">
          {hang.slice(0, 5).map((h, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs text-slate-600 w-4 shrink-0">{i + 1}</span>
              {h.hex && (
                <span
                  className="size-3 rounded-full shrink-0"
                  style={{ backgroundColor: h.hex }}
                />
              )}
              <span className="flex-1 truncate text-xs text-slate-300">{h.ten}</span>
              <span className={`shrink-0 text-xs font-bold ${h.mau ?? 'text-white'}`}>
                {h.gia_tri}
              </span>
              {h.phu && (
                <span className="text-xs text-slate-600">{h.phu}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </button>
  );
}
