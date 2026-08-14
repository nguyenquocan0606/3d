'use client';

import React, { useState, useEffect } from 'react';
import { X, Plus, Info, Palette } from 'lucide-react';
import { Filament } from '@/types/filament.types';
import Barcode from './barcode-image';

interface AddSpoolModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (spool?: any) => void;
  selectedFilament: Filament | null;
  allSpools: Array<{ id: string }>;
  prefilledSpoolId?: string;
  prefilledLocationId?: string;
}

const removeAccents = (str: string) => {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase();
};

const getColorCodeLetter = (colorName: string): string => {
  const norm = removeAccents(colorName).trim();
  if (norm.includes('vang') || norm.includes('yellow')) return 'Y';
  if (norm.includes('do') || norm.includes('red')) return 'R';
  if (norm.includes('den') || norm.includes('black')) return 'Bk';
  if (norm.includes('trang') || norm.includes('white')) return 'W';
  if (norm.includes('xanh la') || norm.includes('green')) return 'G';
  if (norm.includes('xanh') || norm.includes('blue')) return 'B';
  if (norm.includes('skin') || norm.includes('da') || norm.includes('flesh')) return 'S';
  if (norm.includes('cam') || norm.includes('orange')) return 'O';
  if (norm.includes('tim') || norm.includes('purple') || norm.includes('violet')) return 'P';
  if (norm.includes('hong') || norm.includes('pink')) return 'Pk';
  if (norm.includes('xam') || norm.includes('gray') || norm.includes('grey') || norm.includes('ghi')) return 'Gy';
  if (norm.includes('nau') || norm.includes('brown')) return 'Br';
  if (norm.includes('bac') || norm.includes('silver')) return 'Si';
  if (norm.includes('gold')) return 'Gd';
  if (norm.includes('dong') || norm.includes('bronze') || norm.includes('copper')) return 'Bz';
  
  return norm.charAt(0).toUpperCase() || 'X';
};

const getNextSpoolId = (colorLetter: string, allSpools: Array<{ id: string }>): string => {
  const prefix = `C${colorLetter}-`;
  const matchingSpools = allSpools.filter(s => s.id.toUpperCase().startsWith(prefix.toUpperCase()));
  
  let maxNum = 0;
  matchingSpools.forEach(s => {
    const suffix = s.id.substring(prefix.length);
    const num = parseInt(suffix, 10);
    if (!isNaN(num) && num > maxNum) {
      maxNum = num;
    }
  });
  
  const nextNum = maxNum + 1;
  const formattedNum = nextNum < 10 ? `0${nextNum}` : `${nextNum}`;
  return `${prefix}${formattedNum}`;
};

const detectColorHex = (name: string): string | null => {
  const normalized = removeAccents(name).trim();
  
  const colors = [
    { keys: ['xanh la cay', 'xanh la', 'green'], hex: '#10B981' },
    { keys: ['xanh duong', 'xanh bien', 'blue'], hex: '#3B82F6' },
    { keys: ['do', 'red'], hex: '#EF4444' },
    { keys: ['den', 'black'], hex: '#1E293B' },
    { keys: ['trang', 'white'], hex: '#FFFFFF' },
    { keys: ['vang gold', 'gold'], hex: '#F59E0B' },
    { keys: ['vang', 'yellow'], hex: '#EAB308' },
    { keys: ['cam', 'orange'], hex: '#F97316' },
    { keys: ['tim', 'purple', 'violet'], hex: '#8B5CF6' },
    { keys: ['hong', 'pink'], hex: '#EC4899' },
    { keys: ['xam', 'gray', 'grey', 'ghi'], hex: '#6B7280' },
    { keys: ['nau', 'brown'], hex: '#78350F' },
    { keys: ['bac', 'silver'], hex: '#CBD5E1' },
    { keys: ['dong', 'bronze', 'copper'], hex: '#B45309' },
    { keys: ['skin', 'mau da', 'da', 'beige', 'flesh'], hex: '#E8BEAC' },
  ];

  for (const color of colors) {
    for (const key of color.keys) {
      if (normalized === key || normalized.startsWith(key + ' ') || normalized.endsWith(' ' + key) || normalized.includes(' ' + key + ' ')) {
        return color.hex;
      }
    }
  }
  return null;
};

