'use client';

import React from 'react';

interface ScaleDisplayProps {
  /** Nhãn nhỏ phía trên số, VD "Trọng lượng hiện tại" */
  title: string;
  /** Số đã định dạng sẵn để hiện */
  value: string;
  /** Đơn vị hiện cạnh số: g / sp */
  unit: string;
  isConnected: boolean;
  /** Các dòng phụ nhỏ bên dưới số lớn */
  children?: React.ReactNode;
}

/** Màn hình LED giả lập của trạm cân — dùng chung cho chế độ cân và chế độ đếm */
export default function ScaleDisplay({ title, value, unit, isConnected, children }: ScaleDisplayProps) {
  return (
    <div className="relative w-full overflow-hidden rounded-3xl border border-slate-700 bg-[#1e293b] p-8 shadow-[0_0_50px_rgba(0,0,0,0.5)] sm:p-10">
      {/* Hiệu ứng bóng LED */}
      <div
        className={`absolute left-0 top-0 h-1 w-full ${
          isConnected
            ? 'bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,1)]'
            : 'bg-red-500 shadow-[0_0_20px_rgba(239,68,68,1)]'
        }`}
      />

      <div className="flex flex-col items-center justify-center">
        <span className="mb-3 text-lg font-medium uppercase tracking-widest text-slate-400">{title}</span>

        <div className="flex items-baseline gap-4">
          <span
            className={`font-mono text-8xl font-bold tracking-tighter sm:text-9xl ${
              isConnected ? 'text-emerald-400 drop-shadow-[0_0_25px_rgba(52,211,153,0.4)]' : 'text-slate-600'
            }`}
          >
            {isConnected ? value : '---'}
          </span>
          <span className="font-mono text-4xl font-semibold text-slate-500 sm:text-5xl">{unit}</span>
        </div>

        {children}
      </div>
    </div>
  );
}
