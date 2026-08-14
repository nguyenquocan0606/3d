'use client';

import React from 'react';
import { useScale } from '@/components/scale-provider';
import { Scale, Wifi, WifiOff } from 'lucide-react';
import Link from 'next/link';

export default function ScaleStationPage() {
  const { weight, isConnected } = useScale();

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200 flex flex-col items-center justify-center p-6 relative">
      {/* Nút quay lại */}
      <Link href="/" className="absolute top-6 left-6 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg font-medium transition-colors">
        &larr; Quay lại
      </Link>

      <div className="max-w-2xl w-full flex flex-col items-center">
        <div className="flex items-center gap-3 mb-8 text-indigo-400">
          <Scale size={48} />
          <h1 className="text-4xl font-bold tracking-tight text-white">TRẠM CÂN TỰ ĐỘNG</h1>
        </div>

        {/* Status Indicator */}
        <div className={`flex items-center gap-2 mb-8 px-5 py-2 rounded-full border ${isConnected ? 'bg-emerald-950/40 border-emerald-800 text-emerald-400' : 'bg-red-950/40 border-red-800 text-red-400'}`}>
          {isConnected ? <Wifi size={18} className="animate-pulse" /> : <WifiOff size={18} />}
          <span className="font-medium text-lg">
            {isConnected ? 'Hệ thống Cân đang Online' : 'Mất kết nối với Cân!'}
          </span>
        </div>

        {/* Màn hình hiển thị số */}
        <div className="w-full bg-[#1e293b] rounded-3xl p-12 shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-slate-700 relative overflow-hidden">
          {/* Hiệu ứng bóng LED */}
          <div className={`absolute top-0 left-0 w-full h-1 ${isConnected ? 'bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,1)]' : 'bg-red-500 shadow-[0_0_20px_rgba(239,68,68,1)]'}`} />
          
          <div className="flex flex-col items-center justify-center">
            <span className="text-slate-400 text-xl font-medium mb-4 uppercase tracking-widest">
              Trọng lượng hiện tại
            </span>
            <div className="flex items-baseline gap-4">
              <span className={`text-9xl font-mono font-bold tracking-tighter ${isConnected ? 'text-emerald-400 drop-shadow-[0_0_25px_rgba(52,211,153,0.4)]' : 'text-slate-600'}`}>
                {isConnected ? Math.round(weight) : '---'}
              </span>
              <span className="text-5xl font-mono text-slate-500 font-semibold">g</span>
            </div>
          </div>
        </div>

        <p className="mt-8 text-slate-500 text-center text-sm">
          Bạn có thể đặt thiết bị chạy trang web này (như Tablet, Điện thoại) cố định tại khu vực Cân để theo dõi trực tiếp.
          <br/>
          (Dữ liệu truyền qua MQTT - Realtime)
        </p>
      </div>
    </div>
  );
}
