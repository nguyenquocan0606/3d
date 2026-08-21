'use client';

import React from 'react';
import Link from 'next/link';
import { Camera, Minus, Plus, RotateCcw, Space } from 'lucide-react';

const STORAGE_KEY = 'counter-state-v1';

export default function CounterPage() {
  const [count, setCount] = React.useState(0);
  const [step, setStep] = React.useState(1);
  // Hiệu ứng nhấp nháy mỗi khi số thay đổi: 'up' | 'down' | null
  const [pulse, setPulse] = React.useState<'up' | 'down' | null>(null);
  const pulseTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Nạp lại giá trị đã lưu. Phải đọc sau khi mount, đọc lúc render sẽ lệch với HTML dựng từ server.
  /* eslint-disable react-hooks/set-state-in-effect */
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { count?: number; step?: number };
      if (typeof saved.count === 'number') setCount(saved.count);
      if (typeof saved.step === 'number' && saved.step > 0) setStep(saved.step);
    } catch {
      // Bỏ qua dữ liệu hỏng
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Lưu mỗi khi thay đổi
  React.useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ count, step }));
  }, [count, step]);

  const bump = React.useCallback((delta: number) => {
    setCount((prev) => prev + delta);
    setPulse(delta >= 0 ? 'up' : 'down');
    if (pulseTimer.current) clearTimeout(pulseTimer.current);
    pulseTimer.current = setTimeout(() => setPulse(null), 180);
  }, []);

  const reset = React.useCallback(() => {
    setCount(0);
    setPulse(null);
  }, []);

  React.useEffect(() => () => {
    if (pulseTimer.current) clearTimeout(pulseTimer.current);
  }, []);

  // Phím tắt
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Không cướp phím khi đang gõ trong ô nhập liệu
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case ' ':
        case 'ArrowUp':
        case 'ArrowRight':
        case '+':
          e.preventDefault(); // chặn cuộn trang khi bấm Space
          bump(step);
          break;
        case 'ArrowDown':
        case 'ArrowLeft':
        case '-':
          e.preventDefault();
          bump(-step);
          break;
        case 'r':
        case 'R':
        case 'Backspace':
          e.preventDefault();
          reset();
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [bump, reset, step]);

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200 flex flex-col items-center justify-center p-6 relative">
      <Link
        href="/"
        className="absolute top-6 left-6 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg font-medium transition-colors"
      >
        &larr; Quay lại
      </Link>

      <div className="absolute top-6 right-6 flex items-center gap-3">
        <Link
          href="/counter/tray"
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
        >
          <Camera size={18} /> Đếm trên khay
        </Link>
        <Link
          href="/counter/camera"
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
        >
          <Camera size={18} /> Đếm bằng camera
        </Link>
      </div>

      <div className="max-w-2xl w-full flex flex-col items-center">
        <h1 className="text-4xl font-bold tracking-tight text-white mb-2">BỘ ĐẾM</h1>
        <p className="text-slate-400 mb-8 flex items-center gap-2">
          <Space size={18} /> Bấm phím <kbd className="px-2 py-0.5 bg-slate-800 border border-slate-600 rounded text-sm">Space</kbd> để cộng {step}
        </p>

        {/* Màn hình số */}
        <div className="w-full bg-[#1e293b] rounded-3xl p-12 shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-slate-700 relative overflow-hidden">
          <div
            className={`absolute top-0 left-0 w-full h-1 transition-colors duration-200 ${
              pulse === 'up'
                ? 'bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,1)]'
                : pulse === 'down'
                  ? 'bg-red-500 shadow-[0_0_20px_rgba(239,68,68,1)]'
                  : 'bg-slate-600'
            }`}
          />

          <div className="flex flex-col items-center justify-center">
            <span className="text-slate-400 text-xl font-medium mb-4 uppercase tracking-widest">
              Giá trị hiện tại
            </span>
            <span
              className={`text-9xl font-mono font-bold tracking-tighter tabular-nums transition-all duration-150 ${
                pulse === 'up'
                  ? 'text-emerald-300 scale-110 drop-shadow-[0_0_25px_rgba(52,211,153,0.5)]'
                  : pulse === 'down'
                    ? 'text-red-300 scale-95 drop-shadow-[0_0_25px_rgba(248,113,113,0.4)]'
                    : 'text-indigo-300'
              }`}
            >
              {count}
            </span>
          </div>
        </div>

        {/* Nút tăng / giảm */}
        <div className="flex items-center gap-4 mt-8">
          <button
            type="button"
            onClick={() => bump(-step)}
            aria-label={`Giảm ${step}`}
            className="w-20 h-20 flex items-center justify-center rounded-2xl bg-slate-800 hover:bg-red-600 active:scale-95 border border-slate-700 text-white transition-all"
          >
            <Minus size={36} />
          </button>

          <button
            type="button"
            onClick={reset}
            className="h-20 px-6 flex items-center gap-2 rounded-2xl bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700 text-slate-300 font-medium transition-all"
          >
            <RotateCcw size={20} /> Đặt lại
          </button>

          <button
            type="button"
            onClick={() => bump(step)}
            aria-label={`Tăng ${step}`}
            className="w-20 h-20 flex items-center justify-center rounded-2xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 border border-indigo-500 text-white transition-all"
          >
            <Plus size={36} />
          </button>
        </div>

        {/* Bước nhảy */}
        <div className="mt-8 flex items-center gap-3">
          <label htmlFor="step" className="text-slate-400 text-sm uppercase tracking-widest">
            Bước nhảy
          </label>
          <input
            id="step"
            type="number"
            min={1}
            value={step}
            onChange={(e) => {
              const next = Number(e.target.value);
              setStep(Number.isFinite(next) && next > 0 ? Math.floor(next) : 1);
            }}
            className="w-24 px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-center font-mono text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <p className="mt-8 text-slate-500 text-center text-sm leading-relaxed">
          Phím tắt: <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-600 rounded">Space</kbd>{' '}
          <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-600 rounded">↑</kbd>{' '}
          <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-600 rounded">→</kbd> tăng &middot;{' '}
          <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-600 rounded">↓</kbd>{' '}
          <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-600 rounded">←</kbd> giảm &middot;{' '}
          <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-600 rounded">R</kbd> đặt lại
          <br />
          Giá trị được lưu tự động trong trình duyệt.
        </p>
      </div>
    </div>
  );
}
