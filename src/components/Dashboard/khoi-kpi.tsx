'use client';

import React from 'react';
import { Package, AlertTriangle, Printer, Weight, ShoppingCart, Store } from 'lucide-react';
import type { KetQuaTongQuan } from '@/types/dashboard.types';

// Lưới 6 ô KPI theo §4.2 và bố cục §8.1
// Mỗi ô bấm được → đúng tab/bộ lọc (§2.3)

interface KhoiKpiProps {
  data: KetQuaTongQuan | null;
  /** null = đang tải (hiện skeleton); undefined = lỗi (hiện —) */
  loading: boolean;
  setActiveTab: (tab: string) => void;
}

interface OKpi {
  nhan: string;
  icon: React.ReactNode;
  gia_tri: React.ReactNode;
  phu_de?: React.ReactNode;
  tab?: string;
  href?: string;
  mau_vien?: string; // thêm màu viền khi cần cảnh báo
  ghi_chu?: string;  // metric ⚠ — hiện icon ⓘ
}

// Skeleton ô KPI khi đang tải
function SkeletonO() {
  return (
    <div className="h-28 md:h-32 rounded-2xl border border-slate-800/80 bg-[#111827] p-5 animate-pulse">
      <div className="h-3 w-20 rounded bg-slate-700" />
      <div className="mt-4 h-8 w-16 rounded bg-slate-700" />
      <div className="mt-2 h-2 w-28 rounded bg-slate-800" />
    </div>
  );
}

function OKpiCard({ o, setActiveTab }: { o: OKpi; setActiveTab: (tab: string) => void }) {
  const handleClick = () => {
    if (o.href) {
      window.open(o.href, '_blank');
    } else if (o.tab) {
      setActiveTab(o.tab);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!o.tab && !o.href}
      className={`relative flex h-28 md:h-32 w-full flex-col justify-between overflow-hidden rounded-2xl border bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md disabled:cursor-default dark:bg-[#111827] ${
        o.mau_vien ?? 'border-slate-200 dark:border-slate-800/80'
      }`}
    >
      <div className="flex items-start justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {o.nhan}
        </span>
        <div className="flex items-center gap-1">
          {o.ghi_chu && (
            <span title={o.ghi_chu} className="cursor-help text-amber-400 text-sm">
              ⓘ
            </span>
          )}
          <span className="rounded-lg p-1.5 bg-slate-100 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400">
            {o.icon}
          </span>
        </div>
      </div>
      <div>
        <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
          {o.gia_tri}
        </div>
        {o.phu_de && (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{o.phu_de}</p>
        )}
      </div>
    </button>
  );
}

export default function KhoiKpi({ data, loading, setActiveTab }: KhoiKpiProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => <SkeletonO key={i} />)}
      </div>
    );
  }

  // Lấy giá trị — "—" khi nhóm null (nhóm lỗi theo Promise.allSettled)
  const sll = data?.sanXuatSLL;
  const nhua = data?.nhua;
  const eshop = data?.eshop;
  const hangHoa = data?.hangHoa;

  const mayDangIn = sll?.luot.dangIn;

  const oList: OKpi[] = [
    {
      nhan: 'Con in xong',
      icon: <Package size={16} />,
      gia_tri: sll != null ? sll.conXong.toLocaleString('vi-VN') : '—',
      phu_de: sll != null
        ? `${sll.conLoi.toLocaleString('vi-VN')} con lỗi${sll.luotInBu ? ` · ${sll.luotInBu} lượt bù` : ''}`
        : undefined,
      tab: 'production',
    },
    {
      nhan: 'Tỉ lệ lỗi',
      icon: <AlertTriangle size={16} />,
      gia_tri:
        sll != null
          ? sll.tiLeLoi != null
            ? `${(sll.tiLeLoi * 100).toFixed(1)}%`
            : '—'
          : '—',
      phu_de: sll?.tiLeLoi != null && sll.tiLeLoi > 0.05
        ? 'Trên ngưỡng 5%'
        : sll?.tiLeLoi != null
          ? 'Trong ngưỡng an toàn'
          : 'Chưa có lượt nào trong kỳ',
      mau_vien:
        sll?.tiLeLoi != null && sll.tiLeLoi > 0.05
          ? 'border-amber-500/40 dark:border-amber-500/30'
          : undefined,
      tab: 'production',
    },
    {
      nhan: 'Máy đang in',
      icon: <Printer size={16} />,
      gia_tri: mayDangIn != null ? mayDangIn.toString() : '—',
      phu_de:
        sll != null
          ? `${sll.luot.xong} xong · ${sll.luot.cho} chờ`
          : undefined,
      tab: 'printers',
    },
    {
      nhan: 'Nhựa còn (kg)',
      icon: <Weight size={16} />,
      gia_tri: nhua != null ? nhua.kgCon.toFixed(2) : '—',
      phu_de: nhua != null ? `${nhua.theoTrangThai.active ?? 0} cuộn active` : undefined,
      tab: 'spools',
    },
    {
      nhan: 'Đơn chờ nhặt',
      icon: <ShoppingCart size={16} />,
      gia_tri: eshop != null ? eshop.nhat.cho.toString() : '—',
      phu_de:
        eshop != null
          ? `${eshop.nhat.dangNhat} đang nhặt · ${eshop.nhat.daNhat} xong`
          : undefined,
      mau_vien:
        eshop?.nhat.cho && eshop.nhat.cho > 0
          ? 'border-amber-500/30 dark:border-amber-500/20'
          : undefined,
      tab: 'eshop',
    },
    {
      nhan: 'Hàng dưới ngưỡng',
      icon: <Store size={16} />,
      gia_tri: hangHoa != null ? hangHoa.duoiNguong.toString() : '—',
      phu_de: hangHoa != null ? `${hangHoa.hetHang} hết hàng / ${hangHoa.soMatHang} mặt hàng` : undefined,
      mau_vien:
        hangHoa?.duoiNguong && hangHoa.duoiNguong > 0
          ? 'border-amber-500/30 dark:border-amber-500/20'
          : undefined,
      href: '/hang-hoa-cua-hang',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
      {oList.map((o, i) => (
        <OKpiCard key={i} o={o} setActiveTab={setActiveTab} />
      ))}
    </div>
  );
}
