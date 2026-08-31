'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  CheckCircle2,
  Maximize2,
  Minus,
  Plus,
  Printer,
  QrCode,
  ScanBarcode,
  Search,
  Tag,
  Type,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// ═══════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════

type TemplateKey = 'qr-text' | 'barcode-text' | 'text-only' | 'qr-large';
type FontSizeKey = 'sm' | 'md' | 'lg' | 'xl' | 'xxl';
type SourceMode = 'custom' | 'list';
type SourceType = 'store' | 'spool' | 'location' | 'printer';

interface StoreProduct {
  id: string;
  ten: string;
  gia: number;
  danhMuc: string;
  maQR: string;
  donVi: string;
}

interface SourceItem {
  id: string;
  label: string;
  sub: string;
  line1: string;
  line2: string;
  line3: string;
  qrContent: string;
}

interface PrintLabelTabProps {
  allSpools: Array<{
    id: string;
    filamentType: string;
    filamentColorName: string;
    filamentBrand?: string | null;
  }>;
  locations: Array<{ id: string; name: string }>;
  printers: Array<{ id: string; name: string }>;
  filaments: Array<{ type: string; colorName: string; brand?: string | null }>;
}

// ═══════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════

/** Kích thước tem: 40mm×30mm = 320×240 dots @ 203 DPI */
const LABEL_W = 320;
const LABEL_H = 240;

const TEMPLATES: Array<{ key: TemplateKey; label: string; desc: string; icon: LucideIcon }> = [
  { key: 'qr-text', label: 'QR + Text', desc: 'QR trái, text phải', icon: QrCode },
  { key: 'barcode-text', label: 'Barcode + Text', desc: 'Barcode 1D giữa', icon: ScanBarcode },
  { key: 'text-only', label: 'Chỉ Text', desc: '3 dòng to, căn giữa', icon: Type },
  { key: 'qr-large', label: 'QR Lớn', desc: 'QR to + text nhỏ', icon: Maximize2 },
];

/** Font size (px) trên canvas 320×240. Tương ứng kích thước thật trên tem. */
const CANVAS_FONT_PX: Record<FontSizeKey, number> = {
  sm: 14,   // ~1.7mm
  md: 20,   // ~2.5mm
  lg: 28,   // ~3.5mm
  xl: 160,  // ~14mm chữ thật — chỉ hợp với template "Chỉ Text"
  xxl: 320, // tự co lại cho vừa tem → chữ cao ~28mm
};

/** Template có QR/barcode: chữ to quá sẽ phá layout → chặn trần. */
const MAX_FONT_PX_WITH_CODE = 40;

const FONT_SIZES: Array<{ key: FontSizeKey; label: string; desc: string }> = [
  { key: 'sm', label: 'Nhỏ', desc: '~1.7mm' },
  { key: 'md', label: 'Vừa', desc: '~2.5mm' },
  { key: 'lg', label: 'Lớn', desc: '~3.5mm' },
  { key: 'xl', label: 'Rất lớn', desc: '~14mm' },
  { key: 'xxl', label: 'Khổng lồ', desc: 'lấp đầy tem' },
];

const SOURCE_TYPES: Array<{ key: SourceType; label: string }> = [
  { key: 'store', label: 'Sản phẩm cửa hàng' },
  { key: 'spool', label: 'Cuộn nhựa' },
  { key: 'location', label: 'Vị trí kho' },
  { key: 'printer', label: 'Máy in' },
];

// ═══════════════════════════════════════════════
// Code 128B Barcode Encoder (scannable)
// ═══════════════════════════════════════════════

const C128_PATTERNS = [
  '11011001100','11001101100','11001100110','10010011000','10010001100',
  '10001001100','10011001000','10011000100','10001100100','11001001000',
  '11001000100','11000100100','10110011100','10011011100','10011001110',
  '10111001100','10011101100','10011100110','11001110010','11001011100',
  '11001001110','11011100100','11001110100','11101101110','11101001100',
  '11100101100','11100100110','11101100100','11100110100','11100110010',
  '11011011000','11011000110','11000110110','10100011000','10001011000',
  '10001000110','10110001000','10001101000','10001100010','11010001000',
  '11000101000','11000100010','10110111000','10110001110','10001101110',
  '10111011000','10111000110','10001110110','11101110110','11010001110',
  '11000101110','11011101000','11011100010','11011101110','11101011000',
  '11101000110','11100010110','11101101000','11101100010','11100011010',
  '11101111010','11001000010','11110001010','10100110000','10100001100',
  '10010110000','10010000110','10000101100','10000100110','10110010000',
  '10110000100','10011010000','10011000010','10000110100','10000110010',
  '11000010010','11001010000','11110111010','11000010100','10001111010',
  '10100111100','10010111100','10010011110','10111100100','10011110100',
  '10011110010','11110100100','11110010100','11110010010','11011011110',
  '11011110110','11110110110','10101111000','10100011110','10001011110',
  '10111101000','10111100010','11110101000','11110100010','10111011110',
  '10111101110','11101011110','11110101110','11010000100','11010010000',
  '11010011100','1100011101011',
];

