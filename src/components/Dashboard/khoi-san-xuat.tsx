'use client';

import React from 'react';
import { Clock, ChevronRight } from 'lucide-react';
import type { SanXuatSLL } from '@/types/dashboard.types';

// Khối đang sản xuất: đơn SLL + lượt đang in kèm số phút đã trôi (§4.2 và §8.1)

interface KhoiSanXuatProps {
  data: SanXuatSLL | null;
  loading: boolean;
  setActiveTab: (tab: string) => void;
}

export default function KhoiSanXuat({ data, loading, setActiveTab }: KhoiSanXuatProps) {
  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-3 w-28 rounded bg-slate-700" />
        <div className="h-20 rounded-2xl bg-slate-800" />
        <div className="h-20 rounded-2xl bg-slate-800" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-2xl border border-slate-800/60 bg-[#111827] p-4 text-sm text-slate-500">
        Không tải được dữ liệu sản xuất
      </div>
    );
  }

  const { donDangChay, luotDangIn, phutTrungBinhMoiLuot } = data;

  return (
    <div className="space-y-4">
      {/* Đơn SLL đang chạy */}
      {donDangChay.length > 0 ? (
        <div>
          <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
            Đơn SLL đang chạy
          </h4>
          <div className="space-y-2">
            {donDangChay.map((don) => (
              <button
                key={don.id}
                type="button"
                onClick={() => setActiveTab('production')}
                className="flex w-full flex-col gap-2 rounded-2xl border border-slate-800/60 bg-[#111827] p-4 text-left transition-colors hover:border-indigo-500/30"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">
                      {don.productName}
                    </p>
                    {don.orderCode && (
                      <p className="text-xs text-slate-500">{don.orderCode}</p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="text-lg font-bold text-indigo-400">
                      {don.phanTram}%
                    </span>
                    <p className="text-xs text-slate-500">
                      {don.daXong.toLocaleString('vi-VN')} / {don.tong.toLocaleString('vi-VN')}
                    </p>
                  </div>
                </div>
                {/* Thanh tiến độ */}
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-indigo-500 transition-all"
                    style={{ width: `${Math.min(don.phanTram, 100)}%` }}
                  />
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-800/40 bg-[#111827]/50 p-4 text-sm text-slate-600">
          Không có đơn SLL nào đang chạy
        </div>
      )}

      {/* Lượt đang in ngay lúc này */}
      {luotDangIn.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
            Lượt đang in ({luotDangIn.length})
          </h4>
          <div className="space-y-1.5">
            {luotDangIn.map((luot) => {
              // Cảnh báo nếu chạy quá 2x thời gian trung bình (min 90 phút)
              const nguong = Math.max(
                phutTrungBinhMoiLuot != null ? phutTrungBinhMoiLuot * 2 : 999999,
                90,
              );
              const quaLau = luot.phutDaTroi > nguong;

              return (
                <button
                  key={luot.id}
                  type="button"
                  onClick={() => setActiveTab('production')}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors hover:border-indigo-500/20 ${
                    quaLau
                      ? 'border-amber-500/30 bg-amber-950/10'
                      : 'border-slate-800/60 bg-[#111827]'
                  }`}
                >
                  <Clock
                    size={15}
                    className={quaLau ? 'text-amber-400' : 'text-indigo-400'}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white">
                      PEI {luot.peiIndex} — {luot.may}
                    </p>
                    <p className="text-xs text-slate-400">
                      {luot.soCon.toLocaleString('vi-VN')} con
                      {quaLau && (
                        <span className="ml-1 text-amber-400">⚠ chạy quá lâu</span>
                      )}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={`text-sm font-bold ${quaLau ? 'text-amber-400' : 'text-white'}`}
                    >
                      {formatPhut(luot.phutDaTroi)}
                    </p>
                    <p className="text-xs text-slate-500">đã trôi</p>
                  </div>
                  <ChevronRight size={14} className="text-slate-600" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Thống kê tóm tắt */}
      <div className="flex flex-wrap gap-3 text-xs text-slate-500">
        {phutTrungBinhMoiLuot != null && (
          <span>
            ⌀ {formatPhut(phutTrungBinhMoiLuot)} / lượt
          </span>
        )}
        <span>{data.luot.xong} lượt xong</span>
        <span>{data.luot.cho} lượt chờ</span>
        {data.luotInBu > 0 && (
          <span className="text-amber-400">{data.luotInBu} lượt in bù</span>
        )}
      </div>
    </div>
  );
}

function formatPhut(phut: number): string {
  if (phut < 60) return `${phut}p`;
  const h = Math.floor(phut / 60);
  const p = phut % 60;
  return p > 0 ? `${h}h${p}p` : `${h}h`;
}
