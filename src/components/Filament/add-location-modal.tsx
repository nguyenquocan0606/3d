'use client';

import React, { useState, useEffect } from 'react';
import { X, Plus, Info } from 'lucide-react';

interface AddLocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  prefilledId?: string;
}

export default function AddLocationModal({ isOpen, onClose, onSuccess, prefilledId }: AddLocationModalProps) {
  const [idSuffix, setIdSuffix] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (prefilledId && prefilledId.toUpperCase().startsWith('LOC-')) {
        setIdSuffix(prefilledId.substring(4)); // Remove 'LOC-' prefix
      } else {
        setIdSuffix('');
      }
      setName('');
      setError('');
    }
  }, [isOpen, prefilledId]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanSuffix = idSuffix.trim().toUpperCase().replace(/\s+/g, '-');
    if (!cleanSuffix) {
      setError('Vui lòng nhập mã định danh kho');
      return;
    }

    if (!name.trim()) {
      setError('Vui lòng nhập tên kho');
      return;
    }

    const fullId = `LOC-${cleanSuffix}`;

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/locations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: fullId,
          name: name.trim(),
        }),
      });

      const resData = await response.json();

      if (resData.status === 'success') {
        onSuccess();
        onClose();
      } else {
        setError(resData.message || 'Lỗi xảy ra khi thêm kho mới');
      }
    } catch {
      setError('Lỗi kết nối server');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs">
      {/* Modal Container */}
      <div className="relative w-full max-w-md mx-4 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xl">
        {/* Close Button */}
        <div className="absolute top-4 right-4 w-8 h-8">
          <button 
            type="button"
            onClick={onClose}
            className="w-full h-full flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200 dark:bg-slate-800 rounded-full transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-5 flex items-center gap-2">
          <Plus className="text-indigo-500" size={20} />
          Thêm Vị Trí Kho Mới
        </h3>

        {error && (
          <div className="p-3 mb-4 bg-red-950/55 border border-red-800 text-red-200 rounded-lg text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Location ID Input */}
          <div>
            <label className="block text-sm font-medium text-slate-350 mb-1.5">
              Mã ID vị trí kho <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center">
              <span className="bg-slate-200 dark:bg-slate-800 border border-r-0 border-slate-300 dark:border-slate-700 rounded-l-lg px-3 py-2 text-slate-500 dark:text-slate-400 font-mono text-sm">
                LOC-
              </span>
              <input
                type="text"
                placeholder="VD: KHO-A, KE-01"
                value={idSuffix}
                onChange={(e) => setIdSuffix(e.target.value)}
                className="w-full bg-[#1f2937] border border-slate-300 dark:border-slate-700 rounded-r-lg px-3 py-2 text-slate-900 dark:text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 font-mono uppercase tracking-wider transition-colors text-sm"
              />
            </div>
            <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
              <Info size={12} />
              Mã ID đầy đủ sẽ có dạng: <span className="font-mono text-slate-500 dark:text-slate-400">LOC-{idSuffix.trim().toUpperCase().replace(/\s+/g, '-') || '[MA-KHO]'}</span>
            </p>
          </div>

          {/* Location Name Input */}
          <div>
            <label className="block text-sm font-medium text-slate-355 mb-1.5">
              Tên kho / Vị trí hiển thị <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="VD: Kho chính A, Kệ PLA tầng 1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[#1f2937] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 transition-colors text-sm"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <div className="w-24 h-10">
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className="w-full h-full flex items-center justify-center bg-slate-200 dark:bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-lg text-sm transition-colors"
              >
                Hủy
              </button>
            </div>
            <div className="w-32 h-10">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full h-full flex items-center justify-center bg-indigo-650 hover:bg-indigo-600 text-slate-900 dark:text-white font-medium rounded-lg text-sm transition-colors disabled:opacity-50"
              >
                {isLoading ? 'Đang lưu...' : 'Thêm vị trí'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
