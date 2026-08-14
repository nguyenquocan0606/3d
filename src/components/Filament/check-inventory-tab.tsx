'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Scan, Camera, RefreshCw, CheckCircle, AlertTriangle, Edit2, Trash2, Search, SlidersHorizontal, History, Info, X
} from 'lucide-react';
import { Spool } from '@/types/filament.types';
import ScanBarcodeModal from '@/components/Filament/scan-barcode-modal';
import { filterAndSortSpoolsForInventory, SpoolForInventory } from '@/utils/inventory-helpers';

interface CheckInventoryTabProps {
  allSpools: SpoolForInventory[];
  onEditSpool: (spool: Spool) => void;
  onDeleteSpool: (id: string) => void;
  onSuccess: () => void;
  globalScannedCode?: { code: string; timestamp: number } | null;
}

export default function CheckInventoryTab({
  allSpools,
  onEditSpool,
  onDeleteSpool,
  globalScannedCode
}: CheckInventoryTabProps) {
  const [scannedMap, setScannedMap] = useState<Record<string, boolean>>({});
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAllStatuses, setShowAllStatuses] = useState(false);
  
  // State for filtering by scan status: 'all' | 'scanned' | 'unscanned'
  const [filterScanStatus, setFilterScanStatus] = useState<'all' | 'scanned' | 'unscanned'>('all');
  
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [scannedHistory, setScannedHistory] = useState<Array<{ id: string; name: string; time: string }>>([]);
  const [isFetchingSession, setIsFetchingSession] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  // 1. Fetch current active session from database
  const fetchSession = async (silent = false) => {
    if (!silent) setIsFetchingSession(true);
    try {
      const res = await fetch('/api/inventory/session');
      const data = await res.json();
      if (data.status === 'success' && data.data) {
        const items = data.data.items || [];
        
        // Build new scannedMap
        const newMap: Record<string, boolean> = {};
        items.forEach((item: any) => {
          newMap[item.spoolId] = true;
        });
        setScannedMap(newMap);

        // Build history from items
        const history = items
          .map((item: any) => {
            const spool = allSpools.find(s => s.id.toUpperCase() === item.spoolId.toUpperCase());
            const timeStr = new Date(item.scannedAt).toLocaleTimeString([], { 
              hour: '2-digit', 
              minute: '2-digit', 
              second: '2-digit' 
            });
            return {
              id: item.spoolId,
              name: spool 
                ? `${spool.filamentBrand || ''} ${spool.filamentType} - ${spool.filamentColorName}`
                : 'Đang tải thông tin cuộn...',
              time: timeStr
            };
          })
          .slice(0, 5); // Show latest 5 scans
        
        setScannedHistory(history);
      }
    } catch (err) {
      console.error('Error fetching inventory session:', err);
    } finally {
      if (!silent) setIsFetchingSession(false);
    }
  };

  // Ref giữ bản mới nhất của fetchSession để interval không bị đóng băng closure cũ
  const fetchSessionRef = useRef(fetchSession);
  useEffect(() => {
    fetchSessionRef.current = fetchSession;
  });

  // Fetch initial session on mount
  useEffect(() => {
    fetchSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch session again when spools list changes from parent (e.g. after edit/delete)
  useEffect(() => {
    fetchSession(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSpools]);

  // 2. Polling đồng bộ đa thiết bị: interval cố định (không tạo lại khi allSpools đổi),
  // chỉ poll khi tab đang hiển thị để tránh tải server vô ích
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchSessionRef.current(true);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // Lắng nghe sự kiện quét toàn cục từ súng quét / camera trang chính.
  // Dùng ref giữ bản mới nhất của handleScanCode: effect chỉ chạy khi có mã quét mới
  // (thêm handler vào deps sẽ khiến mã cũ bị xử lý lại khi state khác thay đổi).
  const handleScanCodeRef = useRef<(code: string) => void>(() => {});
  useEffect(() => {
    if (globalScannedCode && globalScannedCode.code) {
      handleScanCodeRef.current(globalScannedCode.code);
    }
  }, [globalScannedCode]);

  const normalizeSpoolId = (input: string): string => {
    const cleanInput = input.replace(/-/g, '').toUpperCase().trim();
    if (!cleanInput) return input;

    // 1. Kiểm tra QR lệnh CMD-
    if (cleanInput.startsWith('CMDINV')) {
      const invCmd = cleanInput.substring(6);
      return `CMD-INV-${invCmd}`;
    }

    // 2. Tìm kiếm cuộn nhựa
    const matched = allSpools.find(s => s.id.replace(/-/g, '').toUpperCase() === cleanInput);
    return matched ? matched.id : input;
  };

  const handleResetCheck = async () => {
    window.dispatchEvent(new CustomEvent('appConfirm', {
      detail: {
        title: 'Làm mới phiên kiểm kho',
        message: 'Bạn có chắc chắn muốn làm mới (reset) lại phiên kiểm kho này? Trạng thái quét của các cuộn nhựa sẽ được xóa sạch trên tất cả thiết bị.',
        onConfirm: async () => {
          setErrorMsg('');
          setSuccessMsg('');
          try {
            const res = await fetch('/api/inventory/session', {
              method: 'DELETE'
            });
            const data = await res.json();
            if (data.status === 'success') {
              setSuccessMsg('Đã làm mới phiên kiểm kho thành công.');
              setScannedMap({});
              setScannedHistory([]);
              setManualInput('');
              setSearchQuery('');
              setFilterScanStatus('all');
              await fetchSession(true);
            } else {
              setErrorMsg(data.message || 'Lỗi khi làm mới phiên kiểm kho');
            }
          } catch {
            setErrorMsg('Lỗi kết nối máy chủ khi làm mới.');
          }
          setTimeout(() => {
            inputRef.current?.focus();
          }, 50);
        }
      }
    }));
  };

  const handleScanCode = async (code: string) => {
    if (!code.trim()) return;

    const normalizedCode = normalizeSpoolId(code);
    const upperCode = normalizedCode.trim().toUpperCase();
    setErrorMsg('');
    setSuccessMsg('');

    // Xử lý các mã QR lệnh riêng cho tab kiểm kho
    if (upperCode.startsWith('CMD-INV-')) {
      if (upperCode === 'CMD-INV-RESET') {
        handleResetCheck();
      } else if (upperCode === 'CMD-INV-TOGGLE-ALL') {
        setShowAllStatuses(prev => !prev);
        setSuccessMsg('Đã chuyển đổi phạm vi hiển thị kiểm kho.');
      }
      return;
    }

    try {
      const res = await fetch('/api/inventory/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spoolId: normalizedCode.trim() })
      });
      const data = await res.json();

      if (data.status === 'success' && data.data) {
        const { spool } = data.data;
        setSuccessMsg(`Đã quét thành công: ${spool.id} (${spool.filamentType} - ${spool.filamentColorName})`);
        setManualInput('');
        
        // Instant sync pull to make UI responsive
        await fetchSession(true);

        setTimeout(() => {
          inputRef.current?.focus();
        }, 50);
      } else {
        setErrorMsg(data.message || `Lỗi khi quét cuộn nhựa "${code}"`);
      }
    } catch {
      setErrorMsg('Lỗi kết nối máy chủ khi thực hiện quét.');
    }
  };

  // Cập nhật ref sau mỗi render để effect quét luôn gọi bản handler mới nhất
  useEffect(() => {
    handleScanCodeRef.current = handleScanCode;
  });

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = manualInput.trim();
    if (code) {
      setManualInput('');
      setErrorMsg('');
      setSuccessMsg('');
      handleScanCode(code);
    }
  };

  // 4. Reset/Archive session in DB

  // Calculations for stats
  const targetSpools = allSpools.filter(s => showAllStatuses ? true : s.status === 'active');
  const totalCount = targetSpools.length;
  const scannedCount = targetSpools.filter(s => !!scannedMap[s.id]).length;
  const unscannedCount = totalCount - scannedCount;
  const progressPercent = totalCount > 0 ? (scannedCount / totalCount) * 100 : 0;

  // Filter & Sort for table rendering (incorporating filterScanStatus state)
  const processedSpools = filterAndSortSpoolsForInventory(
    allSpools,
    scannedMap,
    searchQuery,
    showAllStatuses,
    filterScanStatus
  );

  return (
    <div className="w-full space-y-6 animate-in fade-in zoom-in-95 duration-300">
      
      {/* Overview Stats Block */}
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-500" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-400">
              <Scan size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Kiểm Kho Nhựa
                {isFetchingSession && (
                  <span className="inline-block w-4 h-4 border-2 border-slate-500 border-t-transparent rounded-full animate-spin ml-2" />
                )}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 font-sans">Đồng bộ tự động theo phiên giữa các thiết bị. Click các ô thống kê để lọc danh sách cuộn.</p>
            </div>
          </div>
          
          {/* Actions */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-44">
              <button
                type="button"
                onClick={handleResetCheck}
                className="w-full h-full flex items-center justify-center gap-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
              >
                <RefreshCw size={14} />
                Làm mới kiểm kho
              </button>
            </div>
          </div>
        </div>

        {/* Progress Grid - Interactive Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-6 pt-6 border-t border-slate-800/80">
          {/* Card 1: Total spools */}
          <div 
            onClick={() => setFilterScanStatus('all')}
            className={`cursor-pointer rounded-xl p-4 flex flex-col justify-between transition-all select-none border ${
              filterScanStatus === 'all'
                ? 'bg-slate-900/80 border-indigo-500/60 shadow-lg shadow-indigo-500/5 ring-1 ring-indigo-500/30'
                : 'bg-slate-100/80 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800/60 hover:border-slate-600'
            }`}
          >
            <div className="flex justify-between items-start">
              <span className="text-xs font-semibold text-slate-450 uppercase tracking-wider">Tổng số cuộn nhựa</span>
              {filterScanStatus === 'all' && (
                <span className="text-[10px] bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded font-bold">ĐANG LỌC</span>
              )}
            </div>
            <p className="text-3xl font-bold text-slate-900 dark:text-white mt-2">{totalCount}</p>
          </div>
          
          {/* Card 2: Scanned spools */}
          <div 
            onClick={() => setFilterScanStatus('scanned')}
            className={`cursor-pointer rounded-xl p-4 flex flex-col justify-between transition-all select-none border ${
              filterScanStatus === 'scanned'
                ? 'bg-emerald-950/20 border-emerald-500/60 shadow-lg shadow-emerald-500/5 ring-1 ring-emerald-500/30'
                : 'bg-slate-100/80 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800/60 hover:border-emerald-550/40'
            }`}
          >
            <div className="flex justify-between items-start">
              <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Đã quét kiểm kê</span>
              {filterScanStatus === 'scanned' && (
                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-bold">ĐANG LỌC</span>
              )}
            </div>
            <div className="flex items-baseline justify-between mt-2">
              <p className="text-3xl font-bold text-emerald-400">{scannedCount}</p>
              <span className="text-xs text-slate-500 font-medium">{(progressPercent).toFixed(0)}%</span>
            </div>
          </div>

          {/* Card 3: Unscanned spools */}
          <div 
            onClick={() => setFilterScanStatus('unscanned')}
            className={`cursor-pointer rounded-xl p-4 flex flex-col justify-between transition-all select-none border ${
              filterScanStatus === 'unscanned'
                ? 'bg-amber-950/20 border-amber-500/60 shadow-lg shadow-amber-500/5 ring-1 ring-amber-500/30'
                : 'bg-[#1c1917]/20 border-slate-200 dark:border-slate-800/60 hover:border-amber-500/40'
            }`}
          >
            <div className="flex justify-between items-start">
              <span className="text-xs font-semibold text-amber-500 uppercase tracking-wider">Chưa quét (Cần tìm)</span>
              {filterScanStatus === 'unscanned' && (
                <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-bold">ĐANG LỌC</span>
              )}
            </div>
            <p className="text-3xl font-bold text-amber-500 mt-2">{unscannedCount}</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full mt-6">
          <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Inputs / Scan Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Form Panel: Scan Input */}
        <div className="lg:col-span-2 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            Quét mã cuộn nhựa
          </h3>

          <form onSubmit={handleManualSubmit} className="flex gap-2">
            {/* Input Wrapper matching Container-First Sizing */}
            <div className="relative flex-1 h-12">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500">
                <Scan size={18} />
              </div>
              <input
                ref={inputRef}
                type="text"
                value={manualInput}
                onChange={(e) => {
                  setManualInput(e.target.value);
                  setErrorMsg('');
                }}
                placeholder="Nhập mã cuộn (VD: PLA-RED-01) hoặc dùng súng quét..."
                className="w-full h-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-base rounded-xl pl-11 pr-4 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-mono uppercase tracking-wider"
              />
            </div>
            
            {/* Camera Button Wrapper matching Container-First Sizing */}
            <div className="h-12 w-14">
              <button
                type="button"
                onClick={() => setIsScannerOpen(true)}
                className="w-full h-full flex items-center justify-center bg-slate-200 dark:bg-slate-800 hover:bg-slate-750 text-slate-350 hover:text-slate-900 dark:text-white rounded-xl transition-all border border-slate-750 cursor-pointer"
                title="Quét bằng camera điện thoại"
              >
                <Camera size={20} />
              </button>
            </div>

            {/* Confirm Button Wrapper matching Container-First Sizing */}
            <div className="h-12 w-28">
              <button
                type="submit"
                disabled={!manualInput.trim()}
                className="w-full h-full flex items-center justify-center bg-indigo-650 hover:bg-indigo-600 text-slate-900 dark:text-white font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                Xác nhận
              </button>
            </div>
          </form>

          {/* Feedback alerts */}
          {errorMsg && (
            <div className="p-4 bg-red-950/40 border border-red-800 text-red-200 rounded-xl text-sm flex items-start gap-2.5 animate-in slide-in-from-top-2">
              <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-4 bg-emerald-950/40 border border-emerald-800 text-emerald-200 rounded-xl text-sm flex items-center gap-2.5 animate-in slide-in-from-top-2">
              <CheckCircle size={18} className="text-emerald-550 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}
        </div>

        {/* Right Panel: Recent Scan History */}
        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2 mb-4">
              <History size={16} className="text-slate-500 dark:text-slate-400" />
              Lịch sử quét gần đây
            </h3>
            
            {scannedHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-slate-500">
                <Info size={28} className="text-slate-650 mb-2" />
                <p className="text-xs text-center font-sans">Chưa có cuộn nhựa nào được quét trong phiên này.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {scannedHistory.map((item, index) => (
                  <div 
                    key={`${item.id}-${index}`} 
                    className="flex items-center justify-between p-2.5 bg-slate-900/60 border border-slate-800/80 rounded-xl text-xs animate-in fade-in duration-200"
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <p className="font-mono font-bold text-slate-200 truncate">{item.id}</p>
                      <p className="text-slate-450 truncate mt-0.5 font-sans">{item.name}</p>
                    </div>
                    <span className="text-slate-500 font-mono shrink-0">{item.time}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Filters and List */}
      <div className="space-y-4">
        
        {/* Filter Controls Bar */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-stretch sm:items-center bg-slate-100/80 dark:bg-slate-900/40 p-4 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <div className="flex flex-col sm:flex-row gap-3 flex-1 items-center">
            {/* Search Input Container matching Container-First Sizing */}
            <div className="relative flex-1 h-10 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-550" size={16} />
              <input
                type="text"
                placeholder="Lọc danh sách cuộn nhựa..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-full bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg pl-10 pr-4 text-sm text-slate-200 placeholder-slate-505 focus:outline-hidden focus:border-indigo-500 transition-colors"
              />
            </div>
            
            {/* Active scan status filter badge */}
            {filterScanStatus !== 'all' && (
              <div className="flex items-center gap-2 text-xs font-semibold bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 px-3 py-2 rounded-xl shrink-0">
                <span>
                  Đang lọc: {filterScanStatus === 'scanned' ? 'Đã quét' : 'Chưa quét'}
                </span>
                <button 
                  onClick={() => setFilterScanStatus('all')}
                  className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white transition-colors"
                  title="Xóa bộ lọc"
                >
                  <X size={12} />
                </button>
              </div>
            )}
            
            {/* Toggle Status Scope */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <SlidersHorizontal size={14} className="text-slate-550 shrink-0" />
              <select
                value={showAllStatuses ? 'ALL' : 'ACTIVE'}
                onChange={(e) => setShowAllStatuses(e.target.value === 'ALL')}
                className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-300 focus:outline-hidden focus:border-indigo-500 w-full sm:w-auto"
              >
                <option value="ACTIVE">Chỉ cuộn đang dùng (Active)</option>
                <option value="ALL">Tất cả trạng thái (Bao gồm hết nhựa/lưu trữ)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Spools Table */}
        {processedSpools.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 border border-dashed border-slate-200 dark:border-slate-850 rounded-2xl bg-slate-100/30 dark:bg-slate-900/10">
            <Info size={40} className="text-slate-650 mb-3" />
            <p className="text-sm text-slate-500 font-sans">Không tìm thấy cuộn nhựa nào phù hợp với phạm vi kiểm kho.</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xl w-full">
            <div className="overflow-x-auto font-sans">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-900/40 text-xs font-semibold text-slate-405 tracking-wider">
                    <th className="py-3.5 px-4 font-mono">Mã cuộn (ID)</th>
                    <th className="py-3.5 px-4 font-sans">Loại</th>
                    <th className="py-3.5 px-4 font-sans">Thương hiệu</th>
                    <th className="py-3.5 px-4 font-sans">Màu</th>
                    <th className="py-3.5 px-4 text-center font-sans">Trạng thái quét</th>
                    <th className="py-3.5 px-4 text-center font-sans">Nhựa còn lại</th>
                    <th className="py-3.5 px-4 text-right font-sans">Thao tác đối với cuộn</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 text-sm text-slate-700 dark:text-slate-300">
                  {processedSpools.map((spool) => {
                    const isScanned = !!scannedMap[spool.id];
                    const percent = (spool.remainingWeightG / spool.initialWeightG) * 100;
                    
                    return (
                      <tr 
                        key={spool.id} 
                        className={`transition-colors duration-150 ${
                          isScanned 
                            ? 'bg-emerald-950/5 hover:bg-emerald-950/10 text-slate-500 dark:text-slate-400' 
                            : 'hover:bg-slate-100/50 dark:bg-slate-900/20'
                        }`}
                      >
                        <td className="py-4 px-4 font-mono font-bold text-slate-101 whitespace-nowrap">
                          {spool.id}
                        </td>

                        <td className="py-4 px-4">
                          <span className="text-xs px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-semibold uppercase">
                            {spool.filamentType}
                          </span>
                        </td>

                        <td className="py-4 px-4 text-slate-500 dark:text-slate-400">
                          {spool.filamentBrand || '—'}
                        </td>

                        <td className="py-4 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <div 
                              className="w-12 h-5 rounded-md border border-slate-200 dark:border-slate-800 shadow-sm shrink-0"
                              style={{ backgroundColor: spool.filamentColorHex || '#4f46e5' }}
                              title={spool.filamentColorName}
                            />
                            <span className="font-medium text-slate-200">{spool.filamentColorName}</span>
                          </div>
                        </td>

                        <td className="py-4 px-4 text-center whitespace-nowrap">
                          {isScanned ? (
                            <span className="text-[10px] px-2.5 py-1 rounded-full font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 inline-flex items-center gap-1">
                              <CheckCircle size={10} />
                              ĐÃ QUÉT
                            </span>
                          ) : (
                            <span className="text-[10px] px-2.5 py-1 rounded-full font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20 inline-flex items-center gap-1">
                              <AlertTriangle size={10} />
                              CHƯA QUÉT
                            </span>
                          )}
                        </td>

                        <td className="py-4 px-4">
                          <div className="flex flex-col items-center justify-center min-w-[100px]">
                            <span className="font-semibold text-slate-200 text-xs">
                              {spool.remainingWeightG}g / {spool.initialWeightG}g
                            </span>
                            <div className="w-20 h-1 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden mt-1.5">
                              <div 
                                className={`h-full bg-gradient-to-r ${
                                  percent > 50 
                                    ? 'from-indigo-500 to-emerald-500' 
                                    : percent > 20 
                                      ? 'from-amber-500 to-orange-500' 
                                      : 'from-rose-500 to-red-500'
                                }`}
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        <td className="py-4 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2.5">
                            <button
                              onClick={() => onEditSpool(spool as any)}
                              className="p-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded-lg transition-colors border border-amber-500/20 cursor-pointer"
                              title="Chỉnh sửa cuộn nhựa"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={() => onDeleteSpool(spool.id)}
                              className="p-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors border border-red-500/20 cursor-pointer"
                              title="Xóa cuộn nhựa"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Integrate Scanner Modal */}
      <ScanBarcodeModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={handleScanCode}
        allSpoolIds={allSpools.map(s => s.id)}
        continuous={true} // Keep camera scanner open to scan continuously
      />

    </div>
  );
}
