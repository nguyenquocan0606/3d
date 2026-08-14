'use client';

import React, { useEffect } from 'react';
import { X, Printer } from 'lucide-react';
import QRCodeImage from './barcode-image';

interface SpoolForPrint {
  id: string;
  filamentType: string;
  filamentColorName: string;
  filamentColorHex?: string | null;
  filamentBrand?: string | null;
}

interface PrintBarcodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  spool: SpoolForPrint | null;
  autoPrint?: boolean;
}

export default function PrintBarcodeModal({ isOpen, onClose, spool, autoPrint }: PrintBarcodeModalProps) {
  const [isPrinting, setIsPrinting] = React.useState(false);
  const [success, setSuccess] = React.useState(false);
  const [error, setError] = React.useState('');
  const [selectedSlot, setSelectedSlot] = React.useState<number | 'ALL' | null>(null);

  const sendPrintJob = async (slot: number | null) => {
    if (!spool) return false;
    let labelData: any = {};
    const printId = slot ? `${spool.id}-L${slot}` : spool.id;
    const printColor = slot ? `${spool.filamentColorName} - L${slot}` : spool.filamentColorName;

    if (spool.filamentType === 'MÁY IN 3D' || spool.filamentType === 'VỊ TRÍ KHO' || spool.filamentType === 'MÃ MÀU NHỰA') {
      labelData = {
        line1: printId,
        line2: spool.filamentType,
        line3: printColor
      };
    } else {
      labelData = {
        line1: printId,
        line2: `${spool.filamentBrand || ''} ${spool.filamentType}`.trim(),
        line3: printColor
      };
    }

    const res = await fetch('/api/print-jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        qrCode: printId,
        label: JSON.stringify(labelData),
        layout: slot ? 'printerSlot' : undefined,
        slotNumber: slot
      })
    });
    
    const data = await res.json();
    if (data.status !== 'success') {
      throw new Error(data.message || 'Lỗi khi tạo lệnh in');
    }
    return true;
  };

  const handlePrint = async () => {
    if (!spool) return;
    setIsPrinting(true);
    setError('');
    setSuccess(false);

    try {
      if (selectedSlot === 'ALL') {
        // In toàn bộ 4 line
        for (let i = 1; i <= 4; i++) {
          await sendPrintJob(i);
        }
      } else {
        await sendPrintJob(selectedSlot);
      }

      setSuccess(true);
      setTimeout(() => {
        onClose();
        setSuccess(false);
        setSelectedSlot(null);
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Lỗi kết nối máy chủ');
    } finally {
      setIsPrinting(false);
    }
  };

  useEffect(() => {
    if (isOpen && spool && autoPrint) {
      handlePrint();
    }
    // Chỉ auto-print khi mở modal — không đưa handlePrint vào deps để tránh in lặp
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, spool, autoPrint]);

  if (!isOpen || !spool) return null;

  // Tính printId duy nhất để render ra ảnh QR
  const uiPrintId = (selectedSlot && selectedSlot !== 'ALL') ? `${spool.id}-L${selectedSlot}` : spool.id;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs print:bg-white print:relative print:inset-auto print:z-0">
      {/* Modal Card */}
      <div className="relative w-full max-w-sm mx-4 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xl print:border-0 print:bg-white print:p-0 print:shadow-none print:max-w-full print:mx-0">
        
        {/* Close Button - Hidden in Print */}
        <div className="absolute top-4 right-4 w-8 h-8 print:hidden">
          <button 
            onClick={onClose}
            className="w-full h-full flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200 dark:bg-slate-800 rounded-full transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-5 flex items-center gap-2 print:hidden">
          <Printer className="text-indigo-400" size={18} />
          In Nhãn QR Code & Thông Tin
        </h3>

        {/* Printable Area Wrapper */}
        <div className="print-wrapper flex flex-col items-center justify-center gap-6 p-4 bg-slate-100 dark:bg-slate-900 border border-slate-800/80 rounded-xl shadow-inner text-black print:bg-white print:border-0 print:p-0 print:shadow-none print:gap-0">
          
          {/* Label 1 - QR Code Only */}
          <div className="print-label w-[240px] h-[180px] flex items-center justify-center p-3.5 bg-white border border-slate-200 rounded-xl font-sans print:border-0 print:w-[40mm] print:h-[30mm] print:p-1 print:rounded-none">
            {/* QR Code - Maximize space, no text */}
            <div className="w-full h-full flex items-center justify-center relative">
              <QRCodeImage 
                value={uiPrintId} 
                size={selectedSlot && selectedSlot !== 'ALL' ? 120 : 160} 
                margin={1} 
                theme="light" 
              />
              {selectedSlot && selectedSlot !== 'ALL' && (
                <div className="absolute right-2 text-5xl font-black text-slate-900">
                  {selectedSlot}
                </div>
              )}
            </div>
          </div>

          {/* Spacer Divider - Hidden in Print */}
          <div className="w-full border-t border-slate-200 dark:border-slate-800/60 my-1 print:hidden" />

          {/* Printer Line Selection - Hidden in Print */}
          {spool.filamentType === 'MÁY IN 3D' && (
            <div className="w-full px-4 print:hidden">
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Chọn loại mã in:</label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedSlot(null)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                    selectedSlot === null
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  Mã máy in
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedSlot('ALL')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                    selectedSlot === 'ALL'
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  In tất cả 4 Line
                </button>
                {[1, 2, 3, 4].map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setSelectedSlot(slot)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                      selectedSlot === slot
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    Line {slot}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Label 2 - Details or Giant Number */}
          <div className="print-label w-[240px] h-[180px] flex flex-col justify-between items-center py-5 px-3 bg-white border border-slate-200 rounded-xl font-sans print:border-0 print:w-[40mm] print:h-[30mm] print:py-2.5 print:px-2 print:rounded-none">
            {selectedSlot && selectedSlot !== 'ALL' ? (
               <div className="w-full h-full flex items-center justify-center">
                 <span className="text-[100px] font-black leading-none text-slate-900">{selectedSlot}</span>
               </div>
            ) : selectedSlot === 'ALL' ? (
               <div className="w-full h-full flex flex-col items-center justify-center text-center">
                 <span className="text-xl font-bold text-slate-900 mb-2">Chế độ in 4 tem</span>
                 <span className="text-sm text-slate-600">Sẽ tạo ra 8 nhãn in liên tục<br/>(tem QR và số cho 4 line)</span>
               </div>
            ) : (
              <>
                {/* Line 1: Material Type */}
                <div className="w-full text-center leading-none">
                  <span className="text-[20px] font-black uppercase tracking-wider text-slate-900 print:text-[14px] block truncate">
                    {spool.filamentType}
                  </span>
                </div>

                {/* Line 2: Color Name */}
                <div className="w-full text-center leading-none my-auto">
                  <span className="text-[20px] font-black uppercase tracking-wider text-slate-900 print:text-[14px] block truncate">
                    {spool.filamentColorName}
                  </span>
                </div>

                {/* Line 3: Spool ID */}
                <div className="w-full text-center leading-none">
                  <span className="text-[20px] font-black font-mono uppercase tracking-widest text-slate-800 print:text-[14px] block">
                    {spool.id}
                  </span>
                </div>
              </>
            )}
          </div>

        </div>

        {/* CSS styles for printing */}
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            header, main {
              display: none !important;
            }
            .print\\:hidden, button, h3 {
              display: none !important;
            }
            html, body {
              width: 40mm !important;
              margin: 0 !important;
              padding: 0 !important;
              background: white !important;
              overflow: visible !important;
            }
            .fixed.inset-0 {
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              width: 40mm !important;
              height: auto !important;
              background: none !important;
              backdrop-filter: none !important;
              display: block !important;
              padding: 0 !important;
              margin: 0 !important;
              border: 0 !important;
              z-index: auto !important;
            }
            .fixed.inset-0 > div {
              position: static !important;
              width: 40mm !important;
              height: auto !important;
              background: none !important;
              padding: 0 !important;
              margin: 0 !important;
              border: 0 !important;
              box-shadow: none !important;
              max-width: none !important;
              display: block !important;
            }
            .print-wrapper {
              display: block !important;
              width: 40mm !important;
              border: 0 !important;
              padding: 0 !important;
              margin: 0 !important;
              box-shadow: none !important;
              background: white !important;
            }
            .print-label {
              box-sizing: border-box !important;
              width: 40mm !important;
              height: 30mm !important;
              margin: 0 !important;
              padding: 1mm !important;
              background: white !important;
              display: flex !important;
              flex-direction: column !important;
              justify-content: space-between !important;
              align-items: center !important;
              page-break-after: always !important;
              break-after: page !important;
              page-break-inside: avoid !important;
            }
            .print-label:last-child {
              page-break-after: avoid !important;
              break-after: avoid !important;
              padding: 2.5mm 2mm !important;
            }
            .print-label canvas, .print-label img {
              width: 28mm !important;
              height: 28mm !important;
              max-width: 28mm !important;
              max-height: 28mm !important;
            }
            .print-color-exact {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            @page {
              size: 40mm 30mm;
              margin: 0;
            }
          }
        ` }} />

        {error && (
          <div className="mt-4 p-3 bg-red-950/40 border border-red-800 text-red-200 rounded-lg text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="mt-4 p-3 bg-emerald-950/40 border border-emerald-800 text-emerald-200 rounded-lg text-sm">
            Đã đẩy lệnh in thành công!
          </div>
        )}

        {/* Action Buttons - Hidden in Print */}
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-200 dark:border-slate-800 print:hidden">
          <div className="w-24 h-10">
            <button
              onClick={onClose}
              disabled={isPrinting}
              className="w-full h-full flex items-center justify-center bg-slate-200 dark:bg-slate-800 hover:bg-slate-750 text-slate-200 font-medium rounded-lg text-sm transition-colors cursor-pointer disabled:opacity-50"
            >
              Đóng
            </button>
          </div>
          <div className="w-40 h-10">
            <button
              onClick={handlePrint}
              disabled={isPrinting || success}
              className="w-full h-full flex items-center justify-center gap-2 bg-indigo-650 hover:bg-indigo-600 text-slate-900 dark:text-white font-medium rounded-lg text-sm transition-colors shadow-lg shadow-indigo-500/10 cursor-pointer disabled:opacity-50"
            >
              <Printer size={16} />
              {isPrinting ? 'Đang gửi...' : 'Gửi lệnh in'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
