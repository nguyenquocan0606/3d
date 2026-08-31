'use client';

import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, Trash2 } from 'lucide-react';
import type { ScaleStability } from '@/hooks/useScaleMqtt';
import { formatGram } from '@/config/scale';

interface CountingPanelProps {
  /** Khối lượng thực đang có trên cân (đã trừ bì), gram */
  netWeight: number;
  stability: ScaleStability;
  unitWeight: number | null;
  onApply: (unitWeight: number) => void;
  onClear: () => void;
}

/** Mẫu nhẹ hơn mức này thì đếm dễ sai vì nhiễu của cân */
const MIN_SAMPLE_G = 20;

/**
 * Chế độ 2 — ĐẾM SẢN PHẨM.
 * Đặt một số sản phẩm mẫu lên cân, nhập đúng số lượng, hệ thống tính khối lượng
 * 1 sản phẩm rồi từ đó suy ra số lượng cho các lần cân sau.
 */
export default function ScaleCountingPanel({
  netWeight,
  stability,
  unitWeight,
  onApply,
  onClear,
}: CountingPanelProps) {
  const [sampleCount, setSampleCount] = useState('10');
  const [manualUnit, setManualUnit] = useState(unitWeight ? unitWeight.toFixed(2) : '');
  const [error, setError] = useState('');

  const count = parseInt(sampleCount, 10);
  const previewUnit = count > 0 ? netWeight / count : 0;
  const sampleTooLight = netWeight > 0 && netWeight < MIN_SAMPLE_G;

  const handleSample = () => {
    if (!(count > 0)) {
      setError('Nhập số sản phẩm đang đặt trên cân (số nguyên lớn hơn 0).');
      return;
    }
    if (netWeight <= 0) {
      setError('Cân đang trống. Hãy đặt sản phẩm mẫu lên cân (nhớ trừ bì khay đựng trước).');
      return;
    }
    if (stability === 'stale') {
      setError('Không nhận được số từ cân.');
      return;
    }
    setError('');
    const unit = netWeight / count;
    setManualUnit(unit.toFixed(2));
    onApply(unit);
  };

  const handleManual = () => {
    const unit = parseFloat(manualUnit);
    if (!isFinite(unit) || unit <= 0) {
      setError('Khối lượng 1 sản phẩm phải lớn hơn 0.');
      return;
    }
    setError('');
    onApply(unit);
  };

  return (
    <div className="w-full rounded-2xl border border-slate-700 bg-[#1e293b] p-5 text-slate-200">
      <h3 className="mb-1 text-lg font-bold text-white">Lấy mẫu để đếm</h3>
      <p className="mb-5 text-sm text-slate-400">
        Đặt một ít sản phẩm mẫu lên cân và nhập đúng số lượng. Cân sẽ tự tính khối lượng 1 sản phẩm và từ đó đếm số
        lượng cho những lần cân sau.
      </p>

      <div className="mb-5 grid grid-cols-2 gap-3 rounded-xl bg-slate-900/60 p-4 text-center">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Đang trên cân</div>
          <div className="font-mono text-xl font-bold text-emerald-400">{formatGram(netWeight)} g</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">1 sản phẩm hiện tại</div>
          <div className="font-mono text-xl font-bold text-indigo-400">
            {unitWeight ? `${unitWeight.toFixed(2)} g` : '—'}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700 p-4">
        <label className="mb-1 block text-sm font-semibold text-white">Số sản phẩm đang đặt trên cân</label>
        <p className="mb-3 text-xs text-slate-400">
          Càng nhiều mẫu càng chính xác — nên dùng ít nhất 10 sản phẩm hoặc tổng khối lượng mẫu từ {MIN_SAMPLE_G} g trở
          lên.
        </p>
        <div className="flex gap-2">
          <input
            type="number"
            inputMode="numeric"
            value={sampleCount}
            onChange={(e) => setSampleCount(e.target.value)}
            placeholder="Ví dụ: 10"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-lg outline-none focus:border-indigo-500"
          />
          <button
            onClick={handleSample}
            className="whitespace-nowrap rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-emerald-500"
          >
            Lấy mẫu
          </button>
        </div>
        {count > 0 && netWeight > 0 && (
          <p className="mt-2 text-sm text-slate-400">
            1 sản phẩm ≈ <span className="font-mono font-bold text-slate-200">{previewUnit.toFixed(2)} g</span>
          </p>
        )}
        {sampleTooLight && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-400">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            Mẫu quá nhẹ ({formatGram(netWeight)} g), số đếm dễ sai. Nên đặt thêm sản phẩm rồi lấy mẫu lại.
          </p>
        )}
        {stability === 'unstable' && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-400">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            Số đang dao động, chờ cân đứng yên rồi hãy lấy mẫu.
          </p>
        )}
      </div>

      <div className="relative flex items-center py-4">
        <div className="grow border-t border-slate-700" />
        <span className="shrink-0 px-3 text-xs text-slate-500">hoặc</span>
        <div className="grow border-t border-slate-700" />
      </div>

      <div className="rounded-xl border border-slate-700 p-4">
        <label className="mb-1 block text-sm font-semibold text-white">Nhập thẳng khối lượng 1 sản phẩm (g)</label>
        <div className="mt-2 flex gap-2">
          <input
            type="number"
            inputMode="decimal"
            value={manualUnit}
            onChange={(e) => setManualUnit(e.target.value)}
            placeholder="Ví dụ: 12.5"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-lg outline-none focus:border-indigo-500"
          />
          <button
            onClick={handleManual}
            className="whitespace-nowrap rounded-lg bg-slate-700 px-4 py-2 font-semibold text-white transition-colors hover:bg-slate-600"
          >
            Dùng số này
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="mt-5 flex items-start gap-2 rounded-lg bg-slate-900/60 p-3 text-xs leading-relaxed text-slate-400">
        <Info size={14} className="mt-0.5 shrink-0 text-slate-500" />
        <div>
          Nếu dùng khay/hộp đựng: đặt khay trống lên cân, sang tab{' '}
          <b className="text-slate-300">Cân thường</b> bấm <b className="text-slate-300">TRỪ BÌ</b> cho về 0, rồi mới đổ
          sản phẩm vào và lấy mẫu.
        </div>
      </div>

      {unitWeight ? (
        <button
          onClick={onClear}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
        >
          <Trash2 size={14} />
          Xoá mẫu đang dùng
        </button>
      ) : (
        <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-slate-500">
          <CheckCircle2 size={13} />
          Sau khi lấy mẫu, màn hình sẽ hiện số sản phẩm thay cho số gram.
        </p>
      )}
    </div>
  );
}
