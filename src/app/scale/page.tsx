'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useScale } from '@/components/scale-provider';
import ScaleCalibrationPanel from '@/components/Scale/calibration-panel';
import ScaleCountingPanel from '@/components/Scale/counting-panel';
import ScaleDisplay from '@/components/Scale/scale-display';
import WeighPanel from '@/components/Scale/weigh-panel';
import { Scale, Wifi, WifiOff, Settings2, Boxes, CircleDot, Activity, AlertTriangle, Weight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { formatGram, roundGram } from '@/config/scale';

const UNIT_KEY = 'scale_count_unit';
const SPOOL_KEY = 'scale_spool_weight';

/** 3 chức năng của trạm cân, mỗi chức năng một tab riêng */
type ScaleMode = 'weigh' | 'count' | 'calibrate';

const MODES: Array<{ key: ScaleMode; label: string; icon: LucideIcon }> = [
  { key: 'weigh', label: 'Cân thường', icon: Weight },
  { key: 'count', label: 'Đếm sản phẩm', icon: Boxes },
  { key: 'calibrate', label: 'Hiệu chuẩn', icon: Settings2 },
];

export default function ScaleStationPage() {
  const {
    steadyWeight,
    rawWeight,
    isConnected,
    stability,
    calibration,
    getStableWeight,
    captureZero,
    calibrateSpan,
    resetCalibration,
  } = useScale();

  const [mode, setMode] = useState<ScaleMode>('weigh');
  /** Khối lượng bì — chỉ sống trong phiên làm việc này, tải lại trang là mất (giống cân cơ) */
  const [tare, setTare] = useState(0);
  /** Khối lượng 1 sản phẩm dùng cho chế độ đếm */
  const [unitWeight, setUnitWeight] = useState<number | null>(null);
  /** Ô nhập khối lượng lõi cuộn rỗng, dùng để in ra khối lượng nhựa còn lại */
  const [spoolInput, setSpoolInput] = useState('');

  useEffect(() => {
    const savedUnit = parseFloat(localStorage.getItem(UNIT_KEY) || '');
    if (isFinite(savedUnit) && savedUnit > 0) setUnitWeight(savedUnit);
    const savedSpool = localStorage.getItem(SPOOL_KEY) || '';
    if (parseFloat(savedSpool) > 0) setSpoolInput(savedSpool);
  }, []);

  const applyUnitWeight = useCallback((unit: number) => {
    setUnitWeight(unit);
    localStorage.setItem(UNIT_KEY, unit.toString());
  }, []);

  const clearUnitWeight = useCallback(() => {
    setUnitWeight(null);
    localStorage.removeItem(UNIT_KEY);
  }, []);

  const applySpoolInput = useCallback((raw: string) => {
    setSpoolInput(raw);
    if (parseFloat(raw) > 0) localStorage.setItem(SPOOL_KEY, raw);
    else localStorage.removeItem(SPOOL_KEY);
  }, []);

  /** Số gram lõi cuộn đang dùng; 0 = chưa khai báo */
  const spoolWeight = parseFloat(spoolInput) > 0 ? parseFloat(spoolInput) : 0;

  // Số gram dùng cho mọi hiển thị và phép đếm: đã lọc nhiễu rồi làm tròn (mốc 0.5 thì lên)
  const net = roundGram(steadyWeight - tare);
  const hasUnit = unitWeight !== null && unitWeight > 0;
  const exactCount = hasUnit ? net / (unitWeight as number) : 0;
  // Làm tròn xuống: chỉ tính số sản phẩm đã đủ khối lượng, không đếm dư
  const count = Math.max(0, Math.floor(exactCount));
  // Lệch nhiều so với số nguyên gần nhất → khả năng mẫu chưa chuẩn hoặc có vật lạ trên cân
  const countUncertain = hasUnit && net > 0 && Math.abs(exactCount - Math.round(exactCount)) > 0.25;

  const stabilityLabel =
    stability === 'stable' ? 'Số đã ổn định' : stability === 'unstable' ? 'Đang dao động…' : 'Chưa có số từ cân';
  const stabilityClass =
    stability === 'stable'
      ? 'bg-emerald-950/40 border-emerald-800 text-emerald-400'
      : stability === 'unstable'
        ? 'bg-amber-950/40 border-amber-800 text-amber-400'
        : 'bg-slate-800/60 border-slate-700 text-slate-500';

  return (
    <div className="relative flex min-h-screen flex-col items-center bg-[#0f172a] p-6 pt-20 text-slate-200 sm:justify-center sm:pt-6">
      {/* Nút quay lại */}
      <Link
        href="/"
        className="absolute left-6 top-6 rounded-lg bg-slate-800 px-4 py-2 font-medium transition-colors hover:bg-slate-700"
      >
        &larr; Quay lại
      </Link>

      <div className="flex w-full max-w-2xl flex-col items-center">
        <div className="mb-6 flex items-center gap-3 text-indigo-400">
          <Scale size={44} />
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">TRẠM CÂN TỰ ĐỘNG</h1>
        </div>

        {/* Trạng thái kết nối + độ ổn định */}
        <div className="mb-5 flex flex-wrap items-center justify-center gap-2">
          <div
            className={`flex items-center gap-2 rounded-full border px-4 py-1.5 ${
              isConnected
                ? 'border-emerald-800 bg-emerald-950/40 text-emerald-400'
                : 'border-red-800 bg-red-950/40 text-red-400'
            }`}
          >
            {isConnected ? <Wifi size={16} className="animate-pulse" /> : <WifiOff size={16} />}
            <span className="font-medium">{isConnected ? 'Cân đang Online' : 'Mất kết nối với Cân!'}</span>
          </div>
          <div className={`flex items-center gap-2 rounded-full border px-4 py-1.5 ${stabilityClass}`}>
            {stability === 'stable' ? <CircleDot size={16} /> : <Activity size={16} />}
            <span className="font-medium">{stabilityLabel}</span>
          </div>
        </div>

        {/* Chọn chức năng */}
        <div className="mb-5 grid w-full grid-cols-3 gap-2 rounded-2xl border border-slate-700 bg-slate-900/60 p-2">
          {MODES.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setMode(key)}
              className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-semibold transition-colors ${
                mode === key
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <Icon size={18} />
              <span className="hidden sm:inline">{label}</span>
              <span className="sm:hidden">{label.split(' ')[0]}</span>
            </button>
          ))}
        </div>

        {/* ── Chế độ 1: cân bình thường ── */}
        {mode === 'weigh' && (
          <div className="flex w-full flex-col items-center gap-5">
            <ScaleDisplay title="Trọng lượng hiện tại" value={formatGram(net)} unit="g" isConnected={isConnected}>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
                {spoolWeight > 0 && (
                  <span className="rounded-full bg-indigo-500/15 px-3 py-1 font-mono text-indigo-300">
                    nhựa còn lại {roundGram(net - spoolWeight)} g · lõi {formatGram(spoolWeight)} g
                  </span>
                )}
                {tare !== 0 && (
                  <span className="rounded-full bg-amber-500/15 px-3 py-1 font-mono text-amber-400">
                    NET · bì {formatGram(tare)} g
                  </span>
                )}
                {calibration.gain !== 1 && (
                  <span className="font-mono text-slate-500">hệ số {calibration.gain.toFixed(4)}</span>
                )}
              </div>
            </ScaleDisplay>

            <WeighPanel
              net={net}
              tare={tare}
              spoolWeight={spoolWeight}
              spoolInput={spoolInput}
              onSpoolInputChange={applySpoolInput}
              onTare={() => setTare(getStableWeight())}
              onClearTare={() => setTare(0)}
              isConnected={isConnected}
              stability={stability}
            />
          </div>
        )}

        {/* ── Chế độ 2: đếm sản phẩm ── */}
        {mode === 'count' && (
          <div className="flex w-full flex-col items-center gap-5">
            <ScaleDisplay
              title="Số lượng sản phẩm"
              value={hasUnit ? count.toString() : '—'}
              unit="sp"
              isConnected={isConnected}
            >
              <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
                <span className="font-mono text-slate-400">{formatGram(net)} g</span>
                {hasUnit ? (
                  <span className="font-mono text-slate-500">1 sp = {(unitWeight as number).toFixed(2)} g</span>
                ) : (
                  <span className="text-slate-500">Chưa có mẫu — lấy mẫu ở bên dưới</span>
                )}
                {tare !== 0 && (
                  <span className="rounded-full bg-amber-500/15 px-3 py-1 font-mono text-amber-400">
                    NET · bì {formatGram(tare)} g
                  </span>
                )}
              </div>

              {countUncertain && (
                <div className="mt-3 flex items-center gap-1.5 text-sm text-amber-400">
                  <AlertTriangle size={14} />
                  Số lẻ ({exactCount.toFixed(2)} sp) — kiểm tra lại mẫu hoặc vật trên cân.
                </div>
              )}
            </ScaleDisplay>

            <ScaleCountingPanel
              netWeight={net}
              stability={stability}
              unitWeight={unitWeight}
              onApply={applyUnitWeight}
              onClear={clearUnitWeight}
            />
          </div>
        )}

        {/* ── Chế độ 3: hiệu chuẩn ── */}
        {mode === 'calibrate' && (
          <ScaleCalibrationPanel
            rawWeight={rawWeight}
            weight={steadyWeight}
            calibration={calibration}
            stability={stability}
            onCaptureZero={() => {
              captureZero();
              setTare(0);
            }}
            onCalibrateSpan={calibrateSpan}
            onReset={() => {
              resetCalibration();
              setTare(0);
            }}
          />
        )}

        <p className="mt-6 text-center text-sm text-slate-500">
          Bạn có thể đặt thiết bị chạy trang web này (như Tablet, Điện thoại) cố định tại khu vực Cân để theo dõi trực
          tiếp.
          <br />
          (Dữ liệu truyền qua MQTT - Realtime)
        </p>
      </div>
    </div>
  );
}
