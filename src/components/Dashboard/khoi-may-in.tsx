'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Printer, Wifi, WifiOff, AlertCircle } from 'lucide-react';

// Khối máy in: dùng /api/printers/cloud/status (§5.4)
// Poll riêng 15s — Home Assistant lag không được kéo sập cả dashboard

interface TrangThaiMay {
  status: string;
  nozzleTemp: number;
  nozzleTargetTemp: number;
  bedTemp: number;
  bedTargetTemp: number;
  progress: number;
  remainingTimeSeconds: number;
  materials: string[];
  currentFile?: string;
  tenMay?: string;
}

interface KhoiMayInProps {
  setActiveTab: (tab: string) => void;
}

const MAU_TRANG_THAI: Record<string, string> = {
  printing: 'text-emerald-400',
  idle: 'text-slate-400',
  offline: 'text-slate-600',
  error: 'text-red-400',
  paused: 'text-amber-400',
  ready: 'text-emerald-400',
};

const NHAN_TRANG_THAI: Record<string, string> = {
  printing: 'Đang in',
  idle: 'Rảnh',
  offline: 'Offline',
  error: 'Lỗi',
  paused: 'Tạm dừng',
  ready: 'Sẵn sàng',
};

const POLL_MS = 15_000; // 15 giây

export default function KhoiMayIn({ setActiveTab }: KhoiMayInProps) {
  const [data, setData] = useState<Record<string, TrangThaiMay> | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Lưu timestamp gần nhất làm mới — để tính "Xs trước" mà không gọi Date.now() trong render
  const [giayTuLuc, setGiayTuLuc] = useState<number | null>(null);
  const luLamMoiRef = useRef<number | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dongHoRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const thucHienFetch = useCallback(async () => {
    // Dừng khi tab ẩn
    if (document.hidden) return;
    try {
      const res = await fetch('/api/printers/cloud/status');
      const json = await res.json();
      if (json.status === 'success') {
        setData(json.data as Record<string, TrangThaiMay>);
        setError(null);
      } else {
        setError((json.message as string) ?? 'Không lấy được trạng thái máy in');
      }
    } catch {
      setError('Lỗi kết nối cloud máy in');
    }
    luLamMoiRef.current = Date.now();
    setGiayTuLuc(0);
  }, []);

  const dungInterval = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  const khoiDong = useCallback(() => {
    dungInterval();
    intervalRef.current = setInterval(() => void thucHienFetch(), POLL_MS);
  }, [dungInterval, thucHienFetch]);

  useEffect(() => {
    // queueMicrotask: tránh setState đồng bộ trong thân effect (quy ước repo)
    queueMicrotask(() => void thucHienFetch());
    khoiDong();

    // Đồng hồ 1 giây để cập nhật "Xs trước"
    dongHoRef.current = setInterval(() => {
      if (luLamMoiRef.current !== null) {
        setGiayTuLuc(Math.round((Date.now() - luLamMoiRef.current) / 1000));
      }
    }, 1000);

    const handleVisibility = () => {
      if (document.hidden) {
        dungInterval();
      } else {
        queueMicrotask(() => void thucHienFetch());
        khoiDong();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      dungInterval();
      if (dongHoRef.current) clearInterval(dongHoRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [thucHienFetch, khoiDong, dungInterval]);

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-950/10 p-3 text-sm text-red-400">
        <AlertCircle size={14} />
        <span>{error}</span>
        <span className="ml-auto cursor-help text-xs text-slate-600" title="Cloud máy in có thể chậm hoặc timeout">
          ⓘ
        </span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 animate-pulse">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-slate-800" />
        ))}
      </div>
    );
  }

  const mayList = Object.entries(data);
  if (!mayList.length) {
    return (
      <div className="rounded-2xl border border-slate-800/40 bg-[#111827]/50 p-4 text-sm text-slate-600">
        Chưa có máy in nào liên kết cloud
      </div>
    );
  }

  const dangIn = mayList.filter(([, v]) => v.status === 'printing').length;
  const loi = mayList.filter(([, v]) => v.status === 'error').length;

  return (
    <div className="space-y-3">
      {/* Tóm tắt */}
      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <Printer size={12} className="text-emerald-400" />
          {dangIn} đang in
        </span>
        {loi > 0 && (
          <span className="flex items-center gap-1 text-red-400">
            <AlertCircle size={12} />
            {loi} lỗi
          </span>
        )}
        {giayTuLuc !== null && (
          <span className="ml-auto">
            {giayTuLuc}s trước
          </span>
        )}
      </div>

      {/* Lưới máy in */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {mayList.map(([id, may]) => {
          const mauTT = MAU_TRANG_THAI[may.status] ?? 'text-slate-400';
          const isLoi = may.status === 'error';
          const isIn = may.status === 'printing';

          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab('printers')}
              className={`flex flex-col gap-2 rounded-2xl border p-3 text-left transition-colors hover:border-indigo-500/30 ${
                isLoi
                  ? 'border-red-500/30 bg-red-950/10'
                  : 'border-slate-800/60 bg-[#111827]'
              }`}
            >
              <div className="flex items-start justify-between">
                <p className="max-w-[80%] truncate text-xs font-semibold text-white">
                  {may.tenMay ?? id}
                </p>
                {may.status === 'offline' ? (
                  <WifiOff size={13} className="shrink-0 text-slate-600" />
                ) : (
                  <Wifi size={13} className={`${mauTT} shrink-0`} />
                )}
              </div>

              <p className={`text-xs font-bold ${mauTT}`}>
                {NHAN_TRANG_THAI[may.status] ?? may.status}
              </p>

              {/* Tiến độ khi đang in */}
              {isIn && (
                <div className="space-y-1">
                  <div className="h-1 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${Math.min(may.progress * 100, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>{Math.round(may.progress * 100)}%</span>
                    {may.remainingTimeSeconds > 0 && (
                      <span>{formatGiay(may.remainingTimeSeconds)} còn lại</span>
                    )}
                  </div>
                </div>
              )}

              {/* Nhiệt độ */}
              {(may.nozzleTemp > 0 || may.bedTemp > 0) && (
                <div className="flex gap-2 text-xs text-slate-500">
                  {may.nozzleTemp > 0 && (
                    <span>Vòi {Math.round(may.nozzleTemp)}°</span>
                  )}
                  {may.bedTemp > 0 && (
                    <span>Bàn {Math.round(may.bedTemp)}°</span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function formatGiay(s: number): string {
  if (s < 3600) return `${Math.round(s / 60)}p`;
  const h = Math.floor(s / 3600);
  const p = Math.round((s % 3600) / 60);
  return p > 0 ? `${h}h${p}p` : `${h}h`;
}