const generateNextSpoolId = (baseId: string, index: number): string => {
  if (index === 0) return baseId;
  const match = baseId.match(/^(.*?)(\d+)$/);
  if (match) {
    const prefix = match[1];
    const numStr = match[2];
    const nextNum = parseInt(numStr, 10) + index;
    const paddedNum = String(nextNum).padStart(numStr.length, '0');
    return `${prefix}${paddedNum}`;
  }
  return `${baseId}-${index + 1}`;
};

export default function AddSpoolModal({ isOpen, onClose, onSuccess, selectedFilament, allSpools, prefilledSpoolId, prefilledLocationId }: AddSpoolModalProps) {
  // Filament fields (only editable when selectedFilament is null)
  const [type, setType] = useState('PLA');
  const [colorName, setColorName] = useState('');
  const [colorHex, setColorHex] = useState('#4f46e5');
  const [brand, setBrand] = useState('');

  // Spool fields
  const [spoolId, setSpoolId] = useState('');
  const [initialWeight, setInitialWeight] = useState(1000);
  const [emptySpoolWeight, setEmptySpoolWeight] = useState(220);
  const [remainingWeight, setRemainingWeight] = useState(1000);
  const [status, setStatus] = useState<'active' | 'depleted' | 'archived'>('active');
  const [quantity, setQuantity] = useState(1);
  const [locations, setLocations] = useState<Array<{ id: string; name: string }>>([]);
  const [printers, setPrinters] = useState<Array<{ id: string; name: string }>>([]);
  const [locationId, setLocationId] = useState<string>('');
  const [printerId, setPrinterId] = useState<string>('');

  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Initialize or pre-fill values
  useEffect(() => {
    if (isOpen) {
      if (selectedFilament) {
        setType(selectedFilament.type);
        setColorName(selectedFilament.colorName);
        setColorHex(selectedFilament.colorHex || '#4f46e5');
        setBrand(selectedFilament.brand || '');
      } else {
        setType('PLA');
        setColorName('');
        setColorHex('#4f46e5');
        setBrand('');
      }
      setInitialWeight(1000);
      setEmptySpoolWeight(220);
      setRemainingWeight(1000);
      setStatus('active');
      setQuantity(1);
      setError('');
      setLocationId(prefilledLocationId || '');
      setPrinterId('');
      
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
   }, [isOpen, selectedFilament, prefilledLocationId]);

  // Generate suggested Spool ID when colorName changes or prefilledSpoolId is provided
  useEffect(() => {
    if (isOpen) {
      if (prefilledSpoolId) {
        setSpoolId(prefilledSpoolId);
      } else if (selectedFilament) {
        const colorLetter = getColorCodeLetter(selectedFilament.colorName);
        const nextId = getNextSpoolId(colorLetter, allSpools);
        setSpoolId(nextId);
      } else if (colorName.trim()) {
        const colorLetter = getColorCodeLetter(colorName);
        const nextId = getNextSpoolId(colorLetter, allSpools);
        setSpoolId(nextId);
      } else {
        setSpoolId('');
      }
    }
  }, [selectedFilament, colorName, isOpen, allSpools, prefilledSpoolId]);

  const handleColorNameChange = (val: string) => {
    setColorName(val);
    const hex = detectColorHex(val);
    if (hex) {
      setColorHex(hex);
    }
  };

  const handleInitialWeightChange = (val: number) => {
    setInitialWeight(val);
    setRemainingWeight(val);
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedFilament && !colorName.trim()) {
      setError('Vui lòng nhập tên màu sắc');
      return;
    }

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

    if (quantity < 1) {
      setError('Số lượng cuộn nhựa phải lớn hơn hoặc bằng 1');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      let firstCreatedSpool: any = null;

      for (let i = 0; i < quantity; i++) {
        const currentId = generateNextSpoolId(spoolId.trim(), i);

        const payload = selectedFilament
          ? {
              id: currentId,
              filamentId: selectedFilament.id,
              locationId: locationId || undefined,
              printerId: printerId || undefined,
              initialWeightG: initialWeight,
              emptySpoolWeightG: emptySpoolWeight,
              remainingWeightG: remainingWeight,
              status,
            }
          : {
              id: currentId,
              type,
              colorName: colorName.trim(),
              colorHex,
              brand: brand.trim() || undefined,
              locationId: locationId || undefined,
              printerId: printerId || undefined,
              initialWeightG: initialWeight,
              emptySpoolWeightG: emptySpoolWeight,
              remainingWeightG: remainingWeight,
              status,
            };

        const response = await fetch('/api/spools', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        const resData = await response.json();

        if (resData.status !== 'success') {
          throw new Error(resData.message || `Lỗi khi tạo cuộn thứ ${i + 1}`);
        }

        // Tự động gửi lệnh in tem cho cuộn vừa tạo giống logic trong print-qr-tab
        const createdSpool = resData.data;
        const spoolBrand = selectedFilament ? selectedFilament.brand : brand.trim();
        const spoolType = selectedFilament ? selectedFilament.type : type;
        const spoolColorName = selectedFilament ? selectedFilament.colorName : colorName.trim();
        
        const printPayload = {
          line1: createdSpool.id,
          line2: `${spoolBrand || ''} ${spoolType}`.trim(),
          line3: spoolColorName
        };

        try {
          await fetch('/api/print-jobs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              qrCode: createdSpool.id,
              label: JSON.stringify(printPayload)
            })
          });
        } catch (printErr) {
          console.error("Lỗi khi tự động in tem:", printErr);
        }

        if (i === 0) {
          firstCreatedSpool = resData.data;
        }
      }

      onSuccess(firstCreatedSpool);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi kết nối server');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs overflow-y-auto py-8">
      {/* Modal Container */}
      <div className="relative w-full max-w-md mx-4 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xl my-auto">
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

        <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2 flex items-center gap-2">
          <Plus className="text-indigo-500" size={20} />
          {selectedFilament ? 'Thêm Cuộn Nhựa' : 'Thêm Cuộn Nhựa & Loại Nhựa'}
        </h3>
        
        {selectedFilament ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
            Nhựa: <span className="text-indigo-400 font-medium">{selectedFilament.brand || 'No brand'} {selectedFilament.type} ({selectedFilament.colorName})</span>
          </p>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
            Hệ thống sẽ tự động liên kết với loại nhựa hiện có hoặc tạo mới nếu chưa tồn tại.
          </p>
        )}

        {error && (
          <div className="p-3 mb-4 bg-red-950/55 border border-red-800 text-red-200 rounded-lg text-sm whitespace-pre-line animate-shake">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* Filament Information (Only show when selectedFilament is null) */}
          {!selectedFilament && (
            <div className="space-y-4 p-4 bg-slate-100/80 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-850 rounded-xl">
              <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Thông tin loại nhựa</h4>
              
              {/* Material Type Input */}
              <div>
                <label className="block text-xs font-medium text-slate-350 mb-1">Loại nhựa</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full bg-[#1f2937] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-indigo-500 transition-colors"
                >
                  <option value="PLA">PLA</option>
                  <option value="PETG">PETG</option>
                  <option value="ABS">ABS</option>
                  <option value="TPU">TPU</option>
                  <option value="ASA">ASA</option>
                  <option value="Nylon">Nylon</option>
                </select>
              </div>

              {/* Color Name Input */}
              <div>
                <label className="block text-xs font-medium text-slate-350 mb-1">Tên màu sắc</label>
                <input
                  type="text"
                  placeholder="VD: Đỏ, Đen nhám, Blue..."
                  value={colorName}
                  onChange={(e) => handleColorNameChange(e.target.value)}
                  className="w-full bg-[#1f2937] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 transition-colors"
                />
              </div>

              {/* Color Hex and Brand */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-medium text-slate-355 mb-1 flex items-center gap-1">
                    <Palette size={12} className="text-indigo-400" />
                    Mã màu (Hex)
                  </label>
                  <div className="flex gap-1.5">
                    <div className="w-8 h-8 border border-slate-300 dark:border-slate-700 rounded-lg overflow-hidden shrink-0">
                      <input
                        type="color"
                        value={colorHex}
                        onChange={(e) => setColorHex(e.target.value)}
                        className="w-full h-full cursor-pointer bg-transparent border-0 p-0 scale-150"
                      />
                    </div>
                    <input
                      type="text"
                      value={colorHex}
                      onChange={(e) => setColorHex(e.target.value)}
                      className="w-full bg-[#1f2937] border border-slate-300 dark:border-slate-700 rounded-lg px-2 text-xs text-slate-900 dark:text-slate-100 uppercase focus:outline-hidden focus:border-indigo-500 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-medium text-slate-350 mb-1">Hãng sản xuất</label>
                  <input
                    type="text"
                    placeholder="VD: eSun, Sunlu..."
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    className="w-full bg-[#1f2937] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-slate-900 dark:text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 transition-colors"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Spool Information */}
          <div className="space-y-4">
            {/* Spool ID Input */}
            <div>
              <label className="block text-sm font-medium text-slate-355 mb-1.5">
                Mã ID cuộn nhựa <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="VD: C-PLA-R-01"
                value={spoolId}
                onChange={(e) => setSpoolId(e.target.value)}
                className="w-full bg-[#1f2937] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 font-mono tracking-wider transition-colors"
              />
              <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                <Info size={12} />
                Mã cuộn nhựa phải duy nhất để tự sinh Barcode in nhãn.
              </p>
            </div>

            {/* Barcode Preview */}
            {spoolId.trim() && (
              <div className="flex flex-col items-center justify-center p-3 bg-white border border-slate-200 dark:border-slate-800 rounded-xl">
                <Barcode 
                  value={spoolId.trim()} 
                  size={120} 
                  margin={1} 
                  theme="light" 
                />
                <span className="text-[9px] font-mono font-bold mt-1 text-slate-900 tracking-wider">
                  PREVIEW QR CODE: {spoolId.trim()}
                </span>
              </div>
            )}

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
                  onChange={(e) => handleInitialWeightChange(Number(e.target.value))}
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
              <p className="text-[10px] text-slate-500 mt-1">
                Khối lượng thực tế của nhựa (không bao gồm vỏ cuộn).
              </p>
            </div>

            {/* Quantity */}
            <div>
              <label className="block text-sm font-medium text-slate-350 mb-1">
                Số lượng cuộn cần thêm <span className="text-indigo-400 font-bold">*</span>
              </label>
              <input
                type="number"
                inputMode="numeric"
                pattern="[0-9]*"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                className="w-full bg-[#1f2937] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-indigo-500 transition-colors font-semibold"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                Nếu lớn hơn 1, hệ thống sẽ tự động tạo hàng loạt cuộn nhựa và tự tăng ID (ví dụ: {spoolId || 'ID'} &rarr; {spoolId ? generateNextSpoolId(spoolId, 1) : 'ID-02'}...).
              </p>
            </div>

            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-slate-355 mb-1.5">Trạng thái</label>
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
                <label className="block text-[11px] font-medium text-slate-355 mb-1.5">Vị trí kho lưu trữ</label>
                <select
                  value={locationId}
                  onChange={(e) => {
                    setLocationId(e.target.value);
                    if (e.target.value) setPrinterId('');
                  }}
                  className="w-full bg-[#1f2937] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-indigo-500 transition-colors"
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
                <label className="block text-[11px] font-medium text-slate-355 mb-1.5">Gắn vào máy in</label>
                <select
                  value={printerId}
                  onChange={(e) => {
                    setPrinterId(e.target.value);
                    if (e.target.value) setLocationId('');
                  }}
                  className="w-full bg-[#1f2937] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-indigo-500 transition-colors"
                >
                  <option value="">-- Chọn máy --</option>
                  {printers.map((prt) => (
                    <option key={prt.id} value={prt.id}>
                      {prt.name}
                    </option>
                  ))}
                </select>
              </div>
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
                {isLoading ? 'Đang lưu...' : 'Thêm cuộn'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
