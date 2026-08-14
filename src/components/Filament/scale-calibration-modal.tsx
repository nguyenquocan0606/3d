import React, { useState, useEffect } from 'react';
import { X, Scale, Settings2 } from 'lucide-react';

interface ScaleCalibrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  rawWeight: number;
  currentOffset: number;
  onSaveOffset: (newOffset: number) => void;
}

export default function ScaleCalibrationModal({
  isOpen,
  onClose,
  rawWeight,
  currentOffset,
  onSaveOffset,
}: ScaleCalibrationModalProps) {
  const [realWeight, setRealWeight] = useState<string>('');
  const [manualOffset, setManualOffset] = useState<string>('');
  
  useEffect(() => {
    if (isOpen) {
      setRealWeight(Math.round(rawWeight + currentOffset).toString());
      setManualOffset(currentOffset.toString());
    }
    // Chỉ chụp snapshot số cân tại thời điểm MỞ modal — không theo dõi rawWeight liên tục
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSaveRealWeight = () => {
    const target = parseFloat(realWeight);
    if (!isNaN(target)) {
      // offset = target - raw
      const newOffset = target - rawWeight;
      onSaveOffset(newOffset);
      onClose();
    }
  };

  const handleSaveManualOffset = () => {
    const off = parseFloat(manualOffset);
    if (!isNaN(off)) {
      onSaveOffset(off);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs">
      <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <X size={18} />
        </button>

        <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-800 dark:text-white">
          <Settings2 className="text-indigo-500" size={20} />
          Hiệu chuẩn cân
        </h3>

        <div className="mb-4 flex flex-col gap-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-500">Đang đọc từ cân:</span>
            <span className="font-mono font-bold">{rawWeight.toFixed(1)} g</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-500">Mức bù trừ hiện tại:</span>
            <span className="font-mono font-bold text-indigo-500">{currentOffset > 0 ? '+' : ''}{currentOffset.toFixed(1)} g</span>
          </div>
          <div className="flex justify-between items-center text-base pt-2 border-t border-slate-200 dark:border-slate-700">
            <span className="font-semibold text-slate-700 dark:text-slate-200">Hiển thị cuối:</span>
            <span className="font-mono font-bold text-emerald-500 text-lg">{Math.round(rawWeight + currentOffset)} g</span>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-300">
              Cách 1: Nhập cân nặng chuẩn (g)
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                value={realWeight}
                onChange={(e) => setRealWeight(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800"
                placeholder="Ví dụ: 1000"
              />
              <button 
                onClick={handleSaveRealWeight}
                className="whitespace-nowrap rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700"
              >
                Tự bù trừ
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">Đặt vật chuẩn lên cân và nhập số đúng vào đây.</p>
          </div>

          <div className="relative flex items-center py-2">
            <div className="flex-grow border-t border-slate-200 dark:border-slate-700"></div>
            <span className="flex-shrink-0 px-3 text-xs text-slate-400">hoặc</span>
            <div className="flex-grow border-t border-slate-200 dark:border-slate-700"></div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-300">
              Cách 2: Nhập số bù trừ thủ công
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                value={manualOffset}
                onChange={(e) => setManualOffset(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800"
                placeholder="Ví dụ: -5.5"
              />
              <button 
                onClick={handleSaveManualOffset}
                className="whitespace-nowrap rounded-lg bg-slate-200 px-4 py-2 font-semibold text-slate-800 hover:bg-slate-300 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600"
              >
                Lưu
              </button>
            </div>
          </div>
        </div>

        <button 
          onClick={() => {
            onClose();
            window.open('/scale', '_blank');
          }}
          className="mt-6 w-full flex items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50/50 py-2.5 text-sm font-bold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-400 dark:hover:bg-indigo-500/20"
        >
          <Scale size={18} />
          Mở Trạm Cân Toàn Màn Hình
        </button>
      </div>
    </div>
  );
}
