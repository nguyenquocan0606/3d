'use client';

import React, { useState } from 'react';
import { CheckCircle2, AlertTriangle, RotateCcw, Info } from 'lucide-react';
import type { ScaleCalibration, ScaleStability } from '@/hooks/useScaleMqtt';

interface CalibrationPanelProps {
  rawWeight: number;
  weight: number;
  calibration: ScaleCalibration;
  stability: ScaleStability;
  onCaptureZero: () => void;
  onCalibrateSpan: (knownWeight: number) => { ok: boolean; message: string };
  onReset: () => void;
}

/**
 * Chế độ 3 — HIỆU CHUẨN CÂN (2 điểm).
 *  Bước 1 — bàn cân trống, lấy điểm 0.
 *  Bước 2 — đặt quả cân chuẩn, nhập khối lượng thật để tính hệ số.
 * Cả hai bước đều lấy trung bình nhiều mẫu và chờ số đứng yên để giảm sai số.
 */
export default function ScaleCalibrationPanel({
  rawWeight,
  weight,
  calibration,
  stability,
  onCaptureZero,
  onCalibrateSpan,
  onReset,
}: CalibrationPanelProps) {
  const [knownWeight, setKnownWeight] = useState('');
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);
  const [ignoreStability, setIgnoreStability] = useState(false);

  const canCapture = stability === 'stable' || (ignoreStability && stability !== 'stale');

  const handleZero = () => {
    onCaptureZero();
    setNotice({ ok: true, message: 'Đã lấy điểm 0. Giờ đặt quả cân chuẩn lên bàn cân để làm bước 2.' });
  };

  const handleSpan = () => {
    setNotice(onCalibrateSpan(parseFloat(knownWeight)));
  };

  const handleReset = () => {
    onReset();
    setKnownWeight('');
    setNotice({ ok: true, message: 'Đã xoá hiệu chuẩn, quay về số gốc của cân.' });
  };

  return (
    <div className="w-full rounded-2xl border border-slate-700 bg-[#1e293b] p-5 text-slate-200">
      <h3 className="mb-1 text-lg font-bold text-white">Hiệu chuẩn cân</h3>
      <p className="mb-5 text-sm text-slate-400">
        Làm lần lượt bước 1 rồi bước 2. Trong lúc lấy số, đừng chạm vào bàn cân.
      </p>

      {/* Số liệu hiện tại */}
      <div className="mb-5 grid grid-cols-3 gap-3 rounded-xl bg-slate-900/60 p-4 text-center">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Số thô</div>
          <div className="font-mono text-lg font-bold text-slate-300">{rawWeight.toFixed(1)}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Đang hiển thị</div>
          <div className="font-mono text-lg font-bold text-emerald-400">{weight.toFixed(1)} g</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Hệ số</div>
          <div className="font-mono text-lg font-bold text-indigo-400">{calibration.gain.toFixed(4)}</div>
        </div>
      </div>

      {!canCapture && (
        <div
          className={`mb-4 flex items-start gap-2 rounded-lg border p-3 text-sm ${
            stability === 'stale'
              ? 'border-red-800 bg-red-950/40 text-red-300'
              : 'border-amber-800 bg-amber-950/40 text-amber-300'
          }`}
        >
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div>
            {stability === 'stale' ? (
              <span>Không nhận được số từ cân. Kiểm tra kết nối trước khi hiệu chuẩn.</span>
            ) : (
              <>
                <span>Số đang dao động — chờ vài giây cho cân đứng yên.</span>
                <button
                  onClick={() => setIgnoreStability(true)}
                  className="ml-2 underline underline-offset-2 hover:text-amber-200"
                >
                  Vẫn lấy số
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="space-y-5">
        {/* Bước 1 */}
        <div className="rounded-xl border border-slate-700 p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
              1
            </span>
            <span className="font-semibold text-white">Lấy điểm 0 (bàn cân trống)</span>
          </div>
          <p className="mb-3 text-sm text-slate-400">
            Dọn sạch bàn cân, chờ số đứng yên rồi bấm nút. Điểm 0 hiện tại:{' '}
            <span className="font-mono text-slate-300">{calibration.zeroRaw.toFixed(1)}</span>
          </p>
          <button
            onClick={handleZero}
            disabled={!canCapture}
            className="w-full rounded-lg bg-indigo-600 py-2.5 font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
          >
            Lấy điểm 0
          </button>
        </div>

        {/* Bước 2 */}
        <div className="rounded-xl border border-slate-700 p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
              2
            </span>
            <span className="font-semibold text-white">Hiệu chuẩn bằng vật chuẩn</span>
          </div>
          <p className="mb-3 text-sm text-slate-400">
            Đặt vật đã biết chính xác khối lượng lên cân (nên chọn vật nặng gần bằng mức hay cân nhất, tối thiểu 500 g)
            rồi nhập số gram thật của nó.
          </p>
          <div className="flex gap-2">
            <input
              type="number"
              inputMode="decimal"
              value={knownWeight}
              onChange={(e) => setKnownWeight(e.target.value)}
              placeholder="Ví dụ: 1000"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-lg outline-none focus:border-indigo-500"
            />
            <button
              onClick={handleSpan}
              disabled={!canCapture || !knownWeight}
              className="whitespace-nowrap rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
            >
              Hiệu chuẩn
            </button>
          </div>
        </div>
      </div>

      {notice && (
        <div
          className={`mt-4 flex items-start gap-2 rounded-lg border p-3 text-sm ${
            notice.ok
              ? 'border-emerald-800 bg-emerald-950/40 text-emerald-300'
              : 'border-red-800 bg-red-950/40 text-red-300'
          }`}
        >
          {notice.ok ? (
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          ) : (
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          )}
          <span>{notice.message}</span>
        </div>
      )}

      <div className="mt-5 flex items-start gap-2 rounded-lg bg-slate-900/60 p-3 text-xs leading-relaxed text-slate-400">
        <Info size={14} className="mt-0.5 shrink-0 text-slate-500" />
        <div>
          <b className="text-slate-300">Để cân chuẩn nhất:</b> đặt cân trên mặt phẳng cứng, tránh gió và rung; cắm điện
          chờ 5–10 phút cho cảm biến ổn định nhiệt; đặt vật vào giữa bàn cân; hiệu chuẩn lại mỗi khi dời chỗ cân hoặc
          thấy số lệch. Sau khi hiệu chuẩn, thử cân lại đúng vật chuẩn để kiểm tra.
        </div>
      </div>

      <button
        onClick={handleReset}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
      >
        <RotateCcw size={14} />
        Xoá hiệu chuẩn, dùng số gốc của cân
      </button>
    </div>
  );
}
