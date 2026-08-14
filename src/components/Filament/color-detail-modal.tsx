'use client';

import React from 'react';
import { X, Palette, Printer as PrinterIcon, Database } from 'lucide-react';

interface ColorDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  colorName: string;
  colorHex: string;
  spools: any[];
  onPrintQR: (colorName: string) => void;
}

export default function ColorDetailModal({
  isOpen,
  onClose,
  colorName,
  colorHex,
  spools,
  onPrintQR,
}: ColorDetailModalProps) {
  if (!isOpen) return null;

  const totalRemainingG = spools.reduce((acc, s) => acc + s.remainingWeightG, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#0f1729] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-[#0f1729] z-10">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl border border-slate-300 dark:border-slate-700 shadow-lg relative overflow-hidden"
              style={{ backgroundColor: colorHex || '#4f46e5' }}
            >
              <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent pointer-events-none" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{colorName}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {spools.length} cuộn — {totalRemainingG.toLocaleString()}g còn lại
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPrintQR(colorName)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-lg text-xs transition-colors cursor-pointer"
            >
              <PrinterIcon size={12} />
              In QR màu
            </button>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-slate-200 dark:bg-slate-800 rounded-lg transition-colors text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body - Spool table */}
        <div className="p-5">
          {spools.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
              <Palette className="mx-auto mb-2 text-slate-600" size={32} />
              <p className="text-sm text-slate-500">Không có cuộn nhựa nào với màu này.</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-900/40 text-[10px] font-semibold text-slate-500 dark:text-slate-400 tracking-wider uppercase">
                      <th className="py-3 px-3 font-mono">Mã cuộn</th>
                      <th className="py-3 px-3">Loại</th>
                      <th className="py-3 px-3">Hãng</th>
                      <th className="py-3 px-3">Vị trí</th>
                      <th className="py-3 px-3 text-center">Còn lại</th>
                      <th className="py-3 px-3 text-center">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 text-sm text-slate-700 dark:text-slate-300">
                    {spools.map((spool) => {
                      const percent = spool.initialWeightG > 0
                        ? (spool.remainingWeightG / spool.initialWeightG) * 100
                        : 0;

                      // Xác định vị trí: kho hoặc máy in
                      let locationDisplay: React.ReactNode;
                      if (spool.printer) {
                        locationDisplay = (
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-violet-950 text-violet-300 border border-violet-800 font-semibold inline-flex items-center gap-1">
                            <PrinterIcon size={10} />
                            {spool.printer.name}
                          </span>
                        );
                      } else if (spool.location) {
                        locationDisplay = (
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-950 text-indigo-300 border border-indigo-850 font-semibold inline-flex items-center gap-1">
                            <Database size={10} />
                            {spool.location.name}
                          </span>
                        );
                      } else {
                        locationDisplay = (
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-200/50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400">
                            Chưa gán
                          </span>
                        );
                      }

                      return (
                        <tr key={spool.id} className="hover:bg-slate-100/50 dark:bg-slate-900/20 transition-colors">
                          <td className="py-3 px-3 font-mono font-bold text-slate-900 dark:text-slate-100 text-xs">{spool.id}</td>
                          <td className="py-3 px-3">
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-semibold uppercase">
                              {spool.filamentType}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-xs text-slate-500 dark:text-slate-400">{spool.filamentBrand || '—'}</td>
                          <td className="py-3 px-3 whitespace-nowrap">{locationDisplay}</td>
                          <td className="py-3 px-3">
                            <div className="flex flex-col items-center">
                              <span className="text-xs font-semibold text-slate-200">
                                {spool.remainingWeightG}g
                              </span>
                              <div className="w-16 h-1 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden mt-1">
                                <div
                                  className={`h-full transition-all ${
                                    percent > 50
                                      ? 'bg-emerald-500'
                                      : percent > 20
                                        ? 'bg-amber-500'
                                        : 'bg-red-500'
                                  }`}
                                  style={{ width: `${percent}%` }}
                                />
                              </div>
                              <span className="text-[9px] text-slate-500 mt-0.5">{percent.toFixed(0)}%</span>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                              spool.status === 'active'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : spool.status === 'depleted'
                                  ? 'bg-red-500/10 text-red-400 border-red-500/20'
                                  : 'bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-500/20'
                            }`}>
                              {spool.status === 'active' ? 'Đang dùng' : spool.status === 'depleted' ? 'Hết nhựa' : 'Lưu trữ'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
