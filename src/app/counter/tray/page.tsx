'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import Script from 'next/script';
import { Camera, Upload, Image as ImageIcon, CameraOff, AlertCircle, Settings } from 'lucide-react';

const SETTINGS_KEY = 'tray-counter-settings-v1';

declare global {
  interface Window {
    cv: any;
  }
}

export default function TrayCounterPage() {
  const [cvLoaded, setCvLoaded] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  
  // Settings
  const [colorTolerance, setColorTolerance] = useState(15);
  const [minArea, setMinArea] = useState(500);
  const [maxArea, setMaxArea] = useState(150000);
  const [blurSize, setBlurSize] = useState(5);
  
  // Vùng quét (ROI) - 4 điểm
  type Point = { x: number, y: number };
  const DEFAULT_QUAD: Point[] = [
    { x: 0.1, y: 0.1 },
    { x: 0.9, y: 0.1 },
    { x: 0.9, y: 0.9 },
    { x: 0.1, y: 0.9 },
  ];
  const [quad, setQuad] = useState<Point[]>(DEFAULT_QUAD);
  
  // Màu đích (HSV trong OpenCV: H 0-179, S 0-255, V 0-255)
  const [targetHsv, setTargetHsv] = useState<[number, number, number]>([60, 200, 200]);
  const [targetRgb, setTargetRgb] = useState<[number, number, number]>([74, 222, 128]);
  
  const [count, setCount] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hiddenImageRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const [useCamera, setUseCamera] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

  // Nạp cấu hình
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (typeof s.colorTolerance === 'number') setColorTolerance(s.colorTolerance);
        if (typeof s.minArea === 'number') setMinArea(s.minArea);
        if (typeof s.maxArea === 'number') setMaxArea(s.maxArea);
        if (typeof s.blurSize === 'number') setBlurSize(s.blurSize);
        if (Array.isArray(s.targetHsv)) setTargetHsv(s.targetHsv as [number, number, number]);
        if (Array.isArray(s.targetRgb)) setTargetRgb(s.targetRgb as [number, number, number]);
        if (Array.isArray(s.quad)) setQuad(s.quad as Point[]);
      }
    } catch {}
  }, []);

  // Lưu cấu hình
  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      colorTolerance, minArea, maxArea, blurSize, targetHsv, targetRgb, quad
    }));
  }, [colorTolerance, minArea, maxArea, blurSize, targetHsv, targetRgb, quad]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setUseCamera(false);
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  const startCamera = async () => {
    try {
      setErrorMsg(null);
      setImageSrc(null);
      setCount(null);
      
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false
      });

      streamRef.current = s;
      setUseCamera(true);
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        videoRef.current.play();
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Không thể mở camera: ' + (err.name === 'NotAllowedError' ? 'Trình duyệt bị từ chối quyền truy cập camera' : (err.message || 'Lỗi không xác định')));
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    stopCamera();
    setImageSrc(canvas.toDataURL('image/jpeg', 0.9));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      setImageSrc(evt.target?.result as string);
      stopCamera();
      setErrorMsg(null);
    };
    reader.readAsDataURL(file);
  };

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !cvLoaded || !window.cv || !hiddenImageRef.current) return;
    
    // Tọa độ click trên DOM
    const rect = canvasRef.current.getBoundingClientRect();
    // Quy ra tọa độ pixel của ảnh gốc
    const x = (e.clientX - rect.left) * (canvasRef.current.width / rect.width);
    const y = (e.clientY - rect.top) * (canvasRef.current.height / rect.height);
    
    const cv = window.cv;
    // Đọc ảnh gốc (chưa vẽ viền) để hút màu chuẩn xác
    const src = cv.imread(hiddenImageRef.current);
    
    const px = Math.max(0, Math.min(src.cols - 1, Math.floor(x)));
    const py = Math.max(0, Math.min(src.rows - 1, Math.floor(y)));
    
    // Lấy pixel RGBA
    const pixel = src.ucharPtr(py, px);
    const r = pixel[0];
    const g = pixel[1];
    const b = pixel[2];
    
    setTargetRgb([r, g, b]);
    
    // Đổi sang HSV
    const mat = cv.matFromArray(1, 1, cv.CV_8UC3, [r, g, b]);
    const hsv = new cv.Mat();
    cv.cvtColor(mat, hsv, cv.COLOR_RGB2HSV);
    
    setTargetHsv([hsv.data[0], hsv.data[1], hsv.data[2]]);
    
    mat.delete(); hsv.delete(); src.delete();
  }, [cvLoaded]);

  // Kéo 4 điểm góc (ROI)
  const boxRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<number | null>(null);

  const moveCorner = useCallback((index: number, clientX: number, clientY: number) => {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    let x = (clientX - rect.left) / rect.width;
    let y = (clientY - rect.top) / rect.height;
    
    x = Math.max(0, Math.min(1, x));
    y = Math.max(0, Math.min(1, y));

    setQuad((prev) => prev.map((p, i) => (i === index ? { x, y } : p)));
  }, []);

  const polygon = quad.map((p) => `${p.x * 100},${p.y * 100}`).join(' ');

  const processImage = useCallback(() => {
    if (!cvLoaded || !window.cv || !imageSrc || !hiddenImageRef.current || !canvasRef.current) return;
    
    try {
      const cv = window.cv;
      const imgElement = hiddenImageRef.current;
      
      // Chờ ảnh load xong
      if (imgElement.naturalWidth === 0) return;

      const src = cv.imread(imgElement);
      const dst = new cv.Mat();
      const hsv = new cv.Mat();
      const mask = new cv.Mat();

      // Convert sang HSV
      cv.cvtColor(src, hsv, cv.COLOR_RGBA2RGB, 0);
      cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV, 0);

      // Blur to reduce noise
      const ksize = new cv.Size(blurSize % 2 === 0 ? blurSize + 1 : blurSize, blurSize % 2 === 0 ? blurSize + 1 : blurSize);
      cv.GaussianBlur(hsv, hsv, ksize, 0, 0, cv.BORDER_DEFAULT);

      // Lọc màu (HSV Tolerance)
      const h = targetHsv[0];
      const h_low = Math.max(0, h - colorTolerance);
      const h_high = Math.min(179, h + colorTolerance);
      
      const lower = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [h_low, 40, 30, 0]);
      const upper = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [h_high, 255, 255, 255]);
      
      cv.inRange(hsv, lower, upper, mask);
      lower.delete(); upper.delete();

      // Áp dụng Khóa vùng quét (ROI Mask)
      const roiMask = cv.Mat.zeros(hsv.rows, hsv.cols, cv.CV_8U);
      const ptMat = cv.matFromArray(quad.length, 1, cv.CV_32SC2, quad.flatMap(p => [
        Math.round(p.x * hsv.cols), 
        Math.round(p.y * hsv.rows)
      ]));
      const pts = new cv.MatVector();
      pts.push_back(ptMat);
      
      const white = new cv.Scalar(255, 255, 255, 255);
      cv.fillPoly(roiMask, pts, white, cv.LINE_8, 0);
      
      // Chỉ giữ lại mask bên trong vùng quét
      cv.bitwise_and(mask, roiMask, mask);
      
      ptMat.delete(); pts.delete(); roiMask.delete();

      // Giảm nhiễu hạt và nối liền lỗ thủng
      const M = cv.Mat.ones(5, 5, cv.CV_8U);
      cv.dilate(mask, mask, M, new cv.Point(-1, -1), 2, cv.BORDER_CONSTANT, cv.morphologyDefaultBorderValue());
      cv.erode(mask, mask, M, new cv.Point(-1, -1), 1, cv.BORDER_CONSTANT, cv.morphologyDefaultBorderValue());
      M.delete();

      // Tìm contours
      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();
      cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      // Lọc contours và đếm
      let validCount = 0;
      
      // Copy src to dst để vẽ lên đó
      src.copyTo(dst);

      const color = new cv.Scalar(52, 211, 153, 255); // emerald-400
      const boxColor = new cv.Scalar(99, 102, 241, 255); // indigo-500

      for (let i = 0; i < contours.size(); ++i) {
        const cnt = contours.get(i);
        const area = cv.contourArea(cnt);
        if (area >= minArea && area <= maxArea) {
          validCount++;
          // Vẽ outline
          cv.drawContours(dst, contours, i, color, 3, cv.LINE_8, hierarchy, 0);
          
          // Vẽ bounding box phụ để dễ nhìn
          const rect = cv.boundingRect(cnt);
          const pt1 = new cv.Point(rect.x, rect.y);
          const pt2 = new cv.Point(rect.x + rect.width, rect.y + rect.height);
          cv.rectangle(dst, pt1, pt2, boxColor, 2, cv.LINE_8, 0);
          
          // Đánh số
          const textPt = new cv.Point(rect.x, rect.y > 20 ? rect.y - 5 : rect.y + 20);
          cv.putText(dst, validCount.toString(), textPt, cv.FONT_HERSHEY_SIMPLEX, 0.7, color, 2, cv.LINE_AA);
        }
        cnt.delete();
      }

      // Render ra canvas
      cv.imshow(canvasRef.current, dst);
      setCount(validCount);

      // Dọn rác
      src.delete(); dst.delete(); hsv.delete(); mask.delete();
      contours.delete(); hierarchy.delete();
      
    } catch (err: any) {
      console.error("OpenCV Processing Error:", err);
      setErrorMsg("Lỗi khi phân tích ảnh: " + (err?.message || 'Lỗi không xác định'));
    }
  }, [cvLoaded, imageSrc, targetHsv, colorTolerance, minArea, maxArea, blurSize, quad]);

  // Tự động chạy lại processImage khi config đổi
  useEffect(() => {
    if (imageSrc && cvLoaded) {
      // Đợi tí cho ảnh kịp load vào thẻ img ẩn
      const timer = setTimeout(() => {
        processImage();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [imageSrc, cvLoaded, processImage]);

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200 p-6 flex flex-col">
      <Script 
        src="https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js" 
        strategy="afterInteractive" 
        onLoad={() => {
          // OpenCV js load xong thì nó cần thêm tí thời gian init
          const checkCv = setInterval(() => {
            if (window.cv && window.cv.Mat) {
              setCvLoaded(true);
              clearInterval(checkCv);
            } else if (window.cv && typeof window.cv === 'function') {
              // Handle async init
              window.cv().then((target: any) => {
                window.cv = target;
                setCvLoaded(true);
                clearInterval(checkCv);
              }).catch(() => {});
            }
          }, 200);
          
          // Ngừng check sau 20 giây tránh loop vô hạn
          setTimeout(() => clearInterval(checkCv), 20000);
        }}
        onError={() => {
          setErrorMsg("Không thể tải thư viện OpenCV. Vui lòng kiểm tra lại mạng.");
        }}
      />

      {/* Ẩn thẻ img để load src rồi cấp cho opencv */}
      {imageSrc && (
        <img 
          ref={hiddenImageRef} 
          src={imageSrc} 
          alt="hidden" 
          className="hidden" 
          onLoad={processImage} 
        />
      )}

      <header className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/" className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg font-medium transition-colors">
            &larr; Trang chủ
          </Link>
          <Link href="/counter" className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg font-medium transition-colors">
            Bộ đếm thường
          </Link>
          <Link href="/counter/camera" className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg font-medium transition-colors">
            Đếm bằng camera
          </Link>
        </div>
        <div className="text-xl font-bold text-white flex items-center gap-2 uppercase">
          Đếm tĩnh trên khay
        </div>
      </header>

      {!cvLoaded && (
        <div className="bg-amber-900/50 text-amber-200 p-3 rounded-lg mb-4 text-sm border border-amber-800">
          Đang tải thư viện thị giác máy tính (OpenCV.js)... Vui lòng đợi trong giây lát.
        </div>
      )}
      
      {errorMsg && (
        <div className="bg-red-900/50 text-red-200 p-3 rounded-lg mb-4 text-sm border border-red-800 flex items-center gap-2">
          <AlertCircle size={18} /> {errorMsg}
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        
        {/* VÙNG ẢNH */}
        <div className="bg-[#1e293b] border border-slate-700 rounded-3xl overflow-hidden flex flex-col relative min-h-[50vh]">
          {/* Controls Bar */}
          <div className="p-4 border-b border-slate-700 flex flex-wrap gap-3 bg-slate-800/50 z-10">
            {useCamera ? (
              <>
                <button onClick={capturePhoto} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white font-medium flex items-center gap-2">
                  <Camera size={18} /> Chụp ảnh ngay
                </button>
                <button onClick={stopCamera} className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-white font-medium flex items-center gap-2">
                  <CameraOff size={18} /> Hủy camera
                </button>
              </>
            ) : (
              <>
                <button onClick={startCamera} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white font-medium flex items-center gap-2">
                  <Camera size={18} /> Mở Camera
                </button>
                <button onClick={() => fileInputRef.current?.click()} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white font-medium flex items-center gap-2">
                  <Upload size={18} /> Tải ảnh lên
                </button>
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
              </>
            )}
          </div>

          <div className="flex-1 relative bg-black flex flex-col items-center justify-center p-4">
            
            <div 
              ref={boxRef}
              className="relative inline-block max-w-full max-h-full"
              onPointerMove={(e) => {
                if (dragRef.current !== null) moveCorner(dragRef.current, e.clientX, e.clientY);
              }}
              onPointerUp={() => { dragRef.current = null; }}
              onPointerLeave={() => { dragRef.current = null; }}
            >
              <video 
                ref={videoRef} 
                className={`max-w-full max-h-[70vh] object-contain cursor-crosshair ${useCamera ? '' : 'hidden'}`}
                playsInline
                muted
              />
              
              {!useCamera && imageSrc && (
                <canvas 
                  ref={canvasRef} 
                  onClick={handleCanvasClick}
                  className="max-w-full max-h-[70vh] object-contain border border-slate-700 rounded-xl shadow-2xl cursor-crosshair" 
                  title="Bấm vào vật thể để nhận diện màu"
                />
              )}

              {/* Vùng đếm SVG (ROI) overlay */}
              {(!useCamera && imageSrc) && (
                <>
                  <svg
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    className="absolute inset-0 w-full h-full pointer-events-none z-10"
                  >
                    <polygon
                      points={polygon}
                      vectorEffect="non-scaling-stroke"
                      className="fill-indigo-400/10 stroke-indigo-400 border-dashed"
                      strokeDasharray="2"
                      strokeWidth={2}
                    />
                  </svg>
                  
                  {/* 4 điểm drag */}
                  {quad.map((p, i) => (
                    <div
                      key={i}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        dragRef.current = i;
                      }}
                      className="absolute w-8 h-8 -ml-4 -mt-4 flex items-center justify-center cursor-move touch-none z-20 group"
                      style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
                    >
                      <div className="w-4 h-4 bg-white border-2 border-indigo-500 rounded-full shadow-lg group-hover:scale-125 transition-transform" />
                    </div>
                  ))}
                </>
              )}
            </div>

            {!useCamera && !imageSrc && (
              <div className="text-slate-500 flex flex-col items-center gap-3">
                <ImageIcon size={48} className="opacity-50" />
                <p>Mở camera hoặc tải ảnh lên để bắt đầu đếm</p>
              </div>
            )}
          </div>
        </div>

        {/* BẢNG CẤU HÌNH & KẾT QUẢ */}
        <div className="bg-[#1e293b] border border-slate-700 rounded-3xl p-6 flex flex-col gap-6">
          <div className="text-center p-6 bg-slate-800 rounded-2xl border border-slate-700">
            <h3 className="text-sm uppercase tracking-widest text-slate-400 mb-2">Số lượng phát hiện</h3>
            <div className={`text-6xl font-mono font-bold transition-all duration-300 ${count !== null ? 'text-emerald-400 scale-110' : 'text-slate-600'}`}>
              {count !== null ? count : '--'}
            </div>
          </div>

          <div className="border-t border-slate-700 pt-6">
            <h3 className="font-semibold text-white flex items-center gap-2 mb-4">
              <Settings size={18} /> Thông số nhận diện
            </h3>

            <div className="flex flex-col gap-5">
              <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                <div className="text-sm font-medium text-slate-300 mb-2">Màu đang đếm:</div>
                <div className="flex items-center gap-3">
                  <div 
                    className="w-10 h-10 rounded-lg shadow-inner border border-slate-600"
                    style={{ backgroundColor: `rgb(${targetRgb[0]}, ${targetRgb[1]}, ${targetRgb[2]})` }}
                  ></div>
                  <div className="text-xs text-slate-400">
                    RGB: {targetRgb.join(', ')}<br/>
                    HSV: {targetHsv.join(', ')}
                  </div>
                </div>
                <p className="text-xs text-emerald-400 mt-2 font-medium">👉 Mẹo: Chạm vào vật thể trên ảnh để hút màu tự động.</p>
              </div>

              <Slider 
                label="Độ rộng dải màu (Color Tolerance)" 
                hint="Dung sai màu. Tăng lên nếu bị thiếu sót những vật thể có góc khuất/bóng râm."
                min={5} max={90} step={1} value={colorTolerance} onChange={setColorTolerance}
              />
              
              <Slider 
                label="Làm mờ khử nhiễu (Blur)" 
                hint="Làm mờ ảnh để bỏ qua các chi tiết xước dăm nhỏ."
                min={1} max={15} step={2} value={blurSize} onChange={setBlurSize}
              />
              
              <Slider 
                label="Bỏ qua vật siêu nhỏ (Min Area)" 
                hint="Lọc bụi, mảng bám, hạt nhựa li ti."
                min={10} max={10000} step={100} value={minArea} onChange={setMinArea}
              />
              
              <Slider 
                label="Bỏ qua vật siêu to (Max Area)" 
                hint="Tránh nhận diện nhầm viền khay PEI hoặc hộp."
                min={5000} max={1000000} step={5000} value={maxArea} onChange={setMaxArea}
              />
              
              <button 
                onClick={() => setQuad(DEFAULT_QUAD)}
                className="mt-2 w-full h-10 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm font-medium text-slate-200 transition-colors"
              >
                Khôi phục vùng quét (ROI)
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

function Slider({
  label, hint, value, min, max, step, suffix = '', onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block select-none">
      <span className="flex justify-between items-baseline">
        <span className="text-xs uppercase tracking-widest text-slate-400">{label}</span>
        <span className="font-mono text-sm text-indigo-300">
          {value}{suffix}
        </span>
      </span>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-indigo-500"
      />
      {hint && <span className="block mt-1 text-[11px] text-slate-500 leading-snug">{hint}</span>}
    </label>
  );
}
