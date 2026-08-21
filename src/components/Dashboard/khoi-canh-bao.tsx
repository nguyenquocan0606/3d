'use client';

import React, { useState } from 'react';
import { AlertTriangle, AlertCircle, Info, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import type { CanhBao, MucDoCanhBao } from '@/types/dashboard.types';

// Ánh xạ dichDen.web → TabKey nội bộ của page.tsx
// Nếu không khớp thì undefined → không điều hướng tab, có thể là external link
const WEB_TO_TAB: Record<string, string | undefined> = {
  production: 'production',
  'printers': 'printers',
  spools: 'spools',
  eshop: 'eshop',
  zalo: 'zalo',
  settings: 'settings',
  store: undefined, // link ra /hang-hoa-cua-hang
  // C12 (thao tác app bị từ chối) cố ý KHÔNG điều hướng: web chưa có màn nào xem
  // được, mà đẩy sang tab Sản xuất thì thợ bấm vào rồi ngơ ngác không thấy gì.
  // Chi tiết (thiết bị, lý do từ chối) đã hiện sẵn trong thẻ cảnh báo.
  'check-inventory': 'check-inventory',
};

function dichDenToTab(web: string): string | undefined {
  // Cắt query string để lấy phần path
  const path = web.split('?')[0];
  return WEB_TO_TAB[path];
}

function dichDenToHref(web: string): string | undefined {
  if (web.startsWith('store')) return '/hang-hoa-cua-hang';
  return undefined;
}

interface KhoiCanhBaoProps {
  canhBao: CanhBao[];
  tinhLuc: string;
  setActiveTab: (tab: string) => void;
}

const iconTheoMuc: Record<MucDoCanhBao, React.ReactNode> = {
  loi: <AlertCircle size={15} className="shrink-0 text-red-400" />,
  canhBao: <AlertTriangle size={15} className="shrink-0 text-amber-400" />,
  tin: <Info size={15} className="shrink-0 text-sky-400" />,
};

const mauNen: Record<MucDoCanhBao, string> = {
  loi: 'border-red-500/30 bg-red-950/30 hover:bg-red-950/50',
  canhBao: 'border-amber-500/30 bg-amber-950/20 hover:bg-amber-950/40',
  tin: 'border-sky-500/20 bg-sky-950/10 hover:bg-sky-950/20',
};

const mauTen: Record<MucDoCanhBao, string> = {
  loi: 'text-red-300',
  canhBao: 'text-amber-300',
  tin: 'text-sky-300',
};

export default function KhoiCanhBao({ canhBao, tinhLuc, setActiveTab }: KhoiCanhBaoProps) {
  const [moRong, setMoRong] = useState(false);

  // Không có cảnh báo → ẩn hoàn toàn
  if (!canhBao.length) return null;

  // Sắp xếp: lỗi → cảnh báo → tin (backend đã sắp nhưng đảm bảo phía client)
  const thuTu: MucDoCanhBao[] = ['loi', 'canhBao', 'tin'];
  const sorted = [...canhBao].sort(
    (a, b) => thuTu.indexOf(a.mucDo) - thuTu.indexOf(b.mucDo),
  );

  const HIEN_TOI_DA = 5;
  const hienThi = moRong ? sorted : sorted.slice(0, HIEN_TOI_DA);
  const conLai = sorted.length - HIEN_TOI_DA;

  const handleClick = (item: CanhBao) => {
    const href = dichDenToHref(item.dichDen.web);
    if (href) {
      window.open(href, '_blank');
      return;
    }
    const tab = dichDenToTab(item.dichDen.web);
    if (tab) setActiveTab(tab);
  };

  return (
    <div className="rounded-2xl border border-slate-700/50 bg-slate-900/40 p-4 space-y-2">
      {/* Tiêu đề khối */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertCircle size={15} className="text-red-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Cần xử lý
          </span>
          <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-xs font-bold text-red-400">
            {canhBao.filter((c) => c.mucDo === 'loi').length} lỗi
          </span>
          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-bold text-amber-400">
            {canhBao.filter((c) => c.mucDo === 'canhBao').length} cảnh báo
          </span>
        </div>
        <span className="text-xs text-slate-600" title={new Date(tinhLuc).toLocaleString('vi-VN')}>
          {tinhTuongDoi(tinhLuc)}
        </span>
      </div>

      {/* Danh sách cảnh báo */}
      <div className="space-y-1.5">
        {hienThi.map((item) => (
          <button
            key={item.ma}
            type="button"
            onClick={() => handleClick(item)}
            className={`flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${mauNen[item.mucDo]}`}
          >
            {iconTheoMuc[item.mucDo]}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className={`text-sm font-semibold ${mauTen[item.mucDo]}`}>
                  {item.tieuDe}
                </span>
                {item.soLuong > 0 && (
                  <span className="text-xs text-slate-500">
                    ({item.soLuong})
                  </span>
                )}
              </div>
              {/* Chi tiết đầu tiên nếu có */}
              {item.chiTiet[0] && (
                <p className="mt-0.5 truncate text-xs text-slate-400">
                  {item.chiTiet[0].nhan}
                  {item.chiTiet.length > 1 && ` + ${item.chiTiet.length - 1} khác`}
                </p>
              )}
            </div>
            {/* Chú thích ⚠ theo §10 */}
            {item.ghiChu && (
              <span title={item.ghiChu} className="shrink-0 text-amber-400 cursor-help">
                ⓘ
              </span>
            )}
            <ExternalLink size={12} className="shrink-0 text-slate-600" />
          </button>
        ))}
      </div>

      {/* Nút "N cảnh báo khác" */}
      {sorted.length > HIEN_TOI_DA && (
        <button
          type="button"
          onClick={() => setMoRong((v) => !v)}
          className="flex w-full items-center justify-center gap-1 rounded-lg py-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          {moRong ? (
            <>
              <ChevronUp size={13} />
              Thu gọn
            </>
          ) : (
            <>
              <ChevronDown size={13} />
              {conLai} cảnh báo khác
            </>
          )}
        </button>
      )}
    </div>
  );
}

/** Thời gian tương đối — "12 phút trước" */
function tinhTuongDoi(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const giay = Math.round(diff / 1000);
  if (giay < 60) return `${giay}s trước`;
  const phut = Math.round(giay / 60);
  if (phut < 60) return `${phut} phút trước`;
  const gio = Math.round(phut / 60);
  return `${gio} giờ trước`;
}
