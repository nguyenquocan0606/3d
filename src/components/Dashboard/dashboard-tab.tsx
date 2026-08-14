'use client';

import React from 'react';
import { Database, CheckCircle2, SlidersHorizontal, Circle, Scale, ShoppingBag } from 'lucide-react';
import { DashboardStats } from '@/types/filament.types';

interface DashboardTabProps {
  stats: DashboardStats | null;
}

export default function DashboardTab({ stats }: DashboardTabProps) {
  if (!stats) return null;

  return (
    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-300">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {/* Stat Card 1 */}
        <div className="bg-white dark:bg-[#111827] border border-slate-800/80 rounded-2xl p-5 relative overflow-hidden flex flex-col justify-between h-28 md:h-32">
          <div className="flex justify-between items-start">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Tổng số cuộn</span>
            <span className="p-1.5 bg-indigo-500/10 text-indigo-400 rounded-lg"><Database size={16} /></span>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">{stats.totalSpools}</p>
            <p className="text-xs text-slate-500 mt-1">Cuộn nhựa trong kho</p>
          </div>
        </div>

        {/* Stat Card 2 */}
        <div className="bg-white dark:bg-[#111827] border border-slate-800/80 rounded-2xl p-5 relative overflow-hidden flex flex-col justify-between h-28 md:h-32">
          <div className="flex justify-between items-start">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Đang sử dụng</span>
            <span className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg"><CheckCircle2 size={16} /></span>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-bold text-emerald-400">{stats.activeSpools}</p>
            <p className="text-xs text-slate-500 mt-1 font-mono">Sẵn sàng in</p>
          </div>
        </div>

        {/* Stat Card 3 */}
        <div className="bg-white dark:bg-[#111827] border border-slate-800/80 rounded-2xl p-5 relative overflow-hidden flex flex-col justify-between h-28 md:h-32 border-amber-900/30">
          <div className="flex justify-between items-start">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Sắp hết (&lt;20%)</span>
            <span className="p-1.5 bg-amber-500/10 text-amber-400 rounded-lg"><SlidersHorizontal size={16} /></span>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-bold text-amber-400">{stats.lowSpools}</p>
            <p className="text-xs text-slate-500 mt-1">Cần chuẩn bị cuộn mới</p>
          </div>
        </div>

        {/* Stat Card 4 */}
        <div className="bg-white dark:bg-[#111827] border border-slate-800/80 rounded-2xl p-5 relative overflow-hidden flex flex-col justify-between h-28 md:h-32">
          <div className="flex justify-between items-start">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Đã dùng hết</span>
            <span className="p-1.5 bg-red-500/10 text-red-400 rounded-lg"><Circle size={14} className="fill-red-500/20" /></span>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-bold text-red-400">{stats.depletedSpools}</p>
            <p className="text-xs text-slate-500 mt-1">Cần bổ sung/tái chế</p>
          </div>
        </div>

        {/* Stat Card 5 */}
        <div className="bg-white dark:bg-[#111827] border border-slate-800/80 rounded-2xl p-5 relative overflow-hidden flex flex-col justify-between h-28 md:h-32">
          <div className="flex justify-between items-start">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Lượng nhựa còn lại</span>
            <span className="p-1.5 bg-cyan-500/10 text-cyan-400 rounded-lg"><Scale size={16} /></span>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-bold text-cyan-400">
              {(stats.totalRemainingWeightG / 1000).toFixed(2)} <span className="text-sm font-normal text-slate-500 dark:text-slate-400 font-sans">kg</span>
            </p>
            <p className="text-xs text-slate-500 mt-1">Tổng cộng thực tế</p>
          </div>
        </div>
      </div>

      <div className="bg-slate-900/30 border border-slate-200 dark:border-slate-800/60 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="p-2 bg-slate-200 dark:bg-slate-800 rounded-lg text-slate-500 dark:text-slate-400"><ShoppingBag size={18} /></span>
          <div>
            <h4 className="text-sm font-medium text-slate-200">Kế hoạch nâng cấp tiếp theo</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">Quản lý kho tập trung, kết nối và đồng bộ đơn hàng tự động từ Shopee & TikTok Shop.</p>
          </div>
        </div>
        <span className="self-start sm:self-auto text-[10px] font-semibold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1 rounded-full uppercase tracking-wider shrink-0">
          Coming Soon
        </span>
      </div>
    </div>
  );
}
