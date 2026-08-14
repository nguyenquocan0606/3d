'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ScanBarcode, Printer, Clock, PlayCircle, X, Camera, AlertCircle, CheckCircle } from 'lucide-react';
import ScanBarcodeModal from '@/components/Filament/scan-barcode-modal';
import PrintHistories, { PrintHistoriesRef } from '@/components/Filament/print-histories';

interface CreateJobTabProps {
  printers: any[];
  allSpools: any[];
  onJobCreated?: () => void;
}

export default function CreateJobTab({ printers, allSpools, onJobCreated }: CreateJobTabProps) {
  const [selectedPrinter, setSelectedPrinter] = useState('');
  const [spoolUsages, setSpoolUsages] = useState<{ spool: any, weightG: string }[]>([]);
  const [durationH, setDurationH] = useState('');
  const [durationM, setDurationM] = useState('');
  
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [, setScanTarget] = useState<'printer' | 'spools' | null>(null);
  
  const [scannedInput, setScannedInput] = useState('');
  
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const historiesRef = useRef<PrintHistoriesRef>(null);

  // Auto-load spools when selecting a printer
  useEffect(() => {
    if (selectedPrinter && allSpools) {
      const spoolsForPrinter = allSpools.filter(s => s.printerId === selectedPrinter && s.remainingWeightG > 0);
      
      setSpoolUsages(prev => {
        // Giữ lại các cuộn không thuộc máy in nào, hoặc thuộc máy in hiện tại
        const newUsages = prev.filter(u => !u.spool.printerId || u.spool.printerId === selectedPrinter);
        let changed = prev.length !== newUsages.length;
        
        spoolsForPrinter.forEach(spool => {
          if (!newUsages.some(u => u.spool.id === spool.id)) {
            newUsages.push({ spool, weightG: '' });
            changed = true;
          }
        });
        
        return changed ? newUsages : prev;
      });
    } else if (!selectedPrinter) {
      // Bỏ chọn máy in -> Xóa các cuộn thuộc máy in (để lại các cuộn quét tay tự do)
      setSpoolUsages(prev => {
        const newUsages = prev.filter(u => !u.spool.printerId);
        return newUsages.length !== prev.length ? newUsages : prev;
      });
    }
  }, [selectedPrinter, allSpools]);

  // Handle manual input text
  const handleManualScan = (e: React.FormEvent) => {
    e.preventDefault();
    processScannedCode(scannedInput);
  };

  // Process any scanned code
  const processScannedCode = (code: string) => {
    if (!code.trim()) return;
    const upperCode = code.trim().toUpperCase();
    setError('');
    setSuccessMsg('');

    if (upperCode.startsWith('PRT-')) {
      const found = printers.find(p => p.id.toUpperCase() === upperCode);
      if (found) {
        setSelectedPrinter(found.id);
      } else {
        setError(`Không tìm thấy máy in: ${upperCode}`);
      }
    } else {
      // Giả định là mã cuộn nhựa
      const found = allSpools.find(s => s.id.toUpperCase() === upperCode);
      if (found) {
        if (found.remainingWeightG <= 0) {
          setError(`Cuộn nhựa ${upperCode} đã hết nhựa!`);
          return;
        }

        setSpoolUsages(prev => {
          if (prev.some(u => u.spool.id === found.id)) {
            // Không thể dùng setError trực tiếp trong render loop an toàn, ta set ở ngoài timeout hoặc đơn giản trả về prev
            setTimeout(() => setError(`Cuộn nhựa ${upperCode} đã được thêm vào danh sách!`), 0);
            return prev;
          }
          return [...prev, { spool: found, weightG: '' }];
        });
      } else {
        setError(`Không tìm thấy cuộn nhựa: ${upperCode}`);
      }
    }
    
    setScannedInput('');
  };

  const removeSpool = (id: string) => {
    setSpoolUsages(spoolUsages.filter(u => u.spool.id !== id));
  };

  const updateSpoolWeight = (id: string, weight: string) => {
    setSpoolUsages(spoolUsages.map(u => u.spool.id === id ? { ...u, weightG: weight } : u));
  };

  const openScanner = (target: 'printer' | 'spools') => {
    setScanTarget(target);
    setIsScannerOpen(true);
  };

  const handleSubmit = async () => {
    setError('');
    setSuccessMsg('');

    if (!selectedPrinter) {
      setError('Vui lòng chọn Máy in.');
      return;
    }
    if (spoolUsages.length === 0) {
      setError('Vui lòng thêm ít nhất 1 cuộn nhựa.');
      return;
    }
    for (const u of spoolUsages) {
      const w = Number(u.weightG);
      if (isNaN(w) || w < 0) {
        setError(`Khối lượng nhập cho cuộn ${u.spool.id} không hợp lệ.`);
        return;
      }
      if (w > u.spool.remainingWeightG) {
        setError(`Khối lượng nhập (${w}g) vượt quá nhựa còn lại của ${u.spool.id} (${u.spool.remainingWeightG}g).`);
        return;
      }
    }
    const h = Number(durationH) || 0;
    const m = Number(durationM) || 0;
    const totalMinutes = h * 60 + m;
    if (totalMinutes <= 0) {
      setError('Vui lòng nhập thời gian in hợp lệ.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/tasks3d', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          printerId: selectedPrinter,
          durationMinutes: totalMinutes,
          spools: spoolUsages.map(u => ({ id: u.spool.id, weightG: Number(u.weightG) }))
        })
      });

      const data = await res.json();
      if (res.ok) {
        setSuccessMsg('Đã tạo Lệnh In thành công! Máy in đang ở trạng thái In.');
        setSelectedPrinter('');
        setSpoolUsages([]);
        setDurationH('');
        setDurationM('');
        if (onJobCreated) onJobCreated();
        historiesRef.current?.refresh();
      } else {
        setError(data.message || 'Lỗi khi tạo lệnh in');
      }
    } catch (err: any) {
      setError(err.message || 'Lỗi mạng');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500" />
        
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-amber-500/10 rounded-xl text-amber-400">
            <PlayCircle size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Tạo Lệnh In 3D</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Thiết lập máy in, khối lượng nhựa và thời gian in</p>
          </div>
        </div>

        {error && (
          <div className="p-4 mb-6 bg-red-950/40 border border-red-800 text-red-200 rounded-xl text-sm flex items-center gap-2 animate-in slide-in-from-top-2">
            <AlertCircle size={18} className="shrink-0 text-red-500" />
            <span>{error}</span>
          </div>
        )}
        
        {successMsg && (
          <div className="p-4 mb-6 bg-emerald-950/40 border border-emerald-800 text-emerald-200 rounded-xl text-sm flex items-center gap-2 animate-in slide-in-from-top-2">
            <CheckCircle size={18} className="shrink-0 text-emerald-500" />
            <span>{successMsg}</span>
          </div>
        )}

        <div className="space-y-6">
          {/* Quick Scanner */}
          <div className="bg-slate-200/50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Quét Nhanh (Máy In / Cuộn Nhựa)</label>
            <form onSubmit={handleManualScan} className="flex gap-2">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <ScanBarcode size={18} />
                </div>
                <input
                  type="text"
                  value={scannedInput}
                  onChange={(e) => setScannedInput(e.target.value)}
                  placeholder="Quét mã QR vào đây..."
                  className="w-full bg-slate-50 dark:bg-[#1f2937] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-sm rounded-xl pl-10 pr-4 py-2.5 focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500 font-mono uppercase"
                />
              </div>
              <button
                type="button"
                onClick={() => openScanner('spools')}
                className="px-4 bg-slate-700 hover:bg-slate-600 text-slate-900 dark:text-white rounded-xl transition-colors border border-slate-600 flex items-center gap-2"
              >
                <Camera size={18} /> Mở Camera
              </button>
            </form>
          </div>

          {/* 1. Chọn máy in */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
              <Printer size={16} className="text-slate-500 dark:text-slate-400" /> 1. Chọn Máy In
            </label>
            <select
              value={selectedPrinter}
              onChange={(e) => setSelectedPrinter(e.target.value)}
              className="w-full bg-slate-50 dark:bg-[#1f2937] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-base rounded-xl px-4 py-3 focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
            >
              <option value="">-- Chọn máy in --</option>
              {printers.map(p => (
                <option key={p.id} value={p.id}>[{p.id}] {p.name}</option>
              ))}
            </select>
          </div>

          {/* 2. Cuộn nhựa */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
              <div className="w-4 h-4 rounded-full border-2 border-slate-400" /> 2. Nhựa Sử Dụng
            </label>
            
            {spoolUsages.length === 0 ? (
              <div className="text-center p-6 bg-slate-50 dark:bg-[#1f2937] border border-slate-300 dark:border-slate-700 border-dashed rounded-xl text-slate-500 text-sm">
                Chưa có cuộn nhựa nào được thêm. Quét QR để thêm.
              </div>
            ) : (
              <div className="space-y-3">
                {spoolUsages.map((u) => (
                  <div key={u.spool.id} className="flex flex-col sm:flex-row gap-3 p-4 bg-slate-50 dark:bg-[#1f2937] border border-slate-300 dark:border-slate-700 rounded-xl items-start sm:items-center">
                    <div className="flex-1">
                      <div className="font-mono text-sm font-bold text-indigo-400">{u.spool.id}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {u.spool.filamentBrand || ''} {u.spool.filamentType} - {u.spool.filamentColorName} (Còn: <span className="text-amber-400">{u.spool.remainingWeightG}g</span>)
                      </div>
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <input
                        type="number"
                        placeholder="Số gram"
                        value={u.weightG}
                        onChange={(e) => updateSpoolWeight(u.spool.id, e.target.value)}
                        className="w-full sm:w-28 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-sm rounded-lg px-3 py-2 focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                        min="0"
                        max={u.spool.remainingWeightG}
                      />
                      <span className="text-slate-500 text-sm mr-2">g</span>
                      <button onClick={() => removeSpool(u.spool.id)} className="p-2 text-red-400 hover:bg-red-950/50 rounded-lg transition-colors">
                        <X size={18} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 3. Thời gian in */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
              <Clock size={16} className="text-slate-500 dark:text-slate-400" /> 3. Thời Gian In (Ước tính)
            </label>
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <input
                  type="number"
                  placeholder="0"
                  value={durationH}
                  onChange={(e) => setDurationH(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-[#1f2937] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-base rounded-xl pl-4 pr-10 py-3 focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                  min="0"
                />
                <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none text-slate-500">Giờ</div>
              </div>
              <div className="flex-1 relative">
                <input
                  type="number"
                  placeholder="0"
                  value={durationM}
                  onChange={(e) => setDurationM(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-[#1f2937] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-base rounded-xl pl-4 pr-12 py-3 focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                  min="0"
                  max="59"
                />
                <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none text-slate-500">Phút</div>
              </div>
            </div>
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="w-full py-4 bg-amber-600 hover:bg-amber-500 text-slate-900 dark:text-white font-bold rounded-xl transition-all shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isSubmitting ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><PlayCircle size={20} /> BẮT ĐẦU IN</>}
          </button>
        </div>
      </div>

      <ScanBarcodeModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={processScannedCode}
        allSpoolIds={[]} // Not needed
        continuous={true} // Cho phép quét liên tiếp
      />

      <PrintHistories ref={historiesRef} />
    </div>
  );
}
