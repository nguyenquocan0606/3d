'use client';

import React, { useState, useEffect } from 'react';
import { X, Edit2, Info } from 'lucide-react';

interface EditSpoolModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  selectedSpool: any | null;
}

export default function EditSpoolModal({ isOpen, onClose, onSuccess, selectedSpool }: EditSpoolModalProps) {
  const [spoolId, setSpoolId] = useState('');
  const [brand, setBrand] = useState('');
  const [initialWeight, setInitialWeight] = useState(1000);
  const [emptySpoolWeight, setEmptySpoolWeight] = useState(220);
  const [remainingWeight, setRemainingWeight] = useState(1000);
  const [status, setStatus] = useState<'active' | 'depleted' | 'archived'>('active');
  const [locations, setLocations] = useState<Array<{ id: string; name: string }>>([]);
  const [printers, setPrinters] = useState<Array<{ id: string; name: string }>>([]);
  const [locationId, setLocationId] = useState<string>('');
  const [printerId, setPrinterId] = useState<string>('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (selectedSpool) {
      setSpoolId(selectedSpool.id);
      setBrand(selectedSpool.filamentBrand || '');
      setInitialWeight(selectedSpool.initialWeightG);
      setEmptySpoolWeight(selectedSpool.emptySpoolWeightG);
      setRemainingWeight(selectedSpool.remainingWeightG);
      setStatus(selectedSpool.status as any);
      setLocationId(selectedSpool.locationId || '');
      setPrinterId(selectedSpool.printerId || '');
      setError('');

      Promise.all([
        fetch('/api/locations').then((res) => res.json()),
        fetch('/api/printers').then((res) => res.json())
      ])
        .then(([locData, prtData]) => {
          if (locData.status === 'success') {
            setLocations(locData.data || []);
          }
          if (prtData.status === 'success') {
            setPrinters(prtData.data || []);
          }
        })
        .catch((err) => console.error('Fetch locations/printers error:', err));
    }
  }, [selectedSpool]);

  if (!isOpen || !selectedSpool) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!spoolId.trim()) {
      setError('Vui lòng nhập ID cuộn nhựa');
      return;
    }

    if (initialWeight <= 0) {
      setError('Khối lượng ban đầu phải lớn hơn 0');
      return;
    }

    if (remainingWeight < 0 || remainingWeight > initialWeight) {
      setError('Khối lượng còn lại không hợp lệ');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/spools/${selectedSpool.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          newId: spoolId.trim(),
          brand: brand.trim(),
          locationId: locationId || null,
          printerId: printerId || null,
          initialWeightG: initialWeight,
          emptySpoolWeightG: emptySpoolWeight,
          remainingWeightG: remainingWeight,
          status,
        }),
      });

      const resData = await response.json();

      if (resData.status === 'success') {
        onSuccess();
        onClose();
      } else {
        setError(resData.message || 'Lỗi xảy ra khi cập nhật cuộn nhựa');
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
          <Edit2 className="text-indigo-500" size={20} />
          Chỉnh Sửa Cuộn Nhựa
        </h3>

        {error && (
          <div className="p-3 mb-4 bg-red-950/55 border border-red-800 text-red-200 rounded-lg text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Spool ID Input */}
          <div>
            <label className="block text-sm font-medium text-slate-350 mb-1">
              ID cuộn nhựa <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={spoolId}
              onChange={(e) => setSpoolId(e.target.value)}
              className="w-full bg-[#1f2937] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 font-mono focus:outline-hidden focus:border-indigo-500 transition-colors"
            />
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
              <Info size={12} />
              Nếu đổi ID, đảm bảo ID mới không bị trùng với cuộn khác.
            </p>
          </div>

          {/* Brand Input */}
          <div>
            <label className="block text-sm font-medium text-slate-350 mb-1">
              Thương hiệu / Hãng sản xuất
            </label>
            <input
              type="text"
              placeholder="VD: eSun, Creality, Anycubic..."
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              className="w-full bg-[#1f2937] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-indigo-500 transition-colors"
            />
          </div>

          {/* Initial and Empty Spool Weights */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-350 mb-1">
                Lượng nhựa ban đầu (g)
              </label>
              <input
                type="number"
                inputMode="decimal"
                pattern="[0-9]*"
                min="1"
                value={initialWeight}
                onChange={(e) => setInitialWeight(Number(e.target.value))}
                className="w-full bg-[#1f2937] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-indigo-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-350 mb-1">
                Khối lượng vỏ cuộn (g)
              </label>
              <input
                type="number"
                inputMode="decimal"
                pattern="[0-9]*"
                min="0"
                value={emptySpoolWeight}
                onChange={(e) => setEmptySpoolWeight(Number(e.target.value))}
                className="w-full bg-[#1f2937] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-indigo-500 transition-colors"
              />
            </div>
          </div>

          {/* Remaining Weight */}
          <div>
            <label className="block text-sm font-medium text-slate-350 mb-1">
              Khối lượng nhựa hiện tại (g)
            </label>
            <input
              type="number"
              inputMode="decimal"
              pattern="[0-9]*"
              min="0"
              max={initialWeight}
              value={remainingWeight}
              onChange={(e) => setRemainingWeight(Number(e.target.value))}
              className="w-full bg-[#1f2937] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-indigo-500 transition-colors"
            />
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-slate-355 mb-1">Trạng thái</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
              className="w-full bg-[#1f2937] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-indigo-500 transition-colors"
            >
              <option value="active">Đang sử dụng (Active)</option>
              <option value="depleted">Đã hết nhựa (Depleted)</option>
              <option value="archived">Lưu trữ (Archived)</option>
            </select>
          </div>

          {/* Vị trí kho/máy in */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-355 mb-1">Kho lưu trữ</label>
              <select
                value={locationId}
                onChange={(e) => {
                  setLocationId(e.target.value);
                  if (e.target.value) setPrinterId('');
                }}
                className="w-full bg-[#1f2937] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-indigo-500 transition-colors"
              >
                <option value="">-- Chọn kho --</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-355 mb-1">Đang in trên máy</label>
              <select
                value={printerId}
                onChange={(e) => {
                  setPrinterId(e.target.value);
                  if (e.target.value) setLocationId('');
                }}
                className="w-full bg-[#1f2937] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-indigo-500 transition-colors"
              >
                <option value="">-- Chọn máy in --</option>
                {printers.map((prt) => (
                  <option key={prt.id} value={prt.id}>
                    {prt.name}
                  </option>
                ))}
              </select>
            </div>
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
                {isLoading ? 'Đang lưu...' : 'Cập nhật'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
