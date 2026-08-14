'use client';

import React, { useState } from 'react';
import { X, Plus } from 'lucide-react';

interface AddPrinterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  prefilledId?: string;
}

export default function AddPrinterModal({ isOpen, onClose, onSuccess, prefilledId }: AddPrinterModalProps) {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [model, setModel] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  React.useEffect(() => {
    if (isOpen) {
      // Nếu có prefilledId, dùng luôn. Nếu không, reset form
      if (prefilledId) {
        setId(prefilledId.replace(/^PRT-/i, ''));
      } else {
        setId('');
      }
      setName('');
      setModel('');
      setError('');
    }
  }, [isOpen, prefilledId]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const idClean = id.trim().toUpperCase();
    if (!idClean || !name.trim()) {
      setError('ID và tên máy in là bắt buộc');
      return;
    }

    const finalId = idClean.startsWith('PRT-') ? idClean : `PRT-${idClean}`;

    setLoading(true);
    try {
      const res = await fetch('/api/printers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: finalId,
          name: name.trim(),
          model: model.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (data.status === 'success') {
        onSuccess();
        onClose();
      } else {
        setError(data.message || 'Lỗi khi tạo máy in');
      }
    } catch {
      setError('Lỗi kết nối máy chủ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#0f1729] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Plus className="text-indigo-400" size={20} />
            Thêm Máy In Mới
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-200 dark:bg-slate-800 rounded-lg transition-colors text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-950/40 border border-red-800 text-red-300 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* ID */}
          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 block">
              Mã máy in (ID)
            </label>
            <div className="flex items-center gap-0">
              <span className="bg-slate-200 dark:bg-slate-800 text-indigo-400 border border-slate-300 dark:border-slate-700 border-r-0 rounded-l-lg px-3 py-2 text-sm font-mono font-bold">
                PRT-
              </span>
              <input
                type="text"
                value={id}
                onChange={(e) => setId(e.target.value.toUpperCase())}
                placeholder="ENDER3"
                className="flex-1 bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-700 rounded-r-lg px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 font-mono"
                required
              />
            </div>
            <p className="text-[10px] text-slate-500 mt-1">Ví dụ: PRT-ENDER3, PRT-BAMBU-X1C</p>
          </div>

          {/* Tên máy in */}
          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 block">
              Tên máy in
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ender 3 V3"
              className="w-full bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500"
              required
            />
          </div>

          {/* Model */}
          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 block">
              Model máy <span className="text-slate-600">(tuỳ chọn)</span>
            </label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="Ender 3 V3 SE"
              className="w-full bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500"
            />
          </div>

          {/* Submit */}
          <div className="w-full h-10">
            <button
              type="submit"
              disabled={loading}
              className="w-full h-full bg-indigo-650 hover:bg-indigo-600 text-slate-900 dark:text-white font-semibold rounded-lg text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading ? 'Đang tạo...' : 'Tạo máy in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