function encodeCode128B(text: string): string {
  const START_B = 104;
  const STOP = 106;
  let checksum = START_B;
  let pattern = C128_PATTERNS[START_B];
  for (let i = 0; i < text.length; i++) {
    const val = text.charCodeAt(i) - 32;
    if (val < 0 || val > 95) continue;
    checksum += val * (i + 1);
    pattern += C128_PATTERNS[val];
  }
  pattern += C128_PATTERNS[checksum % 103];
  pattern += C128_PATTERNS[STOP];
  return pattern;
}

function drawBarcode128(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, content: string) {
  if (!content) return;
  // Loại bỏ ký tự ngoài ASCII printable (32-127) cho Code128B
  const asciiContent = content.replace(/[^\x20-\x7E]/g, '');
  if (!asciiContent) return;
  const bits = encodeCode128B(asciiContent);
  const moduleW = w / bits.length;
  ctx.fillStyle = '#000000';
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] === '1') {
      ctx.fillRect(x + i * moduleW, y, Math.ceil(moduleW), h);
    }
  }
}

// ═══════════════════════════════════════════════
// QR Code Renderer (real scannable QR)
// ═══════════════════════════════════════════════

async function drawQROnCanvas(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, size: number,
  content: string
) {
  if (!content) return;
  try {
    const dataUrl = await QRCode.toDataURL(content, {
      errorCorrectionLevel: 'M',
      margin: 0,
      width: size,
      color: { dark: '#000000ff', light: '#ffffffff' },
    });
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = dataUrl;
    });
    ctx.drawImage(img, x, y, size, size);
  } catch {
    // Fallback placeholder
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, size, size);
    ctx.fillStyle = '#000';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('QR', x + size / 2, y + size / 2 + 3);
    ctx.textAlign = 'start';
  }
}

// ═══════════════════════════════════════════════
// Bitmap Extraction (canvas → 1-bit monochrome)
// ═══════════════════════════════════════════════

/**
 * Chuyển canvas 320×240 thành bitmap 1-bit (9600 bytes).
 * Trong lệnh TSPL BITMAP của máy in nhãn nhiệt (XPrinter):
 * - Bit 0 = Đốt nhiệt (in ra màu đen)
 * - Bit 1 = Không đốt nhiệt (giữ nguyên giấy trắng)
 *
 * Mặc định (!invert): Nền giấy trắng (bit 1) + Chữ/mã đen (bit 0).
 * Nếu invert = true: Nền đen (bit 0) + Chữ/mã trắng (bit 1).
 */
function canvasToMonoBitmap(canvas: HTMLCanvasElement, invert: boolean = false): Uint8Array {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas context unavailable');

  const imageData = ctx.getImageData(0, 0, LABEL_W, LABEL_H);
  const pixels = imageData.data; // RGBA, 4 bytes/pixel
  const bytesPerRow = LABEL_W / 8; // 40
  const bitmap = new Uint8Array(bytesPerRow * LABEL_H);

  // Mặc định nền giấy trắng (toàn bộ bit = 1), trừ khi bật đảo màu (toàn bộ bit = 0)
  if (!invert) {
    bitmap.fill(0xff);
  }

  for (let y = 0; y < LABEL_H; y++) {
    for (let x = 0; x < LABEL_W; x++) {
      const idx = (y * LABEL_W + x) * 4;
      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];
      const a = pixels[idx + 3] / 255;
      // Grayscale + alpha pre-multiply against white background
      const gray = (0.299 * r + 0.587 * g + 0.114 * b) * a + 255 * (1 - a);

      if (gray < 128) {
        const byteIdx = y * bytesPerRow + Math.floor(x / 8);
        const bitIdx = 7 - (x % 8); // MSB first
        if (!invert) {
          // Xóa bit về 0 -> máy in đốt nhiệt thành màu đen
          bitmap[byteIdx] &= ~(1 << bitIdx);
        } else {
          // Đặt bit 1 -> máy in không đốt nhiệt (giữ trắng)
          bitmap[byteIdx] |= (1 << bitIdx);
        }
      }
    }
  }
  return bitmap;
}

