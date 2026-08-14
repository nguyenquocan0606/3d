import React, { useState, useEffect } from 'react';
import { X, Palette, Box } from 'lucide-react';

interface SetFilamentModalProps {
  isOpen: boolean;
  onClose: () => void;
  printerId: string;
  amsId: number;
  trayId: number;
  currentType?: string;
  currentColor?: string;
  onSuccess: () => void;
}

const COMMON_FILAMENTS = [
  'PLA', 'PLA Basic', 'PLA Matte', 'PLA Silk', 'PLA Tough', 'PLA-CF', 
  'PETG', 'PETG Basic', 'PETG-CF',
  'ABS', 'ASA', 
  'TPU', 'TPU 95A',
  'PA', 'PA-CF', 'PC'
];

export function SetFilamentModal({
  isOpen, onClose, printerId, amsId, trayId, currentType, currentColor, onSuccess
}: SetFilamentModalProps) {
  const [type, setType] = useState('PLA');
  const [colorHex, setColorHex] = useState('#ffffff');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setType(currentType && currentType !== 'Unknown' ? currentType : 'PLA');
      
      // Handle bambu hex format which might be 8 chars (RRGGBBAA). HTML color picker wants 6 chars (#RRGGBB).
      let cleanColor = currentColor || '#ffffff';
      if (cleanColor.length === 9) { // #RRGGBBAA
        cleanColor = cleanColor.substring(0, 7);
      }
      if (!cleanColor.startsWith('#')) {
        cleanColor = '#' + cleanColor.substring(0, 6);
      }
      setColorHex(cleanColor.padEnd(7, '0'));
      setError('');
    }
  }, [isOpen, currentType, currentColor]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/printers/cloud/filament', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          printerId,
          amsId,
          trayId,
          type,
          colorHex: colorHex.replace('#', '')
        })
      });

      const data = await res.json();
      if (data.status === 'success') {
        onSuccess();
        onClose();
      } else {
        setError(data.message || 'Đã xảy ra lỗi khi cấu hình nhựa');
      }
    } catch {
      setError('Lỗi kết nối tới máy chủ');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-850/50">
          <h2 className="text-lg font-bold text-slate-100">
            Cấu hình Slot {trayId + 1}
          </h2>
          <button 
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5">
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
                <Box size={14} />
                Loại nhựa
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-2.5"
              >
                {COMMON_FILAMENTS.map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
                <Palette size={14} />
                Màu sắc
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={colorHex}
                  onChange={(e) => setColorHex(e.target.value)}
                  className="w-10 h-10 rounded cursor-pointer border-0 p-0 bg-transparent"
                />
                <input
                  type="text"
                  value={colorHex.toUpperCase()}
                  onChange={(e) => setColorHex(e.target.value)}
                  className="flex-1 bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-2.5 font-mono uppercase"
                  maxLength={7}
                />
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-semibold text-slate-900 bg-emerald-500 hover:bg-emerald-400 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? 'Đang lưu...' : 'Lưu'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
