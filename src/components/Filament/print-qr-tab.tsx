'use client';

import React, { useState } from 'react';
import { ScanBarcode, Printer, CheckCircle, Camera, X } from 'lucide-react';
import ScanBarcodeModal from '@/components/Filament/scan-barcode-modal';
import { colorCodeFor, findColorByCode, isColorCode } from '@/utils/color-code';

interface PrintQrTabProps {
  allSpools: any[];
  locations: any[];
  printers: any[];
  filaments: any[];
  globalScannedCode?: { code: string; timestamp: number } | null;
}

export default function PrintQrTab({
  allSpools,
  locations,
  printers,
  filaments,
  globalScannedCode
}: PrintQrTabProps) {
  const [scannedId, setScannedId] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [previewData, setPreviewData] = useState<{ id: string; label: string; type: string; payload: any } | null>(null);
  const [error, setError] = useState('');
  const [isPrinting, setIsPrinting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // Lắng nghe sự kiện quét toàn cục (ref giữ bản handler mới nhất — xem check-inventory-tab)
  const processScannedCodeRef = React.useRef<(code: string) => void>(() => {});
  React.useEffect(() => {
    if (globalScannedCode && globalScannedCode.code) {
      processScannedCodeRef.current(globalScannedCode.code);
    }
  }, [globalScannedCode]);

  const executePrint = async (printPayload: { id: string; label: string; type: string; payload: any }) => {
    setIsPrinting(true);
    setError('');
    setSuccessMsg('');

    try {
      const res = await fetch('/api/print-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qrCode: printPayload.id,
          label: JSON.stringify(printPayload.payload)
        })
      });

      const data = await res.json();
      if (data.status === 'success') {
        setSuccessMsg(`Đã gửi lệnh in tem thành công cho: ${printPayload.label}`);
        setPreviewData(printPayload);
      } else {
        setError(data.message || 'Lỗi khi gửi lệnh in');
      }
    } catch {
      setError('Lỗi kết nối máy chủ khi in tem');
    } finally {
      setIsPrinting(false);
    }
  };

  const normalizeCode = (input: string): string => {
    const cleanInput = input.replace(/-/g, '').toUpperCase().trim();
    if (!cleanInput) return input;

    // 1. Kiểm tra vị trí kho LOC- (VD: LOC01 -> LOC-01)
    const matchedLocation = locations.find(l => l.id.replace(/-/g, '').toUpperCase() === cleanInput);
    if (matchedLocation) return matchedLocation.id;

    // 2. Kiểm tra máy in PRT- (VD: PRT01 -> PRT-01)
    const matchedPrinter = printers.find(p => p.id.replace(/-/g, '').toUpperCase() === cleanInput);
    if (matchedPrinter) return matchedPrinter.id;

    // Kiểm tra Printer Slot (VD: PRT01L1 -> PRT-01-L1)
    const slotMatch = cleanInput.match(/^(.*)L([1-4])$/);
    if (slotMatch) {
      const pId = slotMatch[1];
      const foundP = printers.find(p => p.id.replace(/-/g, '').toUpperCase() === pId);
      if (foundP) return `${foundP.id}-L${slotMatch[2]}`;
    }

    // 3. Kiểm tra mã màu CLR- (VD: CLRRED -> CLR-RED).
    // Màu nhiều chữ ("FOREST GREEN") không thể tự chắp lại từ chuỗi đã bỏ hết
    // gạch nối, nên phải dò theo danh sách màu thật để lấy lại mã chuẩn.
    if (isColorCode(input)) {
      const matchedColor = findColorByCode(filaments, input, (f: any) => f.colorName);
      if (matchedColor) return colorCodeFor(matchedColor.colorName);
      return input.trim().toUpperCase();
    }

    // 4. Kiểm tra cuộn nhựa (VD: PLAWHT01 -> PLA-WHT-01)
    const matchedSpool = allSpools.find(s => s.id.replace(/-/g, '').toUpperCase() === cleanInput);
    if (matchedSpool) return matchedSpool.id;

    return input;
  };

  const processScannedCode = (code: string) => {
    if (!code.trim()) return;
    
    const normalizedCode = normalizeCode(code);
    setIsSearching(true);
    setError('');
    setSuccessMsg('');
    setPreviewData(null);

    const upperScanned = normalizedCode.trim().toUpperCase();
    const isLocation = upperScanned.startsWith('LOC-');
    const isPrinterQR = upperScanned.startsWith('PRT-');
    const isColorQR = upperScanned.startsWith('CLR-');

    setTimeout(() => {
      if (isLocation) {
        const found = locations.find(l => l.id.toUpperCase() === upperScanned);
        if (found) {
          const newPreview = { 
            id: found.id, 
            label: found.name, 
            type: 'Kho lưu trữ',
            payload: { line1: found.id, line2: 'VỊ TRÍ KHO', line3: found.name }
          };
          executePrint(newPreview);
        } else {
          setError(`Không tìm thấy kho: ${upperScanned}`);
        }
      } else if (isPrinterQR) {
        let isSlot = false;
        let pId = upperScanned;
        let slotNum = '';
        const smatch = upperScanned.match(/^(.*)-L([1-4])$/);
        if (smatch) {
          isSlot = true;
          pId = smatch[1];
          slotNum = smatch[2];
        }

        const found = printers.find(p => p.id.toUpperCase() === pId);
        if (found) {
          const newPreview = { 
            id: upperScanned, 
            label: isSlot ? `${found.name} (Line ${slotNum})` : found.name, 
            type: 'Máy in 3D',
            payload: { line1: upperScanned, line2: 'MÁY IN 3D', line3: isSlot ? `${found.name} - L${slotNum}` : found.name }
          };
          executePrint(newPreview);
        } else {
          setError(`Không tìm thấy máy in: ${upperScanned}`);
        }
      } else if (isColorQR) {
        // Ưu tiên tên màu thật trong DB để tem in ra luôn đúng chuẩn, kể cả khi
        // tem cũ quét vào ghi sai dấu cách/gạch nối.
        const matchedColor = findColorByCode(filaments, upperScanned, (f: any) => f.colorName);
        const colorName = matchedColor ? matchedColor.colorName.toUpperCase() : upperScanned.substring(4);
        const printId = matchedColor ? colorCodeFor(matchedColor.colorName) : upperScanned;
        const newPreview = {
          id: printId,
          label: `Màu ${colorName}`,
          type: 'Mã màu nhựa',
          payload: { line1: printId, line2: 'MÃ MÀU NHỰA', line3: colorName }
        };
        executePrint(newPreview);
      } else {
        // Cuộn nhựa
        const found = allSpools.find(s => s.id.toUpperCase() === upperScanned);
        if (found) {
          const label = `${found.filamentBrand || ''} ${found.filamentType} - ${found.filamentColorName}`.trim();
          const newPreview = { 
            id: found.id, 
            label, 
            type: 'Cuộn nhựa',
            payload: { 
              line1: found.id, 
              line2: `${found.filamentBrand || ''} ${found.filamentType}`.trim(), 
              line3: found.filamentColorName 
            }
          };
          executePrint(newPreview);
        } else {
          setError(`Không tìm thấy cuộn nhựa: ${upperScanned}`);
        }
      }
      setIsSearching(false);
    }, 300);
  };

  // Cập nhật ref sau mỗi render để effect quét luôn gọi bản handler mới nhất
  React.useEffect(() => {
    processScannedCodeRef.current = processScannedCode;
  });

  const handleScan = (e: React.FormEvent) => {
    e.preventDefault();
    const code = scannedId.trim();
    if (code) {
      setScannedId('');
      processScannedCode(code);
    }
  };

  const handlePrint = async () => {
    if (!previewData) return;
    await executePrint(previewData);
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        {/* Header background gradient */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
        
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-indigo-500/10 rounded-xl text-indigo-400">
            <Printer size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">In Tem QR Code</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Quét mã cần in lại để tạo lệnh in tự động</p>
          </div>
        </div>

        {/* Form nhập liệu quét mã */}
        <form onSubmit={handleScan} className="mb-8">
          <label className="block text-sm font-medium text-slate-350 mb-2">
            Quét hoặc nhập mã QR
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <ScanBarcode size={18} />
              </div>
              <input
                type="text"
                value={scannedId}
                onChange={(e) => setScannedId(e.target.value)}
                placeholder="Ví dụ: LOC-65L, C-PLA-R-01..."
                className="w-full bg-[#1f2937] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-base rounded-xl pl-10 pr-4 py-3 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-mono uppercase tracking-wider"
              />
            </div>
            <button
              type="button"
              onClick={() => setIsScannerOpen(true)}
              className="px-4 py-3 bg-slate-200 dark:bg-slate-800 hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl transition-all border border-slate-300 dark:border-slate-700"
              title="Quét Camera"
            >
              <Camera size={20} />
            </button>
            <button
              type="submit"
              disabled={!scannedId.trim() || isSearching}
              className="px-6 py-3 bg-indigo-650 hover:bg-indigo-600 text-slate-900 dark:text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[100px]"
            >
              {isSearching ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                'Tìm kiếm'
              )}
            </button>
          </div>
        </form>

        {/* Thông báo lỗi & thành công */}
        {error && (
          <div className="p-4 mb-6 bg-red-950/40 border border-red-800 text-red-200 rounded-xl text-sm animate-in slide-in-from-top-2">
            {error}
          </div>
        )}
        
        {successMsg && (
          <div className="p-4 mb-6 bg-emerald-950/40 border border-emerald-800 text-emerald-200 rounded-xl text-sm flex items-center gap-2 animate-in slide-in-from-top-2">
            <CheckCircle size={18} className="text-emerald-500" />
            {successMsg}
          </div>
        )}

        {/* Bản xem trước tem vừa in gần đây */}
        {previewData && (
          <div className="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
                Xem trước tem vừa in
              </h3>
              <button 
                onClick={() => setPreviewData(null)} 
                className="text-slate-450 hover:text-slate-900 dark:text-white transition-colors"
                title="Đóng bản xem trước"
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="bg-white dark:bg-[#111827] rounded-xl p-5 text-center border border-slate-800/80 max-w-md mx-auto">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{previewData.type}</p>
              <p className="text-3xl font-mono font-bold text-indigo-400 mb-2 tracking-wider">{previewData.id}</p>
              <p className="text-sm text-slate-700 dark:text-slate-300 font-semibold">{previewData.label}</p>
            </div>

            <div className="flex justify-end gap-3 max-w-md mx-auto">
              {/* Container-First Sizing cho nút in lại */}
              <div className="h-10 w-32">
                <button 
                  onClick={handlePrint}
                  disabled={isPrinting}
                  className="w-full h-full flex items-center justify-center gap-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                  title="In lại tem này nếu tem in ra bị lỗi vật lý"
                >
                  {isPrinting ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Printer size={12} />
                      In lại tem
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <ScanBarcodeModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={processScannedCode}
        allSpoolIds={[]} // Not needed
        continuous={true} // Bật chế độ quét liên tục không tắt camera
      />
    </div>
  );
}
