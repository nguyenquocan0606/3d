'use client';

import React from 'react';
import { Printer, Package, ShoppingCart, Smartphone, Tag } from 'lucide-react';
import type { HoatDong, NhomHoatDong } from '@/types/dashboard.types';

// Feed hoạt động gần đây — trộn 5 nguồn (§4.4)

interface KhoiHoatDongProps {
  data: HoatDong[] | null;
  loading: boolean;
  setActiveTab: (tab: string) => void;
}

const ICON_NHOM: Record<NhomHoatDong, React.ReactNode> = {
  mayIn: <Printer size={13} />,
  sll: <Package size={13} />,
  eshop: <ShoppingCart size={13} />,
  app: <Smartphone size={13} />,
  tem: <Tag size={13} />,
};

const MAU_NHOM: Record<NhomHoatDong, string> = {
  mayIn: 'bg-indigo-500/20 text-indigo-400',
  sll: 'bg-emerald-500/20 text-emerald-400',
  eshop: 'bg-amber-500/20 text-amber-400',
  app: 'bg-sky-500/20 text-sky-400',
  tem: 'bg-purple-500/20 text-purple-400',
};

const TAB_NHOM: Record<NhomHoatDong, string> = {
  mayIn: 'printers',
  sll: 'production',
  eshop: 'eshop',
  app: 'production',
  tem: 'print-label',
};

function tinhTuongDoi(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const giay = Math.round(diff / 1000);
  if (giay < 60) return `${giay}s`;
  const phut = Math.round(giay / 60);
  if (phut < 60) return `${phut}p`;
  const gio = Math.round(phut / 60);
  if (gio < 24) return `${gio}h`;
  return `${Math.round(gio / 24)}d`;
}

export default function KhoiHoatDong({ data, loading, setActiveTab }: KhoiHoatDongProps) {
  if (loading) {
    return (
      <div className="space-y-2 animate-pulse">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-12 rounded-xl bg-slate-800" />
        ))}
      </div>
    );
  }

  if (!data?.length) {
    return (
      <div className="rounded-xl border border-slate-800/40 p-4 text-sm text-slate-600">
        Chưa có hoạt động nào trong 24h
      </div>
    );
  }

  return (
    <div className="space-y-1.5 overflow-y-auto" style={{ maxHeight: 520 }}>
      {data.map((item, i) => (
        <button
          key={i}
          type="button"
          onClick={() => setActiveTab(TAB_NHOM[item.nhom])}
          className="flex w-full items-start gap-2.5 rounded-xl border border-slate-800/40 bg-[#111827]/60 px-3 py-2.5 text-left transition-colors hover:border-indigo-500/20 hover:bg-[#111827]"
        >
          {/* Icon nhóm */}
          <span
            className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg ${MAU_NHOM[item.nhom]}`}
          >
            {ICON_NHOM[item.nhom]}
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white truncate">{item.tieuDe}</p>
            <p className="truncate text-xs text-slate-400">{item.moTa}</p>
          </div>

          <span
            className="shrink-0 text-xs text-slate-600"
            title={new Date(item.luc).toLocaleString('vi-VN')}
          >
            {tinhTuongDoi(item.luc)}
          </span>
        </button>
      ))}
    </div>
  );
}
