'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, Printer } from 'lucide-react';
import type { ScaleStability } from '@/hooks/useScaleMqtt';
import { formatGram, roundGram } from '@/config/scale';
import { LABEL_W, LABEL_H, canvasToMonoBitmap, drawFittedText, uint8ToBase64 } from '@/utils/label-bitmap';

interface WeighPanelProps {
  /** Khối lượng đang có trên cân, đã trừ bì (gram, đã lọc nhiễu) */
  net: number;
  /** Khối lượng bì đang trừ */
  tare: number;
  /** Khối lượng lõi cuộn rỗng (gram); 0 = không trừ lõi */
  spoolWeight: number;
  /** Nội dung thô của ô nhập lõi cuộn (trang cha giữ để còn lưu lại) */
  spoolInput: string;
  onSpoolInputChange: (raw: string) => void;
  onTare: () => void;
  onClearTare: () => void;
  isConnected: boolean;
  stability: ScaleStability;
}

/**
 * Vẽ tem 40×30mm: dòng tiêu đề, số gram thật to, dòng chi tiết + thời điểm cân.
 */
function drawWeightLabel(canvas: HTMLCanvasElement, grams: number, caption: string, detail: string) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Trình duyệt không tạo được canvas context');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, LABEL_W, LABEL_H);
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'alphabetic';

  drawFittedText(ctx, caption, LABEL_W / 2, 40, LABEL_W - 24, 30);
  ctx.fillRect(20, 54, LABEL_W - 40, 3);

  drawFittedText(ctx, `${grams} g`, LABEL_W / 2, 168, LABEL_W - 24, 108);

  if (detail) drawFittedText(ctx, detail, LABEL_W / 2, 200, LABEL_W - 24, 22, 'normal');

  const now = new Date();
  const stamp = `${now.toLocaleDateString('vi-VN')} ${now.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
  drawFittedText(ctx, stamp, LABEL_W / 2, detail ? 228 : 214, LABEL_W - 24, 20, 'normal');
}

/**
 * Chế độ 1 — CÂN BÌNH THƯỜNG.
 * Trừ bì, khai báo khối lượng lõi cuộn và in số gram ra tem nhãn.
 */
export default function WeighPanel({
  net,
  tare,
  spoolWeight,
  spoolInput,
  onSpoolInputChange,
  onTare,
  onClearTare,
  isConnected,
  stability,
}: WeighPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);

  const hasSpool = spoolWeight > 0;
  // Có khai báo lõi cuộn → in ra khối lượng nhựa còn lại, không có thì in khối lượng trên cân
  const printedGrams = roundGram(hasSpool ? net - spoolWeight : net);
  const caption = hasSpool ? 'NHỰA CÒN LẠI' : 'KHỐI LƯỢNG';
  const detail = hasSpool ? `Cả cuộn ${formatGram(net)} g − lõi ${formatGram(spoolWeight)} g` : '';

  // Xem trước tem: vẽ lại mỗi khi số thay đổi, in ra đúng bằng hình đang thấy
  useEffect(() => {
    if (canvasRef.current) drawWeightLabel(canvasRef.current, printedGrams, caption, detail);
  }, [printedGrams, caption, detail]);

  const handlePrint = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (printedGrams <= 0) {
      setNotice({
        ok: false,
        message: hasSpool
          ? 'Khối lượng nhựa còn lại đang ≤ 0 g — kiểm tra lại khối lượng lõi cuộn hoặc vật trên cân.'
          : 'Cân đang trống, chưa có gì để in.',
      });
      return;
    }

    setIsPrinting(true);
    setNotice(null);
    try {
      // Vẽ lại ngay trước khi in để dấu thời gian trên tem là lúc bấm in
      drawWeightLabel(canvas, printedGrams, caption, detail);

      const res = await fetch('/api/print-jobs/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bitmapBase64: uint8ToBase64(canvasToMonoBitmap(canvas)),
          copies: 1,
          label: `${caption} ${printedGrams}g`,
        }),
      });
      const data = await res.json();
      setNotice(
        data.status === 'success'
          ? { ok: true, message: data.message || `Đã in tem ${printedGrams} g.` }
          : { ok: false, message: data.message || 'Máy in tem báo lỗi.' },
      );
    } catch {
      setNotice({ ok: false, message: 'Không gọi được máy chủ in tem.' });
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <div className="w-full space-y-4">
      {/* Trừ bì */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <button
          onClick={onTare}
          disabled={!isConnected}
          className="col-span-2 rounded-xl bg-amber-600 py-4 text-lg font-bold text-white transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-600"
        >
          TRỪ BÌ (TARE)
        </button>
        <button
          onClick={onClearTare}
          disabled={tare === 0}
          className="rounded-xl border border-slate-700 bg-slate-800/60 py-4 font-semibold text-slate-300 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:text-slate-600 disabled:hover:bg-slate-800/60"
        >
          Xoá bì
        </button>
      </div>

      {/* Khối lượng lõi cuộn + in tem */}
      <div className="rounded-2xl border border-slate-700 bg-[#1e293b] p-5">
        <label className="mb-1 block text-sm font-semibold text-white">Khối lượng lõi cuộn rỗng (g)</label>
        <p className="mb-3 text-xs text-slate-400">
          Nhập số gram của lõi cuộn khi hết nhựa (thường in trên cuộn: 120–250 g). Khi in tem, hệ thống lấy khối lượng
          trên cân trừ đi số này để ra <b className="text-slate-300">khối lượng nhựa còn lại</b>. Để trống thì tem in
          đúng số trên cân.
        </p>
        <div className="flex gap-2">
          <input
            type="number"
            inputMode="decimal"
            value={spoolInput}
            onChange={(e) => onSpoolInputChange(e.target.value)}
            placeholder="Ví dụ: 220"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-lg outline-none focus:border-indigo-500"
          />
          <button
            onClick={() => onSpoolInputChange('')}
            disabled={!hasSpool}
            className="whitespace-nowrap rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200 disabled:cursor-not-allowed disabled:text-slate-600"
          >
            Bỏ trừ lõi
          </button>
        </div>

        <div className="mt-4 flex flex-col items-center gap-4 rounded-xl bg-slate-900/60 p-4 sm:flex-row sm:justify-center">
          <div className="text-center">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              {hasSpool ? 'Sẽ in ra tem — nhựa còn lại' : 'Sẽ in ra tem — khối lượng trên cân'}
            </div>
            <div className="font-mono text-3xl font-bold text-indigo-400">{printedGrams} g</div>
          </div>
          {/* Xem trước tem 40×30mm — đúng bằng bản in */}
          <canvas
            ref={canvasRef}
            width={LABEL_W}
            height={LABEL_H}
            className="h-[120px] w-[160px] rounded-md border border-slate-600 bg-white"
          />
        </div>

        <button
          onClick={handlePrint}
          disabled={!isConnected || isPrinting}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-4 text-lg font-bold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-600"
        >
          <Printer size={20} />
          {isPrinting ? 'ĐANG IN…' : 'IN SỐ GRAM RA TEM'}
        </button>

        {stability === 'unstable' && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-400">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            Số đang dao động — chờ cân đứng yên rồi hãy in để tem đúng số.
          </p>
        )}

        {notice && (
          <div
            className={`mt-3 flex items-start gap-2 rounded-lg border p-3 text-sm ${
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

        <div className="mt-4 flex items-start gap-2 rounded-lg bg-slate-900/60 p-3 text-xs leading-relaxed text-slate-400">
          <Info size={14} className="mt-0.5 shrink-0 text-slate-500" />
          <div>
            Cân cả cuộn (nhựa + lõi) đặt thẳng lên bàn cân, không cần trừ bì. Nếu đặt trên khay thì để khay trống lên
            trước rồi bấm <b className="text-slate-300">TRỪ BÌ</b>.
          </div>
        </div>
      </div>
    </div>
  );
}
