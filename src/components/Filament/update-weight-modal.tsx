'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, Scale, Calculator } from 'lucide-react';
import { useScale } from '@/components/scale-provider';
interface UpdateWeightModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  selectedSpool: any | null;
  globalScannedCode?: { code: string; timestamp: number } | null;
  onScanSpool?: (spoolId: string) => void;
}

export default function UpdateWeightModal({ 
  isOpen, 
  onClose, 
  onSuccess, 
  selectedSpool,
  globalScannedCode,
  onScanSpool
}: UpdateWeightModalProps) {
  const [remainingWeight, setRemainingWeight] = useState(0);
  const [emptyWeight, setEmptyWeight] = useState(0);
  const [brand, setBrand] = useState('');
  const [totalWeighed, setTotalWeighed] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<'calculated' | 'direct'>('calculated'); // Default to calculated mode for faster weighing flow
  const [locations, setLocations] = useState<Array<{ id: string; name: string }>>([]);
  const [printers, setPrinters] = useState<Array<{ id: string; name: string }>>([]);
  const [locationId, setLocationId] = useState<string>('');
  const [printerId, setPrinterId] = useState<string>('');

  // Lấy dữ liệu live từ MQTT (dùng chung 1 kết nối qua ScaleProvider)
  // steadyWeight: số đã lọc nhiễu, không nhảy lăng tăng khi đang cân
  const { steadyWeight: liveWeight, isConnected: isScaleConnected } = useScale();

  const liveWeightRef = React.useRef(0);
  useEffect(() => {
    liveWeightRef.current = liveWeight;
  }, [liveWeight]);

  /**
   * QUY TẮC: cân đang âm nghĩa là cân chưa được trừ bì (tare) hoặc đang bị lệch,
   * số đọc lúc đó không đáng tin -> KHÔNG lấy số cân khi quét, không lưu gì cả.
   * Trả về số gram đã làm tròn, hoặc null nếu không được phép dùng.
   */
  const readScaleForScan = (): number | null => {
    const rounded = Math.round(liveWeightRef.current);
    if (rounded < 0) {
      setError(`Cân đang âm (${rounded}g) — hãy trừ bì (tare) lại cân rồi quét lại. Chưa lưu gì cả.`);
      return null;
    }
    return rounded;
  };

  // Refs để tự động focus và bôi đen (select) dữ liệu
  const totalInputRef = React.useRef<HTMLInputElement>(null);
  const remainingInputRef = React.useRef<HTMLInputElement>(null);
  const emptyInputRef = React.useRef<HTMLInputElement>(null);
  const hiddenInputRef = React.useRef<HTMLInputElement>(null);

  // States hỗ trợ súng quét nhập số và lệnh
  const [activeField, setActiveField] = useState<'total' | 'remaining' | 'empty'>('total');
  const [isFirstDigit, setIsFirstDigit] = useState(true);
  const [isAudioBlocked, setIsAudioBlocked] = useState(false);

  // Ref lưu đối tượng âm thanh đang phát để dừng kịp thời khi quét nhanh
  const currentAudioRef = React.useRef<HTMLAudioElement | null>(null);

  // Phát âm thanh đọc chữ số/lệnh tiếng Việt offline (tốc độ tức thời, 100% không trễ mạng)
  const speakText = (text: string) => {
    if (typeof window !== 'undefined') {
      try {
        if (currentAudioRef.current) {
          currentAudioRef.current.pause(); // Dừng phát âm trước đó
          currentAudioRef.current.onended = null; // Gỡ bỏ listener tránh lặp đè
        }

        // Ánh xạ các cụm từ sang file âm thanh offline tương ứng trong /public/audio/
        const audioMap: Record<string, string> = {
          'Khối lượng vỏ': 'tab_empty',
          'Tổng cân': 'tab_total',
          'Nhựa còn lại': 'tab_remaining',
          'Đã lưu': 'done',
          'Đổi cuộn': 'spool',
          'Âm thanh đã kích hoạt': 'active'
        };

        if (audioMap[text]) {
          const audio = new Audio(`/audio/${audioMap[text]}.mp3`);
          audio.playbackRate = 1.35;
          currentAudioRef.current = audio;
          audio.play()
            .then(() => setIsAudioBlocked(false))
            .catch((err) => {
              console.log('Audio autoplay blocked:', err);
              setIsAudioBlocked(true);
            });
        } 
        // Nếu là số (quét số đơn lẻ hoặc chuỗi chữ số)
        else if (/^[0-9]+$/.test(text)) {
          const digits = text.split('');
          let index = 0;
          const playNext = () => {
            if (index < digits.length) {
              const digit = digits[index];
              index++;
              const audio = new Audio(`/audio/${digit}.mp3`);
              audio.playbackRate = 1.35;
              currentAudioRef.current = audio;
              audio.play()
                .then(() => setIsAudioBlocked(false))
                .catch((err) => {
                  console.log('Audio play blocked:', err);
                  setIsAudioBlocked(true);
                });
              audio.onended = () => {
                setTimeout(playNext, 60); // Giãn cách 60ms giữa các chữ số
              };
            }
          };
          playNext();
        }
      } catch (err) {
        console.error('TTS error:', err);
      }
    }
  };

  // Tự động chuyển active field tương ứng với mode được chọn
  useEffect(() => {
    if (mode === 'calculated') {
      setActiveField('total');
    } else {
      setActiveField('remaining');
    }
    setIsFirstDigit(true);
  }, [mode]);

  // Tự động thực hiện focus thật sự vào ô ẩn chuyên nhận quét từ máy quét
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        hiddenInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, selectedSpool]);

  useEffect(() => {
    if (selectedSpool) {
      setRemainingWeight(selectedSpool.remainingWeightG);
      setEmptyWeight(selectedSpool.emptySpoolWeightG);
      setBrand(selectedSpool.filamentBrand || '');
      setTotalWeighed('');
      setLocationId(selectedSpool.locationId || '');
      setPrinterId(selectedSpool.printerId || '');
      setError('');
      setIsFirstDigit(true);
      if (mode === 'calculated') {
        setActiveField('total');
      } else {
        setActiveField('remaining');
      }

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
    // Chỉ reset form khi ĐỔI cuộn — không reset khi đổi mode (mode xử lý ở effect riêng)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSpool]);

  // Lắng nghe sự kiện quét mã QR/Barcode từ súng quét chuyển tiếp qua globalScannedCode (khi không focus vào input).
  // Ref giữ bản handler mới nhất: effect chỉ chạy khi có mã quét mới, nhưng luôn gọi
  // logic với state hiện hành (tránh closure cũ do handler khai báo phía dưới).
  const scanHandlersRef = useRef<{
    handleNumberScan: (num: string) => void;
    handleTabScan: () => void;
    handleDoneScan: () => void;
    handleCalculateWeight: (val: string) => void;
    submitData: (overrideRemaining?: number) => void;
    readScaleForScan: () => number | null;
    emptyWeight: number;
  } | null>(null);

  // Tự động chuyển focus về ô ẩn chuyên nhận quét khi có phím nhấn bên ngoài các ô nhập liệu hiển thị
  useEffect(() => {
    if (!isOpen) return;

    const handleWindowKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      // Nếu đang gõ ở ô hiển thị (các input hiển thị) thì không can thiệp
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') &&
        target !== hiddenInputRef.current
      ) {
        return;
      }

      // Nếu focus không nằm ở ô ẩn, tự động focus về ô ẩn để nhận phím quét
      if (document.activeElement !== hiddenInputRef.current) {
        hiddenInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleWindowKeyDown);
    return () => {
      window.removeEventListener('keydown', handleWindowKeyDown);
    };
  }, [isOpen]);

  // Xử lý dữ liệu quét được từ ô input ẩn (chỉ kích hoạt khi nhận Enter tự động từ máy quét)
  const handleHiddenInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();

      const scannedCode = e.currentTarget.value.trim();
      const upperScanned = scannedCode.toUpperCase();

      const isSpoolQR = (upper: string) => 
        !upper.startsWith('LOC-') && 
        !upper.startsWith('PRT-') && 
        !upper.startsWith('CLR-') && 
        !upper.startsWith('CMD-');

      if (scannedCode.length >= 1) {
        if (/^[0-9]+$/.test(scannedCode)) {
          handleNumberScan(scannedCode);
        }
        else if (upperScanned === 'CMD-WEIGHT-TAB') {
          handleTabScan();
        } 
        else if (upperScanned === 'CMD-WEIGHT-DONE') {
          handleDoneScan();
        } 
        else if (isSpoolQR(upperScanned) || upperScanned.startsWith('LOC-') || upperScanned.startsWith('PRT-')) {
          if (scannedCode === selectedSpool.id) {
            const roundedWeight = readScaleForScan();
            if (roundedWeight !== null) {
              setMode('calculated');
              setActiveField('empty');
              handleCalculateWeight(roundedWeight.toString());
              // Tính toán lượng nhựa còn lại để lưu ngay lập tức
              const calculated = Math.max(0, roundedWeight - emptyWeight);
              const finalRemaining = Math.min(selectedSpool.initialWeightG, calculated);
              submitData(finalRemaining);
            }
          } else {
            speakText('Đổi cuộn');
            if (onScanSpool) {
              onScanSpool(scannedCode);
            }
          }
        }
      }

      // Xóa sạch giá trị DOM của ô input ẩn
      e.currentTarget.value = '';
    }
  };

  // Xử lý khi quét mã số từ súng quét
  const handleNumberScan = (num: string) => {
    setIsFirstDigit(false);

    // Phát âm thanh đọc số offline (truyền thẳng chuỗi số "7" hoặc "701" vào speakText)
    speakText(num);

    if (activeField === 'total') {
      const nextVal = isFirstDigit ? num : totalWeighed + num;
      setTotalWeighed(nextVal);
      calculateWeight(nextVal, emptyWeight);
    } 
    else if (activeField === 'remaining') {
      const currentStr = isFirstDigit ? '' : String(remainingWeight);
      const nextVal = currentStr + num;
      const parsed = Number(nextVal);
      // Giới hạn lượng nhựa không vượt quá dung tích ban đầu
      const capped = Math.min(selectedSpool.initialWeightG, parsed);
      setRemainingWeight(capped);
    } 
    else if (activeField === 'empty') {
      const currentStr = isFirstDigit ? '' : String(emptyWeight);
      const nextVal = currentStr + num;
      const parsed = Number(nextVal);
      setEmptyWeight(parsed);
      calculateWeight(totalWeighed, parsed);
    }
  };

  // Xử lý lệnh chuyển trường nhập (Tab)
  const handleTabScan = () => {
    setIsFirstDigit(true);
    const nextField = mode === 'calculated'
      ? (activeField === 'total' ? 'empty' : 'total')
      : (activeField === 'remaining' ? 'empty' : 'remaining');
    
    speakText(nextField === 'empty' ? 'Khối lượng vỏ' : (mode === 'calculated' ? 'Tổng cân' : 'Nhựa còn lại'));
    setActiveField(nextField);
  };

  // Xử lý lệnh hoàn thành (Done)
  const handleDoneScan = () => {
    submitData();
  };

  // Calculate automatically when totalWeighed or emptyWeight changes
  const calculateWeight = (totalVal: string, emptyVal: number) => {
    if (!selectedSpool) return; // chưa chọn cuộn thì không có initialWeightG để chặn trần
    if (totalVal === '') {
      setRemainingWeight(selectedSpool.remainingWeightG);
      return;
    }
    const total = parseFloat(totalVal);
    if (!isNaN(total)) {
      // remaining = total_weighed - empty_spool_weight
      const calculated = Math.max(0, total - emptyVal);
      // Cap at initialWeight
      setRemainingWeight(Math.min(selectedSpool.initialWeightG, calculated));
    }
  };

  const handleCalculateWeight = (val: string) => {
    setTotalWeighed(val);
    calculateWeight(val, emptyWeight);
    setIsFirstDigit(false);
  };

  const handleEmptyWeightChange = (val: number) => {
    setEmptyWeight(val);
    calculateWeight(totalWeighed, val);
    setIsFirstDigit(false);
  };

  // Chặn phím Enter tự động submit form
  const handleFormKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
    }
  };

  // Hàm xử lý lưu dữ liệu chính dùng chung
  const submitData = async (overrideRemaining?: number) => {
    const currentRemaining = overrideRemaining !== undefined ? overrideRemaining : remainingWeight;

    if (currentRemaining < 0) {
      setError('Lượng nhựa còn lại không được âm');
      return;
    }

    if (emptyWeight < 0) {
      setError('Khối lượng vỏ cuộn không được âm');
      return;
    }

    if (currentRemaining > selectedSpool.initialWeightG) {
      setError(`Lượng nhựa không được vượt quá dung tích ban đầu (${selectedSpool.initialWeightG}g)`);
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      if (currentRemaining === 0) {
        window.dispatchEvent(new CustomEvent('appConfirm', {
          detail: {
            title: 'Xóa cuộn đã hết',
            message: `Cuộn nhựa "${selectedSpool.id}" đã dùng hết (0g). Bạn có muốn xóa cuộn nhựa này khỏi cơ sở dữ liệu để giải phóng mã ID không? Loại nhựa và thông tin màu sắc vẫn được lưu lại.`,
            onConfirm: async () => {
              const response = await fetch(`/api/spools/${selectedSpool.id}`, {
                method: 'DELETE',
              });
              const resData = await response.json();
              if (resData.status === 'success') {
                onSuccess();
                onClose();
              } else {
                setError(resData.message || 'Lỗi xảy ra khi xóa cuộn nhựa');
              }
            }
          }
        }));
        setIsLoading(false);
        return;
      }

      // Call general spool PUT API to update both weights at once
      const response = await fetch(`/api/spools/${selectedSpool.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          remainingWeightG: currentRemaining,
          emptySpoolWeightG: emptyWeight,
          brand: brand.trim(),
          locationId: locationId || null,
          printerId: printerId || null,
        }),
      });

      const resData = await response.json();

      if (resData.status === 'success') {
        if (overrideRemaining === undefined) {
          speakText('Đã lưu');
        }
        onSuccess();
        onClose();
      } else {
        setError(resData.message || 'Lỗi xảy ra khi cập nhật khối lượng');
      }
    } catch {
      setError('Lỗi kết nối server');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitData();
  };

  // Cập nhật ref sau mỗi render để effect quét luôn dùng bản handler + state mới nhất
  useEffect(() => {
    scanHandlersRef.current = {
      handleNumberScan,
      handleTabScan,
      handleDoneScan,
      handleCalculateWeight,
      submitData,
      readScaleForScan,
      emptyWeight,
    };
  });

  // Effect này PHẢI đứng sau effect cập nhật ref ở trên: React chạy effect theo đúng thứ tự khai
  // báo, nên nếu đặt trước, nó sẽ đọc trúng bản handler của lần render TRƯỚC — bản còn giữ
  // selectedSpool = null lúc modal chưa mở — và crash khi vừa mở modal vừa nhận mã quét cùng lúc.
  useEffect(() => {
    if (!isOpen || !globalScannedCode || !selectedSpool) return;
    const handlers = scanHandlersRef.current;
    if (!handlers) return;

    const code = globalScannedCode.code.trim();
    const upperCode = code.toUpperCase();

    // 1. Quét chữ số (chấp nhận cả chữ số đơn lẻ và số gồm nhiều chữ số)
    if (/^[0-9]+$/.test(code)) {
      handlers.handleNumberScan(code);
    }
    // 2. Lệnh chuyển trường nhập (Tab)
    else if (upperCode === 'CMD-WEIGHT-TAB') {
      handlers.handleTabScan();
    }
    // 3. Lệnh hoàn thành và lưu (Done)
    else if (upperCode === 'CMD-WEIGHT-DONE') {
      handlers.handleDoneScan();
    }
    // 4. Nếu quét QR của cuộn hiện tại, lấy số cân thực tế và lưu luôn
    else if (
      code === selectedSpool.id &&
      !upperCode.startsWith('LOC-') &&
      !upperCode.startsWith('PRT-') &&
      !upperCode.startsWith('CLR-') &&
      !upperCode.startsWith('CMD-')
    ) {
      const roundedWeight = handlers.readScaleForScan();
      if (roundedWeight === null) return;
      setMode('calculated');
      setActiveField('empty');
      handlers.handleCalculateWeight(roundedWeight.toString());
      // Tính toán lượng nhựa còn lại để lưu ngay lập tức
      const calculated = Math.max(0, roundedWeight - handlers.emptyWeight);
      const finalRemaining = Math.min(selectedSpool.initialWeightG, calculated);
      handlers.submitData(finalRemaining);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalScannedCode]);

  // Early-return đặt SAU tất cả hook để không vi phạm rules-of-hooks
  if (!isOpen || !selectedSpool) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs">
      {/* Modal Container */}
      <div 
        onClick={() => {
          if (isAudioBlocked) {
            speakText('Âm thanh đã kích hoạt');
          }
        }}
        className="relative w-full max-w-md mx-4 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xl cursor-default"
      >
        {/* Close Button */}
        <div className="absolute top-4 right-4 w-8 h-8">
          <button 
            onClick={onClose}
            className="w-full h-full flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200 dark:bg-slate-800 rounded-full transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2 flex items-center gap-2">
          <Scale className="text-indigo-500" size={20} />
          Cập Nhật Lượng Nhựa
        </h3>

        {isAudioBlocked && (
          <div className="mb-3 p-2.5 bg-yellow-950/60 border border-yellow-800/80 text-yellow-200 rounded-lg text-[11px] leading-relaxed flex items-center gap-2 animate-pulse cursor-pointer">
            <span>⚠️</span>
            <span>Trình duyệt đang chặn âm thanh. Hãy <strong>Click vào ô này</strong> để mở giọng đọc.</span>
          </div>
        )}

        <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">
          Cuộn: <span className="text-indigo-400 font-mono font-medium">{selectedSpool.id}</span>
        </p>

        {/* Live MQTT Scale Display */}
        <div className="mb-4 p-3 bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${isScaleConnected ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-slate-500'}`} />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {Math.round(liveWeight) < 0
                ? 'Cân đang ÂM — cần trừ bì trước khi quét'
                : `Cân LAN: ${isScaleConnected ? 'Đang kết nối' : 'Đang tìm kiếm...'}`}
            </span>
          </div>
          <div
            className={`text-2xl font-bold font-mono ${
              Math.round(liveWeight) < 0 ? 'text-red-500 dark:text-red-400' : 'text-emerald-500 dark:text-emerald-400'
            }`}
          >
            {Math.round(liveWeight)} <span className="text-base text-slate-500">g</span>
          </div>
        </div>

        {/* Filament Visual Info */}
        <div className="flex items-center gap-3 p-3 bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl mb-4">
          <div 
            className="w-10 h-10 rounded-full border border-slate-300 dark:border-slate-700 shadow-inner flex-shrink-0"
            style={{ backgroundColor: selectedSpool.filamentColorHex || selectedSpool.filament?.colorHex || '#4f46e5' }}
          />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
              {selectedSpool.filamentBrand || selectedSpool.filament?.brand || 'No brand'} {selectedSpool.filamentType || selectedSpool.filament?.type || 'PLA'}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
              <span>Màu sắc: {selectedSpool.filamentColorName || selectedSpool.filament?.colorName || 'Chưa rõ'}</span>
              <span>•</span>
              <span>Vị trí: </span>
              {selectedSpool.printer?.name ? (
                <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-violet-950 text-violet-300 border border-violet-800 rounded-md">
                  Máy in: {selectedSpool.printer.name}
                </span>
              ) : selectedSpool.location?.name ? (
                <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-indigo-950 text-indigo-300 border border-indigo-800 rounded-md">
                  Kho: {selectedSpool.location.name}
                </span>
              ) : selectedSpool.locationId ? (
                <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-indigo-950 text-indigo-300 border border-indigo-800 rounded-md">
                  Kho: {selectedSpool.locationId}
                </span>
              ) : (
                <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-md">
                  Chưa gán
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Brand Input */}
        <div className="mb-4">
          <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
            Hãng nhựa / Thương hiệu
          </label>
          <input
            type="text"
            placeholder="VD: eSun, Creality, Anycubic..."
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            className="w-full bg-[#1f2937] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 transition-colors"
          />
        </div>

        {/* Vị trí kho/máy in Input */}
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
              Kho lưu trữ
            </label>
            <select
              value={locationId}
              onChange={(e) => {
                setLocationId(e.target.value);
                if (e.target.value) setPrinterId('');
              }}
              className="w-full bg-[#1f2937] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-indigo-500 transition-colors"
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
            <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
              Đang in trên máy
            </label>
            <select
              value={printerId}
              onChange={(e) => {
                setPrinterId(e.target.value);
                if (e.target.value) setLocationId('');
              }}
              className="w-full bg-[#1f2937] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-indigo-500 transition-colors"
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

        {error && (
          <div className="p-3 mb-4 bg-red-950/55 border border-red-800 text-red-200 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Mode Selector Tabs */}
        <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-lg mb-4 text-xs font-medium">
          <button
            type="button"
            onClick={() => setMode('direct')}
            className={`flex-1 py-1.5 rounded-md text-center transition-colors ${mode === 'direct' ? 'bg-[#1f2937] text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}
          >
            Nhập trực tiếp lượng nhựa
          </button>
          <button
            type="button"
            onClick={() => setMode('calculated')}
            className={`flex-1 py-1.5 rounded-md text-center transition-colors ${mode === 'calculated' ? 'bg-[#1f2937] text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}
          >
            Tính từ tổng cân nặng cuộn
          </button>
        </div>

        <form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} className="space-y-4">
          {/* Ô input ẩn nhận sự kiện quét từ súng quét */}
          <input
            ref={hiddenInputRef}
            type="text"
            onKeyDown={handleHiddenInputKeyDown}
            className="opacity-0 absolute pointer-events-none w-0 h-0 top-0 left-0"
            tabIndex={-1}
          />
          {mode === 'direct' ? (
            <div className="space-y-4">
              {/* Trường Nhựa còn lại */}
              <div>
                <label className="text-sm font-medium text-slate-350 mb-1.5 flex items-center justify-between">
                  <span>Khối lượng nhựa còn lại (g)</span>
                  {activeField === 'remaining' && (
                    <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-bold bg-emerald-950/60 border border-emerald-800/80 px-2 py-0.5 rounded-full animate-pulse">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 block"></span>
                      CHỜ SÚNG QUÉT SỐ...
                    </span>
                  )}
                </label>
                <div className="relative">
                  <input
                    ref={remainingInputRef}
                    type="number"
                    min="0"
                    max={selectedSpool.initialWeightG}
                    inputMode="decimal"
                    pattern="[0-9]*"
                    value={remainingWeight}
                    onChange={(e) => {
                      setRemainingWeight(Number(e.target.value));
                      setIsFirstDigit(false);
                    }}
                    onFocus={() => {
                      setActiveField('remaining');
                      setIsFirstDigit(true);
                    }}
                    onBlur={() => {
                      setTimeout(() => hiddenInputRef.current?.focus(), 150);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        hiddenInputRef.current?.focus();
                      }
                    }}
                    className={`w-full bg-[#1f2937] border text-slate-900 dark:text-slate-100 rounded-lg pl-3 pr-10 py-2 focus:outline-hidden transition-all ${activeField === 'remaining' ? 'border-indigo-500 ring-2 ring-indigo-500/50 shadow-md shadow-indigo-500/10 scale-[1.01] bg-[#1e2538]' : 'border-slate-300 dark:border-slate-700'}`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500 dark:text-slate-400">gam</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Lượng nhựa ban đầu: {selectedSpool.initialWeightG}g.
                </p>
              </div>

              {/* Trường Vỏ cuộn */}
              <div>
                <label className="text-sm font-medium text-slate-350 mb-1.5 flex items-center justify-between">
                  <span>Khối lượng vỏ cuộn nhựa (g)</span>
                  {activeField === 'empty' && (
                    <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-bold bg-emerald-950/60 border border-emerald-800/80 px-2 py-0.5 rounded-full animate-pulse">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 block"></span>
                      CHỜ SÚNG QUÉT SỐ...
                    </span>
                  )}
                </label>
                <div className="relative">
                  <input
                    ref={emptyInputRef}
                    type="number"
                    min="0"
                    inputMode="decimal"
                    pattern="[0-9]*"
                    value={emptyWeight}
                    onChange={(e) => {
                      setEmptyWeight(Number(e.target.value));
                      setIsFirstDigit(false);
                    }}
                    onFocus={() => {
                      setActiveField('empty');
                      setIsFirstDigit(true);
                    }}
                    onBlur={() => {
                      setTimeout(() => hiddenInputRef.current?.focus(), 150);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        hiddenInputRef.current?.focus();
                      }
                    }}
                    className={`w-full bg-[#1f2937] border text-slate-900 dark:text-slate-100 rounded-lg pl-3 pr-10 py-2 focus:outline-hidden transition-all ${activeField === 'empty' ? 'border-indigo-500 ring-2 ring-indigo-500/50 shadow-md shadow-indigo-500/10 scale-[1.01] bg-[#1e2538]' : 'border-slate-300 dark:border-slate-700'}`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500 dark:text-slate-400">gam</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Trường Tổng cân nặng */}
              <div>
                <label className="text-sm font-medium text-slate-350 mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Calculator size={14} className="text-indigo-400" />
                    Cân nặng tổng thực tế khi cân (nhựa + vỏ)
                  </span>
                  {activeField === 'total' && (
                    <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-bold bg-emerald-950/60 border border-emerald-800/80 px-2 py-0.5 rounded-full animate-pulse">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 block"></span>
                      CHỜ SÚNG QUÉT SỐ...
                    </span>
                  )}
                </label>
                <div className="relative">
                  <input
                    ref={totalInputRef}
                    type="number"
                    min="0"
                    inputMode="decimal"
                    pattern="[0-9]*"
                    placeholder="Nhập số cân hiện tại trên cân tiểu ly..."
                    value={totalWeighed}
                    onChange={(e) => handleCalculateWeight(e.target.value)}
                    onFocus={() => {
                      setActiveField('total');
                      setIsFirstDigit(true);
                    }}
                    onBlur={() => {
                      setTimeout(() => hiddenInputRef.current?.focus(), 150);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        hiddenInputRef.current?.focus();
                      }
                    }}
                    className={`w-full bg-[#1f2937] border text-slate-900 dark:text-slate-100 placeholder-slate-500 rounded-lg pl-3 pr-10 py-2 focus:outline-hidden transition-all ${activeField === 'total' ? 'border-indigo-500 ring-2 ring-indigo-500/50 shadow-md shadow-indigo-500/10 scale-[1.01] bg-[#1e2538]' : 'border-slate-300 dark:border-slate-700'}`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500 dark:text-slate-400">gam</span>
                </div>
              </div>

              {/* Trường Vỏ cuộn */}
              <div>
                <label className="text-sm font-medium text-slate-350 mb-1.5 flex items-center justify-between">
                  <span>Khối lượng vỏ cuộn nhựa (g)</span>
                  {activeField === 'empty' && (
                    <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-bold bg-emerald-950/60 border border-emerald-800/80 px-2 py-0.5 rounded-full animate-pulse">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 block"></span>
                      CHỜ SÚNG QUÉT SỐ...
                    </span>
                  )}
                </label>
                <div className="relative">
                  <input
                    ref={emptyInputRef}
                    type="number"
                    min="0"
                    inputMode="decimal"
                    pattern="[0-9]*"
                    value={emptyWeight}
                    onChange={(e) => handleEmptyWeightChange(Number(e.target.value))}
                    onFocus={() => {
                      setActiveField('empty');
                      setIsFirstDigit(true);
                    }}
                    onBlur={() => {
                      setTimeout(() => hiddenInputRef.current?.focus(), 150);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        hiddenInputRef.current?.focus();
                      }
                    }}
                    className={`w-full bg-[#1f2937] border text-slate-900 dark:text-slate-100 rounded-lg pl-3 pr-10 py-2 focus:outline-hidden transition-all ${activeField === 'empty' ? 'border-indigo-500 ring-2 ring-indigo-500/50 shadow-md shadow-indigo-500/10 scale-[1.01] bg-[#1e2538]' : 'border-slate-300 dark:border-slate-700'}`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500 dark:text-slate-400">gam</span>
                </div>
              </div>

              {/* Specs Info Panel */}
              <div className="bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-lg p-3 text-xs space-y-1.5 text-slate-350">
                <div className="flex justify-between border-slate-200 dark:border-slate-800 font-medium">
                  <span className="text-slate-200">Lượng nhựa thực tế tính toán:</span>
                  <span className="text-emerald-400 text-sm font-bold">{remainingWeight.toFixed(1)}g</span>
                </div>
              </div>
            </div>
          )}

          {/* Progress preview */}
          <div>
            <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
              <span>Độ đầy cuộn nhựa:</span>
              <span className="font-semibold text-slate-200">
                {((remainingWeight / selectedSpool.initialWeightG) * 100).toFixed(0)}%
              </span>
            </div>
            <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-300"
                style={{ width: `${(remainingWeight / selectedSpool.initialWeightG) * 100}%` }}
              ></div>
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
                {isLoading ? 'Đang lưu...' : 'Lưu lại'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
