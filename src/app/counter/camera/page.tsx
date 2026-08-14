'use client';

import React from 'react';
import Link from 'next/link';
import { Camera, CameraOff, Clock, Crop, Hand, Plus, RotateCcw, Undo2, Volume2, VolumeX } from 'lucide-react';
import { CountEvent, CROP_H, CROP_W, DEFAULT_QUAD, Point, useMotionCounter } from '@/hooks/useMotionCounter';

const SETTINGS_KEY = 'camera-counter-settings-v2';
const CORNER_LABELS = ['Trên trái', 'Trên phải', 'Dưới phải', 'Dưới trái'];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export default function CameraCounterPage() {
  const [pixelThreshold, setPixelThreshold] = React.useState(25);
  const [triggerPercent, setTriggerPercent] = React.useState(8);
  const [cooldownMs, setCooldownMs] = React.useState(600);
  const [sound, setSound] = React.useState(true);
  const [quad, setQuad] = React.useState<Point[]>(DEFAULT_QUAD);

  const {
    videoRef, cropCanvasRef, isRunning, error, count, events, sessionStartedAt, motion, flash,
    devices, deviceId, start, stop, addManual, undo, reset,
  } = useMotionCounter({ pixelThreshold, triggerPercent, cooldownMs, quad, sound });

  // Lịch sử giờ sống qua cả reload nên hỏi lại trước khi xoá
  const confirmReset = React.useCallback(() => {
    if (count === 0 || window.confirm(`Xoá phiên hiện tại (${count} sản phẩm) và bắt đầu đếm lại từ 0?`)) reset();
  }, [count, reset]);

  // Nạp / lưu cấu hình. Phải đọc localStorage sau khi mount, đọc lúc render sẽ lệch với HTML dựng từ server.
  /* eslint-disable react-hooks/set-state-in-effect */
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (typeof s.pixelThreshold === 'number') setPixelThreshold(s.pixelThreshold);
      if (typeof s.triggerPercent === 'number') setTriggerPercent(s.triggerPercent);
      if (typeof s.cooldownMs === 'number') setCooldownMs(s.cooldownMs);
      if (typeof s.sound === 'boolean') setSound(s.sound);
      if (Array.isArray(s.quad) && s.quad.length === 4 && s.quad.every((p: Point) => typeof p?.x === 'number' && typeof p?.y === 'number')) {
        setQuad(s.quad);
      }
    } catch {
      // Bỏ qua cấu hình hỏng
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  React.useEffect(() => {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ pixelThreshold, triggerPercent, cooldownMs, sound, quad }),
    );
  }, [pixelThreshold, triggerPercent, cooldownMs, sound, quad]);

  // Kéo 4 điểm góc
  const boxRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef<number | null>(null);

  const moveCorner = React.useCallback((index: number, clientX: number, clientY: number) => {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const x = clamp01((clientX - rect.left) / rect.width);
    const y = clamp01((clientY - rect.top) / rect.height);
    setQuad((prev) => prev.map((p, i) => (i === index ? { x, y } : p)));
  }, []);

  const overTrigger = motion >= triggerPercent;
  const polygon = quad.map((p) => `${p.x * 100},${p.y * 100}`).join(' ');

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200 p-6">
      <div className="max-w-[1900px] mx-auto">
        {/* Thanh trên cùng: điều hướng + đồng hồ */}
        <header className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/" className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg font-medium transition-colors">
              &larr; Trang chủ
            </Link>
            <Link href="/counter" className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg font-medium transition-colors">
              Bộ đếm thường
            </Link>
          </div>
          <LiveClock />
        </header>

        <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)_320px] xl:items-start">
          {/* Cột trái: số đếm + vùng cắt + lịch sử */}
          <div className="order-2 xl:order-1 flex flex-col gap-4 overflow-hidden xl:sticky xl:top-6 xl:h-[calc(100vh-8.5rem)]">
            {/* Số đếm + mức chuyển động */}
            <div className="bg-[#1e293b] rounded-3xl p-5 border border-slate-700 flex flex-col items-center shrink-0">
              <span className="text-slate-400 text-xs uppercase tracking-widest">Đã đếm</span>
              <span
                className={`text-6xl font-mono font-bold tabular-nums transition-all duration-150 ${
                  flash ? 'text-emerald-300 scale-110' : 'text-indigo-300'
                }`}
              >
                {count}
              </span>

              <div className="w-full mt-4">
                <div className="flex justify-between text-[11px] uppercase tracking-widest text-slate-400 mb-1.5">
                  <span>Mức chuyển động</span>
                  <span className="font-mono">{motion.toFixed(1)}%</span>
                </div>
                <div className="relative h-3 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full transition-[width] duration-100 ${overTrigger ? 'bg-emerald-400' : 'bg-indigo-500'}`}
                    style={{ width: `${Math.min(100, motion)}%` }}
                  />
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-amber-400"
                    style={{ left: `${Math.min(100, triggerPercent)}%` }}
                    title="Ngưỡng đếm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 w-full mt-4">
                <button
                  type="button"
                  onClick={undo}
                  className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-slate-800 hover:bg-red-600 border border-slate-700 text-white text-[11px] transition-colors"
                >
                  <Undo2 size={18} /> Bỏ lần cuối
                </button>
                <button
                  type="button"
                  onClick={confirmReset}
                  className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[11px] transition-colors"
                >
                  <RotateCcw size={18} /> Phiên mới
                </button>
                <button
                  type="button"
                  onClick={addManual}
                  className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 border border-indigo-500 text-white text-[11px] transition-colors"
                >
                  <Plus size={18} /> Cộng tay
                </button>
              </div>
            </div>

            {/* Ảnh crop */}
            <div className="shrink-0">
              <span className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-slate-400 mb-2">
                <Crop size={14} /> Vùng đã cắt
                <span className="normal-case tracking-normal text-slate-500">— ảnh dùng để đếm</span>
              </span>
              <canvas
                ref={cropCanvasRef}
                width={CROP_W}
                height={CROP_H}
                className={`w-full rounded-xl border bg-black ${overTrigger ? 'border-emerald-400' : 'border-slate-700'}`}
              />
            </div>

            <div className="flex-1 min-h-0">
              <HistoryTable events={events} count={count} sessionStartedAt={sessionStartedAt} />
            </div>
          </div>

          {/* Cột giữa: camera */}
          <div className="order-1 xl:order-2">
            <div
              ref={boxRef}
              className="relative aspect-video rounded-3xl overflow-hidden border border-slate-700 bg-black select-none touch-none"
            >
              {/* object-fill: ép hình phủ kín khung để toạ độ 4 điểm khớp đúng pixel ảnh gốc */}
              <video ref={videoRef} playsInline muted className="w-full h-full object-fill" />

              {/* Khung vùng đếm */}
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="absolute inset-0 w-full h-full pointer-events-none"
              >
                <polygon
                  points={polygon}
                  vectorEffect="non-scaling-stroke"
                  className={overTrigger ? 'fill-emerald-400/25 stroke-emerald-400' : 'fill-indigo-400/10 stroke-indigo-400'}
                  strokeWidth={2}
                />
              </svg>

              {/* 4 điểm kéo tự do */}
              {quad.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Góc ${CORNER_LABELS[i]}`}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    dragRef.current = i;
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                  onPointerMove={(e) => {
                    if (dragRef.current !== i) return;
                    moveCorner(i, e.clientX, e.clientY);
                  }}
                  onPointerUp={() => {
                    dragRef.current = null;
                  }}
                  onPointerCancel={() => {
                    dragRef.current = null;
                  }}
                  className="absolute w-8 h-8 -ml-4 -mt-4 rounded-full border-2 border-white bg-indigo-500/90 shadow-lg cursor-grab active:cursor-grabbing active:scale-125 transition-transform flex items-center justify-center text-[10px] font-bold text-white"
                  style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
                >
                  {i + 1}
                </button>
              ))}

              {flash && <div className="absolute inset-0 bg-emerald-400/30 pointer-events-none" />}

              {!isRunning && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-900/85 text-center p-6">
                  <CameraOff size={48} className="text-slate-500" />
                  <p className="text-slate-400 max-w-sm">
                    {error ?? 'Bật camera, sau đó kéo 4 chấm tròn để khoanh đúng vùng sản phẩm rơi qua.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => void start(deviceId)}
                    className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center gap-2"
                  >
                    <Camera size={20} /> Bật camera
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Cột phải: cấu hình */}
          <div className="order-3 bg-[#1e293b] rounded-3xl p-6 border border-slate-700 flex flex-col gap-6 h-fit">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => (isRunning ? stop() : void start(deviceId))}
                className={`flex-1 h-12 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors ${
                  isRunning ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                }`}
              >
                {isRunning ? <CameraOff size={18} /> : <Camera size={18} />}
                {isRunning ? 'Tắt camera' : 'Bật camera'}
              </button>
              <button
                type="button"
                onClick={() => setSound((s) => !s)}
                aria-label={sound ? 'Tắt tiếng bíp' : 'Bật tiếng bíp'}
                className="w-12 h-12 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center"
              >
                {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
              </button>
            </div>

            {devices.length > 1 && (
              <label className="block">
                <span className="text-xs uppercase tracking-widest text-slate-400">Camera</span>
                <select
                  value={deviceId ?? ''}
                  onChange={(e) => void start(e.target.value)}
                  className="mt-2 w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm text-white"
                >
                  {devices.map((d, i) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Camera ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="rounded-xl bg-slate-800/60 border border-slate-700 p-3">
              <p className="text-xs text-slate-400 flex items-center gap-1.5">
                <Hand size={14} /> Kéo 4 chấm tròn trên hình để khoanh vùng đếm.
              </p>
              <button
                type="button"
                onClick={() => setQuad(DEFAULT_QUAD)}
                className="mt-3 w-full h-9 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm text-slate-200 transition-colors"
              >
                Đặt lại vùng đếm
              </button>
            </div>

            <Slider
              label="Ngưỡng đếm"
              hint="% pixel thay đổi để tính 1 lần thả. Thấp = nhạy hơn nhưng dễ đếm nhầm."
              value={triggerPercent} min={1} max={40} step={1} suffix="%" onChange={setTriggerPercent}
            />
            <Slider
              label="Lọc nhiễu"
              hint="Bỏ qua thay đổi sáng nhỏ hơn mức này. Tăng lên nếu đèn nhấp nháy làm đếm nhầm."
              value={pixelThreshold} min={5} max={80} step={1} onChange={setPixelThreshold}
            />
            <Slider
              label="Khoá sau mỗi lần đếm"
              hint="Chống 1 vật bị đếm 2 lần. Thả nhanh liên tục thì giảm xuống."
              value={cooldownMs} min={150} max={2000} step={50} suffix=" ms" onChange={setCooldownMs}
            />

            <p className="text-xs text-slate-500 leading-relaxed border-t border-slate-700 pt-4">
              Mẹo canh chỉnh: đặt camera cố định, khoanh vùng vừa đủ chỗ sản phẩm rơi qua và tránh để tay
              bạn lọt vào vùng đó. Chỉnh xong thả thử 10 con — đếm đủ 10 là dùng được.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Đồng hồ chạy realtime, chỉ hiện sau khi mount để HTML từ server không lệch giờ với client */
function LiveClock() {
  const [now, setNow] = React.useState<Date | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  React.useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-700 bg-[#1e293b] px-5 py-2.5">
      <Clock size={22} className="text-indigo-400" />
      <div className="leading-tight">
        <div className="font-mono text-3xl font-bold tabular-nums text-white">
          {now ? now.toLocaleTimeString('vi-VN', { hour12: false }) : '--:--:--'}
        </div>
        <div className="text-xs text-slate-400">
          {now
            ? now.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
            : ' '}
        </div>
      </div>
    </div>
  );
}

function HistoryTable({
  events,
  count,
  sessionStartedAt,
}: {
  events: CountEvent[];
  count: number;
  sessionStartedAt: number | null;
}) {
  return (
    <div className="bg-[#1e293b] rounded-3xl border border-slate-700 overflow-hidden flex flex-col h-full">
      <div className="px-5 py-4 border-b border-slate-700">
        <h2 className="font-semibold text-white">Lịch sử đếm</h2>
        <span className="text-xs text-slate-400">
          {count} sản phẩm{events.length < count && ` · hiện ${events.length} dòng gần nhất`}
        </span>
        {sessionStartedAt !== null && (
          <p className="text-[11px] text-slate-500 mt-0.5">
            Phiên mở lúc {new Date(sessionStartedAt).toLocaleString('vi-VN', { hour12: false })}
          </p>
        )}
      </div>

      {events.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-slate-500">Chưa có lượt đếm nào.</p>
      ) : (
        <div className="flex-1 min-h-0 max-h-80 xl:max-h-none overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#1e293b] text-slate-400 text-[10px] uppercase tracking-wider">
              <tr className="border-b border-slate-700">
                <th className="pl-5 pr-2 py-2.5 text-left font-medium">#</th>
                <th className="px-2 py-2.5 text-left font-medium">Thời điểm</th>
                <th className="px-2 py-2.5 text-right font-medium" title="Khoảng cách so với lần đếm trước">
                  Cách trước
                </th>
                <th className="pl-2 pr-5 py-2.5 text-right font-medium">Nguồn</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev, i) => {
                const prev = events[i + 1];
                const gap = prev ? (ev.at - prev.at) / 1000 : null;
                return (
                  <tr key={ev.id} className="border-b border-slate-800 last:border-0 hover:bg-slate-800/40">
                    <td className="pl-5 pr-2 py-2 font-mono text-indigo-300">{ev.index}</td>
                    <td className="px-2 py-2 font-mono text-slate-300">
                      {new Date(ev.at).toLocaleTimeString('vi-VN', { hour12: false })}
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-slate-400">
                      {gap === null ? '—' : `${gap.toFixed(1)}s`}
                    </td>
                    <td className="pl-2 pr-5 py-2 text-right">
                      <span
                        title={
                          ev.source === 'cam'
                            ? `Camera đếm · mức chuyển động ${ev.motion.toFixed(1)}%`
                            : 'Cộng tay'
                        }
                        className={`inline-flex items-center justify-center w-6 h-6 rounded-full border ${
                          ev.source === 'cam'
                            ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800'
                            : 'bg-slate-800 text-slate-400 border-slate-600'
                        }`}
                      >
                        {ev.source === 'cam' ? <Camera size={12} /> : <Hand size={12} />}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Slider({
  label, hint, value, min, max, step, suffix = '', onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex justify-between items-baseline">
        <span className="text-xs uppercase tracking-widest text-slate-400">{label}</span>
        <span className="font-mono text-sm text-indigo-300">
          {value}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-indigo-500"
      />
      {hint && <span className="block mt-1 text-[11px] text-slate-500 leading-snug">{hint}</span>}
    </label>
  );
}