function uint8ToBase64(arr: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < arr.length; i++) {
    bin += String.fromCharCode(arr[i]);
  }
  return btoa(bin);
}

// ═══════════════════════════════════════════════
// Template Renderers — tọa độ 320×240 = TSPL 1:1
// ═══════════════════════════════════════════════

const FONT_FAMILY = '"Inter", "Segoe UI", system-ui, sans-serif';

async function renderQrText(
  ctx: CanvasRenderingContext2D,
  l1: string, l2: string, l3: string,
  qr: string, fs: number
) {
  // QR bên trái — cell 8, version 1 = 21 modules → 168 dots
  const qrSize = 168;
  await drawQROnCanvas(ctx, 10, 10, qrSize, qr || l1 || 'QR');

  // Line2 dưới QR
  ctx.fillStyle = '#000';
  ctx.font = `500 12px ${FONT_FAMILY}`;
  ctx.textAlign = 'start';
  ctx.textBaseline = 'top';
  ctx.fillText(l2 || '', 16, 190, 155);

  // Divider dọc tại x=176
  ctx.fillStyle = '#000';
  ctx.fillRect(176, 0, 2, LABEL_H);

  // Line1 xoay 270° bên phải — bắt đầu từ (192, 230) chạy lên trên
  ctx.save();
  ctx.translate(198, 232);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = '#000';
  ctx.font = `bold ${fs}px ${FONT_FAMILY}`;
  ctx.textBaseline = 'top';
  ctx.fillText(l1 || '', 0, 0, 220);
  ctx.restore();

  // Line3 xoay 270° — cách line1 sang phải
  ctx.save();
  ctx.translate(240, 232);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = '#000';
  ctx.font = `500 ${Math.round(fs * 0.85)}px ${FONT_FAMILY}`;
  ctx.textBaseline = 'top';
  ctx.fillText(l3 || '', 0, 0, 220);
  ctx.restore();
}

function renderBarcodeText(
  ctx: CanvasRenderingContext2D,
  l1: string, l2: string, l3: string,
  qr: string, fs: number
) {
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'top';

  // Line2 to trên cùng, căn giữa
  ctx.font = `bold ${fs}px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.fillText(l2 || '', LABEL_W / 2, 8, LABEL_W - 20);

  // Barcode giữa
  const barcodeY = 12 + fs + 6;
  const barcodeContent = qr || l1 || 'TEST';
  drawBarcode128(ctx, 30, barcodeY, 260, 80, barcodeContent);

  // Line3 STT dưới barcode, căn giữa
  ctx.font = `500 14px ${FONT_FAMILY}`;
  ctx.fillText(l3 || '', LABEL_W / 2, barcodeY + 88, LABEL_W - 20);

  ctx.textAlign = 'start';
}

function renderTextOnly(
  ctx: CanvasRenderingContext2D,
  l1: string, l2: string, l3: string,
  fs: number
) {
  const lines = [l1, l2, l3].filter(Boolean);
  if (lines.length === 0) return;

  const PAD_X = 10;
  const PAD_Y = 8;
  const GAP = 8;
  const maxW = LABEL_W - PAD_X * 2;
  const maxH = LABEL_H - PAD_Y * 2;

  const fontOf = (i: number, size: number) => `${i === 0 ? 'bold' : '500'} ${size}px ${FONT_FAMILY}`;

  // Đo theo hộp bao thật của chữ (không phải em-box) → chữ lấp đầy tem chứ không hụt
  const measure = (size: number) =>
    lines.map((text, i) => {
      ctx.font = fontOf(i, size);
      const m = ctx.measureText(text);
      const asc = m.actualBoundingBoxAscent || size * 0.75;
      const desc = m.actualBoundingBoxDescent || size * 0.25;
      return { w: m.width, asc, desc, h: asc + desc };
    });

  // Chọn cỡ lớn nhất vẫn vừa tem, tối đa bằng cỡ người dùng chọn
  let size = Math.max(8, Math.round(fs));
  let boxes = measure(size);
  const totalH = (b: typeof boxes) => b.reduce((s, x) => s + x.h, 0) + GAP * (b.length - 1);
  const widest = (b: typeof boxes) => Math.max(...b.map((x) => x.w));
  while (size > 8 && (totalH(boxes) > maxH || widest(boxes) > maxW)) {
    size -= 2;
    boxes = measure(size);
  }

  ctx.fillStyle = '#000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  let y = Math.max(PAD_Y, Math.floor((LABEL_H - totalH(boxes)) / 2));
  lines.forEach((text, i) => {
    ctx.font = fontOf(i, size);
    ctx.fillText(text, LABEL_W / 2, y + boxes[i].asc, maxW);
    y += boxes[i].h + GAP;
  });

  ctx.textAlign = 'start';
  ctx.textBaseline = 'top';
}

async function renderQrLarge(
  ctx: CanvasRenderingContext2D,
  l1: string, l2: string,
  qr: string
) {
  // QR lớn căn giữa — cell 10, version 1 = 21 modules → 210 dots
  const qrSize = 200;
  const qrX = Math.floor((LABEL_W - qrSize) / 2);
  await drawQROnCanvas(ctx, qrX, 5, qrSize, qr || l1 || 'QR');

  // Label nhỏ dưới cùng
  const label = l1 || l2 || '';
  if (label) {
    ctx.fillStyle = '#000';
    ctx.font = `500 13px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(label, LABEL_W / 2, 212, LABEL_W - 16);
    ctx.textAlign = 'start';
  }
}

