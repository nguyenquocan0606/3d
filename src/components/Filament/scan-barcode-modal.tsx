'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Scan, Keyboard, AlertCircle, Camera, CameraOff, CheckCircle2, Zap, ZapOff } from 'lucide-react';

interface ScanBarcodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (spoolId: string) => void;
  allSpoolIds: string[];
  continuous?: boolean;
}

type ScanMode = 'camera' | 'manual';

export default function ScanBarcodeModal({ isOpen, onClose, onScanSuccess, continuous = false }: ScanBarcodeModalProps) {
  const [barcodeInput, setBarcodeInput] = useState('');
  const [error, setError] = useState('');
  const [scanMode, setScanMode] = useState<ScanMode>('camera');
  const [cameraStatus, setCameraStatus] = useState<'idle' | 'starting' | 'active' | 'error'>('idle');
  const [cameraError, setCameraError] = useState('');
  const [scannedCode, setScannedCode] = useState('');
  const [flashOn, setFlashOn] = useState(false);
  const [flashSupported, setFlashSupported] = useState(false);
  
  const lastScannedRef = useRef<{ code: string; time: number }>({ code: '', time: 0 });
  
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hiddenCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef<number | null>(null);

  // Stop camera and loop
  const stopScanner = useCallback(() => {
    if (loopRef.current !== null) {
      cancelAnimationFrame(loopRef.current);
      loopRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (e) {
          console.error('Error stopping track:', e);
        }
      });
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    if (overlayCanvasRef.current) {
      const ctx = overlayCanvasRef.current.getContext('2d');
      ctx?.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);
    }

    setCameraStatus('idle');
    setFlashOn(false);
    setFlashSupported(false);
  }, []);

  // Toggle flash/torch
  const toggleFlash = useCallback(async () => {
    if (!streamRef.current) return;
    const videoTrack = streamRef.current.getVideoTracks()[0];
    if (!videoTrack) return;

    try {
      const newFlashState = !flashOn;
      await videoTrack.applyConstraints({
        advanced: [{ torch: newFlashState } as any]
      });
      setFlashOn(newFlashState);
    } catch (err) {
      console.warn('Không thể điều khiển đèn Flash:', err);
    }
  }, [flashOn]);

  // Start camera and WeChat WASM scanning loop
  const startScanner = useCallback(async () => {
    setCameraStatus('starting');
    setCameraError('');
    setScannedCode('');
    setError('');
    setFlashOn(false);
    setFlashSupported(false);

    try {
      // 1. Get webcam stream (Full HD ideal for maximum sharpness at tilted angles)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // Check capabilities (Flash & Autofocus) and apply constraints
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const capabilities = videoTrack.getCapabilities?.() as any;
        if (capabilities && 'torch' in capabilities) {
          setFlashSupported(true);
        }
        try {
          const constraints: any = {};
          if (capabilities && capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
            constraints.focusMode = 'continuous';
          }
          if (Object.keys(constraints).length > 0) {
            await videoTrack.applyConstraints({ advanced: [constraints] });
          }
        } catch (e) {
          console.warn('Không thể thiết lập chế độ tự động lấy nét liên tục:', e);
        }
      }

      // 2. Load and initialize WeChat QR WASM Engine dynamically (offline-ready)
      const { ready, scan } = await import('qr-scanner-wechat');
      await ready();

      setCameraStatus('active');

      // 3. Frame processing loop
      let lastScanTime = 0;
      const scanInterval = 120; // scan every 120ms for perfect CPU performance on mobile
      let scanCount = 0;

      const processFrame = async () => {
        const video = videoRef.current;
        const hiddenCanvas = hiddenCanvasRef.current;
        const overlayCanvas = overlayCanvasRef.current;

        if (video && video.readyState >= video.HAVE_CURRENT_DATA && hiddenCanvas && overlayCanvas) {
          const videoWidth = video.videoWidth;
          const videoHeight = video.videoHeight;

          if (videoWidth > 0 && videoHeight > 0) {
            const now = performance.now();
            if (now - lastScanTime >= scanInterval) {
              lastScanTime = now;

              // Alternate between normal frame and 2x digital zoom frame
              const isZoomed = scanCount % 2 === 1;
              scanCount++;

              // Scale down to 640px width for optimal WebAssembly processing speed
              const maxWidth = 640;
              const scale = Math.min(1, maxWidth / videoWidth);
              const width = Math.floor(videoWidth * scale);
              const height = Math.floor(videoHeight * scale);

            // Sync canvas dimensions
            if (hiddenCanvas.width !== width) hiddenCanvas.width = width;
            if (hiddenCanvas.height !== height) hiddenCanvas.height = height;

            // Sync overlay canvas with display size on screen
            const displayWidth = video.clientWidth;
            const displayHeight = video.clientHeight;
            if (overlayCanvas.width !== displayWidth) overlayCanvas.width = displayWidth;
            if (overlayCanvas.height !== displayHeight) overlayCanvas.height = displayHeight;

            const ctx = hiddenCanvas.getContext('2d', { willReadFrequently: true });
            const overlayCtx = overlayCanvas.getContext('2d');

            if (ctx && overlayCtx) {
              // Draw video frame to hidden canvas (either full frame or center 50% cropped frame)
              if (isZoomed) {
                const sx = videoWidth * 0.25;
                const sy = videoHeight * 0.25;
                const sWidth = videoWidth * 0.5;
                const sHeight = videoHeight * 0.5;
                ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, width, height);
              } else {
                ctx.drawImage(video, 0, 0, width, height);
              }

              try {
                // Scan QR code from binarized canvas image using WeChat WASM
                const result = await scan(hiddenCanvas);

                if (result && result.text) {
                  const cleanCode = result.text.trim();
                  setScannedCode(cleanCode);

                  // Clear previous overlays and draw bounding box
                  overlayCtx.clearRect(0, 0, displayWidth, displayHeight);
                  if (result.rect) {
                    const scaleX = displayWidth / width;
                    const scaleY = displayHeight / height;

                    let rx = result.rect.x * scaleX;
                    let ry = result.rect.y * scaleY;
                    let rw = result.rect.width * scaleX;
                    let rh = result.rect.height * scaleY;

                    // If scanned from a zoomed frame, map the coordinates back to full stream coordinates
                    if (isZoomed) {
                      rx = displayWidth * 0.25 + rx * 0.5;
                      ry = displayHeight * 0.25 + ry * 0.5;
                      rw = rw * 0.5;
                      rh = rh * 0.5;
                    }

                    overlayCtx.strokeStyle = '#10b981'; // Emerald-500
                    overlayCtx.lineWidth = 6;
                    overlayCtx.lineJoin = 'round';
                    overlayCtx.strokeRect(rx, ry, rw, rh);

                    // Fill interior with subtle alpha
                    overlayCtx.fillStyle = 'rgba(16, 185, 129, 0.15)';
                    overlayCtx.fillRect(rx, ry, rw, rh);
                  }

                  // Accept any detected code (spools or locations)
                  if (continuous) {
                    const nowTime = Date.now();
                    const isCooldown = cleanCode === lastScannedRef.current.code && nowTime - lastScannedRef.current.time < 2000;
                    if (!isCooldown) {
                      lastScannedRef.current = { code: cleanCode, time: nowTime };
                      onScanSuccess(cleanCode);
                    }
                  } else {
                    setTimeout(() => {
                      stopScanner();
                      onScanSuccess(cleanCode);
                      onClose();
                    }, 450);
                    return; // exit the loop
                  }
                } else {
                  // No code detected, clear overlay
                  overlayCtx.clearRect(0, 0, displayWidth, displayHeight);
                }
              } catch (err: any) {
                overlayCtx.clearRect(0, 0, displayWidth, displayHeight);
                const errMsg = err?.message || err;
                if (errMsg && typeof errMsg === 'string' && !errMsg.includes('not found') && !errMsg.includes('fail')) {
                  console.error('WeChat scan error:', err);
                }
              }
            }
          }
        }
      }

        // Request next frame
        if (streamRef.current) {
          loopRef.current = requestAnimationFrame(processFrame);
        }
      };

      loopRef.current = requestAnimationFrame(processFrame);

    } catch (err: any) {
      setCameraStatus('error');
      if (err?.message?.includes('NotAllowedError') || err?.name === 'NotAllowedError') {
        setCameraError('Quyền truy cập camera bị từ chối. Vui lòng cho phép truy cập camera trong cài đặt trình duyệt.');
      } else if (err?.message?.includes('NotFoundError') || err?.name === 'NotFoundError') {
        setCameraError('Không tìm thấy camera trên thiết bị này.');
      } else if (err?.message?.includes('NotReadableError') || err?.name === 'NotReadableError') {
        setCameraError('Camera đang được sử dụng bởi ứng dụng khác.');
      } else {
        setCameraError(err?.message || 'Không thể khởi tạo camera. Hãy thử chế độ nhập tay.');
      }
    }
  }, [continuous, onScanSuccess, onClose, stopScanner]);

  // Handle modal open/close
  useEffect(() => {
    if (isOpen) {
      setBarcodeInput('');
      setError('');
      setScannedCode('');
      setCameraError('');
      setCameraStatus('idle');

      if (scanMode === 'camera') {
        const timer = setTimeout(() => {
          startScanner();
        }, 300);
        return () => clearTimeout(timer);
      } else {
        setTimeout(() => {
          inputRef.current?.focus();
        }, 100);
      }
    } else {
      stopScanner();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Handle mode switch
  useEffect(() => {
    if (!isOpen) return;

    if (scanMode === 'camera') {
      const timer = setTimeout(() => {
        startScanner();
      }, 300);
      return () => clearTimeout(timer);
    } else {
      stopScanner();
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanMode]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, [stopScanner]);

  if (!isOpen) return null;

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = barcodeInput.trim();

    if (!cleanCode) {
      setError('Vui lòng nhập hoặc quét mã QR Code');
      return;
    }

    if (continuous) {
      onScanSuccess(cleanCode);
      setBarcodeInput('');
      setError('');
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    } else {
      onScanSuccess(cleanCode);
      onClose();
    }
  };

  const handleClose = () => {
    stopScanner();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      {/* Modal Container */}
      <div
        className="relative w-full max-w-md mx-4 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Animated scan line */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent animate-[bounce_2s_infinite]"></div>

        {/* Header */}
        <div className="p-6 pb-4">
          {/* Close Button */}
          <div className="absolute top-4 right-4 w-8 h-8">
            <button
              onClick={handleClose}
              className="w-full h-full flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200 dark:bg-slate-800 rounded-full transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2 flex items-center gap-2">
            <Scan className="text-indigo-400 animate-pulse" size={20} />
            Quét QR Code Cuộn Nhựa
          </h3>

          {/* Mode Tabs */}
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setScanMode('camera')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                scanMode === 'camera'
                  ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/40 shadow-sm'
                  : 'bg-slate-200/50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:border-slate-700 hover:text-slate-700 dark:text-slate-300'
              }`}
            >
              <Camera size={16} />
              <span>Quét Camera</span>
            </button>
            <button
              onClick={() => setScanMode('manual')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                scanMode === 'manual'
                  ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/40 shadow-sm'
                  : 'bg-slate-200/50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:border-slate-700 hover:text-slate-700 dark:text-slate-300'
              }`}
            >
              <Keyboard size={16} />
              <span>Nhập tay</span>
            </button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mx-6 p-3 mb-4 bg-red-950/40 border border-red-800 text-red-200 rounded-xl text-xs flex items-start gap-2 animate-shake">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Camera Mode */}
        {scanMode === 'camera' && (
          <div className="px-6 pb-6 space-y-4">
            {/* Camera View Container */}
            <div className="relative w-full h-[300px] bg-black rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 flex items-center justify-center">
              {/* Hidden canvas for image scaling and preprocessing */}
              <canvas ref={hiddenCanvasRef} className="hidden" />

              {/* Bounding box drawing canvas */}
              <canvas
                ref={overlayCanvasRef}
                className="absolute inset-0 w-full h-full object-cover pointer-events-none z-10"
              />

              {/* Direct HTML5 Video element matching Container-First Sizing */}
              <video
                ref={videoRef}
                className="absolute inset-0 w-full h-full object-cover"
                playsInline
                muted
              />

              {/* Camera Status Overlays */}
              {cameraStatus === 'starting' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-10">
                  <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Đang khởi tạo camera...</p>
                  <p className="text-xs text-slate-500 mt-1">Vui lòng cho phép quyền truy cập camera</p>
                </div>
              )}

              {cameraStatus === 'error' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-10 p-6">
                  <CameraOff size={40} className="text-red-400 mb-3" />
                  <p className="text-sm text-red-300 text-center">{cameraError}</p>
                  <button
                    onClick={startScanner}
                    className="mt-4 px-4 py-2 bg-indigo-650 hover:bg-indigo-600 text-slate-900 dark:text-white text-sm rounded-lg transition-colors cursor-pointer"
                  >
                    Thử lại
                  </button>
                </div>
              )}
            </div>

            {/* Flash Toggle + Scanned Code Row */}
            <div className="flex items-center gap-3">
              {/* Flash Toggle Button */}
              {cameraStatus === 'active' && (
                <button
                  onClick={toggleFlash}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer border shrink-0 ${
                    flashOn
                      ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 shadow-sm shadow-amber-500/10'
                      : flashSupported
                        ? 'bg-slate-200/50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:border-slate-700 hover:text-slate-700 dark:text-slate-300'
                        : 'bg-slate-800/30 text-slate-600 border-slate-200 dark:border-slate-800/50 cursor-not-allowed opacity-50'
                  }`}
                  disabled={!flashSupported}
                  title={flashSupported ? (flashOn ? 'Tắt đèn flash' : 'Bật đèn flash') : 'Đèn flash không được hỗ trợ trên thiết bị này'}
                >
                  {flashOn ? <Zap size={16} className="text-amber-400" /> : <ZapOff size={16} />}
                  <span>{flashOn ? 'Flash ON' : 'Flash OFF'}</span>
                </button>
              )}

              {/* Scanned code display */}
              {scannedCode && (
                <div className="flex-1 flex items-center gap-2 p-2.5 bg-emerald-950/30 border border-emerald-800 rounded-xl min-w-0">
                  <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                  <p className="text-xs font-mono font-bold text-emerald-200 truncate">{scannedCode}</p>
                </div>
              )}
            </div>

            {/* Instructions */}
            <div className="text-[10px] text-slate-500 text-center font-mono uppercase tracking-wider">
              * Hướng camera vào QR Code trên cuộn nhựa. Tự động nhận diện.
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <div className="w-24 h-10">
                <button
                  type="button"
                  onClick={handleClose}
                  className="w-full h-full flex items-center justify-center bg-slate-200 dark:bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-lg text-sm transition-colors cursor-pointer"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Manual Mode */}
        {scanMode === 'manual' && (
          <div className="px-6 pb-6">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Sử dụng đầu đọc máy quét USB hoặc nhập mã trực tiếp từ bàn phím.
            </p>

            <form onSubmit={handleManualSubmit} className="space-y-6">
              {/* Main scanning screen block */}
              <div className="bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 relative flex flex-col items-center justify-center min-h-[140px] focus-within:border-indigo-500/50 transition-colors">

                {/* Corner bracket decorations */}
                <div className="absolute top-3 left-3 w-4 h-4 border-t-2 border-l-2 border-slate-300 dark:border-slate-700"></div>
                <div className="absolute top-3 right-3 w-4 h-4 border-t-2 border-r-2 border-slate-300 dark:border-slate-700"></div>
                <div className="absolute bottom-3 left-3 w-4 h-4 border-b-2 border-l-2 border-slate-300 dark:border-slate-700"></div>
                <div className="absolute bottom-3 right-3 w-4 h-4 border-b-2 border-r-2 border-slate-300 dark:border-slate-700"></div>

                <div className="text-slate-500 mb-3 flex items-center gap-1.5 text-xs font-mono">
                  <Keyboard size={14} />
                  <span>AWAITING INPUT...</span>
                </div>

                {/* Input field */}
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="QUÉT HOẶC NHẬP MÃ"
                  value={barcodeInput}
                  onChange={(e) => {
                    setBarcodeInput(e.target.value);
                    setError('');
                  }}
                  className="w-full text-center bg-transparent border-0 font-mono text-2xl font-bold text-indigo-400 placeholder-slate-800 focus:ring-0 focus:outline-hidden tracking-widest uppercase"
                  autoComplete="off"
                />

                {/* Visual scan indicator line */}
                <div className="w-4/5 h-[1px] bg-indigo-500/30 mt-2 relative overflow-hidden">
                  <div className="absolute top-0 left-0 h-full w-1/3 bg-indigo-500 animate-[shimmer_1.5s_infinite]"></div>
                </div>
              </div>

              <div className="text-[10px] text-slate-500 text-center font-mono uppercase tracking-wider">
                * Máy quét cầm tay tự động gửi phím ENTER để xác nhận.
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <div className="w-24 h-10">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="w-full h-full flex items-center justify-center bg-slate-200 dark:bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-lg text-sm transition-colors cursor-pointer"
                  >
                    Hủy
                  </button>
                </div>
                <div className="w-32 h-10">
                  <button
                    type="submit"
                    className="w-full h-full flex items-center justify-center bg-indigo-650 hover:bg-indigo-600 text-slate-900 dark:text-white font-medium rounded-lg text-sm transition-colors shadow-lg shadow-indigo-500/10 cursor-pointer"
                  >
                    Tìm Kiếm
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