// ═══════════════════════════════════════════════
// Preview Canvas Component — 320×240 pixel-perfect
// ═══════════════════════════════════════════════

function LabelPreview({
  template, line1, line2, line3, qrContent, fontSize,
  canvasRef,
}: {
  template: TemplateKey;
  line1: string;
  line2: string;
  line3: string;
  qrContent: string;
  fontSize: FontSizeKey;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}) {
  useEffect(() => {
    const render = async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      // Chính xác kích thước TSPL
      canvas.width = LABEL_W;
      canvas.height = LABEL_H;

      // Nền trắng
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, LABEL_W, LABEL_H);

      const fs = template === 'text-only'
        ? CANVAS_FONT_PX[fontSize]
        : Math.min(CANVAS_FONT_PX[fontSize], MAX_FONT_PX_WITH_CODE);
      const qr = qrContent || line1;

      switch (template) {
        case 'qr-text':
          await renderQrText(ctx, line1, line2, line3, qr, fs);
          break;
        case 'barcode-text':
          renderBarcodeText(ctx, line1, line2, line3, qr, fs);
          break;
        case 'text-only':
          renderTextOnly(ctx, line1, line2, line3, fs);
          break;
        case 'qr-large':
          await renderQrLarge(ctx, line1, line2, qr);
          break;
      }
    };
    render();
  }, [template, line1, line2, line3, qrContent, fontSize, canvasRef]);

  return (
    <div className="rounded-xl bg-slate-800 p-3">
      {/* Container giữ tỉ lệ 320:240 (4:3), canvas stretched lên */}
      <div className="relative w-full" style={{ aspectRatio: '320/240' }}>
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full rounded-lg"
          style={{ imageRendering: 'pixelated' }}
        />
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-slate-500 font-mono">
        <span>← 40mm →</span>
        <span>320×240 dots (203 DPI)</span>
        <span>↕ 30mm</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════

export default function PrintLabelTab({ allSpools, locations, printers }: PrintLabelTabProps) {
  // ── Canvas ref — dùng chung cho preview VÀ bitmap extraction ──
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // ── Source mode ──
  const [sourceMode, setSourceMode] = useState<SourceMode>('custom');
  const [sourceType, setSourceType] = useState<SourceType>('store');
  const [sourceSearch, setSourceSearch] = useState('');
  const [storeProducts, setStoreProducts] = useState<StoreProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // ── Content ──
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [line3, setLine3] = useState('');
  const [qrContent, setQrContent] = useState('');

  // ── Template & style ──
  const [template, setTemplate] = useState<TemplateKey>('qr-text');
  const [fontSize, setFontSize] = useState<FontSizeKey>('md');
  const [copies, setCopies] = useState(1);
  const [invertColor, setInvertColor] = useState(false);

  // ── Print state ──
  const [isPrinting, setIsPrinting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // ── Fetch store products ──
  useEffect(() => {
    if (sourceMode === 'list' && sourceType === 'store' && storeProducts.length === 0) {
      setLoadingProducts(true);
      fetch('/api/store-products')
        .then((r) => r.json())
        .then((data) => {
          if (data.status === 'success' && Array.isArray(data.data)) {
            setStoreProducts(data.data);
          }
        })
        .catch(() => {})
        .finally(() => setLoadingProducts(false));
    }
  }, [sourceMode, sourceType, storeProducts.length]);

  // ── Build source list ──
  const sourceItems = useMemo<SourceItem[]>(() => {
    switch (sourceType) {
      case 'store':
        return storeProducts.map((p) => ({
          id: p.id,
          label: p.ten,
          sub: `${p.danhMuc} • ${p.gia.toLocaleString()}đ`,
          line1: p.maQR || p.id,
          line2: p.ten,
          line3: `${p.gia.toLocaleString()}đ / ${p.donVi}`,
          qrContent: p.maQR || p.id,
        }));
      case 'spool':
        return allSpools.map((s) => ({
          id: s.id,
          label: `${s.filamentType} - ${s.filamentColorName}`,
          sub: s.filamentBrand || '',
          line1: s.id,
          line2: `${s.filamentBrand || ''} ${s.filamentType}`.trim(),
          line3: s.filamentColorName,
          qrContent: s.id,
        }));
      case 'location':
        return locations.map((l) => ({
          id: l.id,
          label: l.name,
          sub: l.id,
          line1: l.id,
          line2: 'VỊ TRÍ KHO',
          line3: l.name,
          qrContent: l.id,
        }));
      case 'printer':
        return printers.map((p) => ({
          id: p.id,
          label: p.name,
          sub: p.id,
          line1: p.id,
          line2: 'MÁY IN 3D',
          line3: p.name,
          qrContent: p.id,
        }));
      default:
        return [];
    }
  }, [sourceType, storeProducts, allSpools, locations, printers]);

  const filteredItems = useMemo(() => {
    const q = sourceSearch.trim().toLowerCase();
    if (!q) return sourceItems;
    return sourceItems.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.sub.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q)
    );
  }, [sourceItems, sourceSearch]);

  const handleSelectItem = useCallback((item: SourceItem) => {
    setLine1(item.line1);
    setLine2(item.line2);
    setLine3(item.line3);
    setQrContent(item.qrContent);
  }, []);

  // ── Print handler — gửi bitmap từ canvas ──
  const handlePrint = async () => {
    const canvas = canvasRef.current;
    if (!canvas) {
      setErrorMsg('Canvas chưa sẵn sàng');
      return;
    }
    if (!line1 && !line2 && !line3) {
      setErrorMsg('Vui lòng nhập ít nhất 1 dòng nội dung');
      return;
    }

    setIsPrinting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      // Chuyển canvas → bitmap 1-bit → base64
      const bitmap = canvasToMonoBitmap(canvas, invertColor);
      const bitmapBase64 = uint8ToBase64(bitmap);

      const res = await fetch('/api/print-jobs/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bitmapBase64,
          copies,
          label: [line1, line2, line3].filter(Boolean).join(' | '),
        }),
      });

      const data = await res.json();
      if (data.status === 'success') {
        setSuccessMsg(data.message || `Đã in ${copies} tem thành công!`);
        setTimeout(() => setSuccessMsg(''), 4000);
      } else {
        setErrorMsg(data.message || 'Lỗi khi in tem');
      }
    } catch {
      setErrorMsg('Lỗi kết nối máy chủ');
    } finally {
      setIsPrinting(false);
    }
  };

  const handleClearForm = () => {
    setLine1('');
    setLine2('');
    setLine3('');
    setQrContent('');
    setSuccessMsg('');
    setErrorMsg('');
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      {/* ═══════════ CỘT TRÁI: Nguồn nội dung ═══════════ */}
      <div className="xl:col-span-2 space-y-5">
        {/* ── Chuyển chế độ ── */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900/80">
          <div className="flex items-center gap-3 mb-4">
            <Tag size={18} className="text-indigo-500" />
            <h3 className="text-base font-bold">Nguồn nội dung</h3>
          </div>

          <div className="flex gap-2 mb-5">
            <button
              type="button"
              onClick={() => setSourceMode('custom')}
              className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
                sourceMode === 'custom'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
              }`}
            >
              Nhập tùy chỉnh
            </button>
            <button
              type="button"
              onClick={() => setSourceMode('list')}
              className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
                sourceMode === 'list'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
              }`}
            >
              Chọn từ danh sách
            </button>
          </div>

          {sourceMode === 'list' && (
            <div className="space-y-3 mb-5">
              <div className="flex gap-2 flex-wrap">
                {SOURCE_TYPES.map((src) => (
                  <button
                    key={src.key}
                    type="button"
                    onClick={() => {
                      setSourceType(src.key);
                      setSourceSearch('');
                    }}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                      sourceType === src.key
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
                    }`}
                  >
                    {src.label}
                  </button>
                ))}
              </div>

              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                <input
                  value={sourceSearch}
                  onChange={(e) => setSourceSearch(e.target.value)}
                  className="h-9 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800"
                  placeholder="Tìm kiếm..."
                />
              </div>

              <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50 scrollbar-thin">
                {loadingProducts && sourceType === 'store' ? (
                  <div className="p-4 text-center text-xs text-slate-500">Đang tải...</div>
                ) : filteredItems.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-500">Không có dữ liệu</div>
                ) : (
                  filteredItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectItem(item)}
                      className="flex w-full items-center gap-3 border-b border-slate-200 px-4 py-2.5 text-left transition-colors hover:bg-indigo-50 dark:border-slate-700 dark:hover:bg-indigo-950/30 last:border-b-0"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{item.label}</p>
                        <p className="text-xs text-slate-500 truncate">{item.sub}</p>
                      </div>
                      <span className="shrink-0 rounded bg-slate-200 px-2 py-0.5 text-[10px] font-mono text-slate-600 dark:bg-slate-700 dark:text-slate-400">
                        {item.id}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ── Nhập nội dung (tiếng Việt OK!) ── */}
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Dòng 1 — Mã / ID</label>
              <input
                value={line1}
                onChange={(e) => setLine1(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800"
                placeholder="VD: PLA-WHT-01, SP-001"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Dòng 2 — Loại / Tên</label>
              <input
                value={line2}
                onChange={(e) => setLine2(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800"
                placeholder="VD: Giá đỡ điện thoại"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Dòng 3 — Chi tiết / Giá</label>
              <input
                value={line3}
                onChange={(e) => setLine3(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800"
                placeholder="VD: 50.000đ"
              />
            </div>

            {template !== 'text-only' && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">
                  Nội dung {template === 'barcode-text' ? 'Barcode' : 'QR'} (để trống = dùng Dòng 1)
                </label>
                <input
                  value={qrContent}
                  onChange={(e) => setQrContent(e.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800"
                  placeholder="Tự động dùng nội dung Dòng 1"
                />
              </div>
            )}

            <button
              type="button"
              onClick={handleClearForm}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-400 transition-colors"
            >
              <X size={13} />
              Xóa nội dung
            </button>
          </div>
        </div>

        {/* ── Chọn template ── */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900/80">
          <h3 className="mb-4 text-base font-bold">Kiểu thiết kế</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {TEMPLATES.map((t) => {
              const Icon = t.icon;
              const active = template === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTemplate(t.key)}
                  className={`group relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all ${
                    active
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 shadow-lg shadow-indigo-500/15'
                      : 'border-slate-200 bg-slate-50 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-slate-600'
                  }`}
                >
                  <div
                    className={`rounded-lg p-2.5 transition-colors ${
                      active
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-200 text-slate-500 group-hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-400'
                    }`}
                  >
                    <Icon size={22} />
                  </div>
                  <span className={`text-xs font-bold ${active ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-400'}`}>
                    {t.label}
                  </span>
                  <span className="text-[10px] text-slate-500 text-center leading-tight">{t.desc}</span>
                  {active && (
                    <div className="absolute -top-1.5 -right-1.5 rounded-full bg-indigo-600 p-0.5">
                      <CheckCircle2 size={14} className="text-white" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Font size + Số bản ── */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900/80">
          <div className="flex flex-col sm:flex-row gap-6">
            <div className="flex-1">
              <h4 className="mb-3 text-sm font-bold">Cỡ chữ</h4>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {FONT_SIZES.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFontSize(f.key)}
                    className={`flex-1 rounded-xl px-3 py-2.5 text-center transition-all ${
                      fontSize === f.key
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
                    }`}
                  >
                    <div className="text-sm font-bold">{f.label}</div>
                    <div className="text-[10px] opacity-70">{f.desc}</div>
                  </button>
                ))}
              </div>
              {template !== 'text-only' && CANVAS_FONT_PX[fontSize] > MAX_FONT_PX_WITH_CODE && (
                <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
                  Cỡ này chỉ dùng được với kiểu “Chỉ Text” — kiểu có QR/barcode sẽ tự giảm về ~5mm.
                </p>
              )}
            </div>

            <div className="w-full sm:w-44">
              <h4 className="mb-3 text-sm font-bold">Số bản in</h4>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCopies((v) => Math.max(1, v - 1))}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-slate-100 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
                >
                  <Minus size={16} />
                </button>
                <input
                  type="number"
                  value={copies}
                  min={1}
                  max={20}
                  onChange={(e) => setCopies(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                  className="h-10 w-full flex-1 rounded-lg border border-slate-300 bg-white text-center text-lg font-bold outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800"
                />
                <button
                  type="button"
                  onClick={() => setCopies((v) => Math.min(20, v + 1))}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-slate-100 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
            <label className="inline-flex items-center gap-2.5 cursor-pointer select-none text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors">
              <input
                type="checkbox"
                checked={invertColor}
                onChange={(e) => setInvertColor(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800"
              />
              <span>Đảo màu tem khi in (Nền đen chữ trắng)</span>
            </label>
          </div>
        </div>
      </div>

      {/* ═══════════ CỘT PHẢI: Preview + Nút In ═══════════ */}
      <div className="space-y-5">
        {/* Preview */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900/80">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold">Xem trước tem</h3>
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
              WYSIWYG
            </span>
          </div>
          <LabelPreview
            template={template}
            line1={line1}
            line2={line2}
            line3={line3}
            qrContent={qrContent}
            fontSize={fontSize}
            canvasRef={canvasRef}
          />
          <p className="mt-2 text-[10px] text-slate-500 text-center">
            Hỗ trợ tiếng Việt đầy đủ dấu • Preview = bản in
          </p>
        </div>

        {/* Thông báo */}
        {successMsg && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-950/30 p-3 text-sm text-emerald-300">
            <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />
            {successMsg}
          </div>
        )}
        {errorMsg && (
          <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-950/30 p-3 text-sm text-red-300">
            <X size={16} className="shrink-0 text-red-400" />
            {errorMsg}
          </div>
        )}

        {/* Nút in */}
        <button
          type="button"
          onClick={handlePrint}
          disabled={isPrinting || (!line1 && !line2 && !line3)}
          className={`flex w-full items-center justify-center gap-3 rounded-2xl px-6 py-4 text-base font-bold transition-all ${
            isPrinting
              ? 'bg-slate-600 text-slate-300 cursor-wait'
              : !line1 && !line2 && !line3
                ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-xl shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:scale-[1.02] active:scale-[0.98]'
          }`}
        >
          <Printer size={22} />
          {isPrinting ? 'Đang gửi lệnh in...' : `In ${copies > 1 ? `${copies} bản` : 'tem'}`}
        </button>

        {/* Tóm tắt */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/30">
          <h4 className="mb-2 text-xs font-bold text-slate-500 uppercase tracking-wider">Tóm tắt</h4>
          <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
            <div className="flex justify-between">
              <span>Template:</span>
              <span className="font-semibold">{TEMPLATES.find((t) => t.key === template)?.label}</span>
            </div>
            <div className="flex justify-between">
              <span>Cỡ chữ:</span>
              <span className="font-semibold">{FONT_SIZES.find((f) => f.key === fontSize)?.label}</span>
            </div>
            <div className="flex justify-between">
              <span>Số bản:</span>
              <span className="font-semibold">{copies}</span>
            </div>
            <div className="flex justify-between">
              <span>Kích thước:</span>
              <span className="font-semibold">40×30mm</span>
            </div>
            <div className="flex justify-between">
              <span>Chế độ in:</span>
              <span className="font-semibold text-emerald-500">Bitmap (pixel-perfect)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
