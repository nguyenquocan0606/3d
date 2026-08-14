import * as fs from 'fs';

/**
 * Đường dẫn mặc định tới thiết bị máy in USB XPrinter.
 * Có thể override qua biến môi trường PRINTER_DEVICE_PATH.
 */
export const PRINTER_DEVICE_PATH = process.env.PRINTER_DEVICE_PATH || '/dev/usb/lp0';

/**
 * Loại bỏ dấu tiếng Việt khỏi chuỗi.
 * XPrinter firmware font built-in không hỗ trợ unicode tiếng Việt,
 * nên cần chuẩn hóa trước khi gửi lệnh in.
 *
 * Ví dụ: "KHO LƯU TRỮ" → "KHO LUU TRU"
 */
export function removeDiacritics(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Xử lý riêng ký tự đặc biệt tiếng Việt (đ/Đ)
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/**
 * Làm sạch chuỗi trước khi nhúng vào lệnh TSPL.
 * Nội dung nằm trong cặp nháy kép "..." của lệnh, nên:
 * - Dấu " sẽ làm hỏng cú pháp lệnh → thay bằng '
 * - Ký tự xuống dòng cho phép chèn lệnh TSPL lạ → thay bằng khoảng trắng
 */
export function sanitizeTSPL(str: string): string {
  if (!str) return '';
  return str.replace(/"/g, "'").replace(/[\r\n]+/g, ' ');
}

/**
 * Thông tin nhãn in gồm 3 dòng text.
 */
export interface LabelData {
  /** Dòng 1: thường là ID (VD: PLA-WHT-01, LOC-01) */
  line1: string;
  /** Dòng 2: thường là loại (VD: PLA, VỊ TRÍ KHO) */
  line2: string;
  /** Dòng 3: thường là tên chi tiết (VD: Trắng, Kho A) */
  line3: string;
}

/**
 * Sinh chuỗi lệnh TSPL cho máy in nhãn nhiệt.
 * Thiết kế cho kích thước giấy 40mm x 30mm (320 x 240 dots @ 203 DPI).
 *
 * Layout chia đôi theo chiều 40mm (mỗi nửa 20mm = 160 dots):
 *
 *          20mm (160 dots)       20mm (160 dots)
 *  ┌────────────────────────┬────────────────────────┐
 *  │  ┌──────────────────┐  │                        │
 *  │  │                  │  │   LINE1 (ID/Mã)        │
 *  │  │    QR CODE       │  │   ──────────────       │  30mm
 *  │  │    (cell=6)      │  │   LINE3 (Tên màu)      │  (240 dots)
 *  │  │                  │  │                        │
 *  │  └──────────────────┘  │                        │
 *  │  LINE2 (Loại nhựa)     │                        │
 *  └────────────────────────┴────────────────────────┘
 *
 * - QR Code nằm to nhất có thể trong nửa trái (cell size 6)
 * - Loại nhựa (line2) nằm dưới QR, text ngang song song chiều 40mm
 * - Nửa phải: mã ID (line1) + tên màu (line3) phân cách bằng đường kẻ
 *
 * @param qrCode - Nội dung mã QR (VD: "PLA-WHT-01")
 * @param labelData - 3 dòng text: line1=ID, line2=loại, line3=tên
 * @returns Chuỗi lệnh TSPL sẵn sàng gửi tới máy in
 */
export function buildTSPLCommand(qrCode: string, labelData: LabelData): string {
  // Chuẩn hóa text: loại bỏ dấu tiếng Việt + uppercase + escape ký tự phá lệnh TSPL
  const line1 = sanitizeTSPL(removeDiacritics(labelData.line1)).toUpperCase();
  const line2 = sanitizeTSPL(removeDiacritics(labelData.line2)).toUpperCase();
  const line3 = sanitizeTSPL(removeDiacritics(labelData.line3)).toUpperCase();

  // Chuẩn hóa nội dung QR code
  const qrContent = sanitizeTSPL(removeDiacritics(qrCode)).toUpperCase();

  // ── Tọa độ layout mới (đơn vị: dots, 203 DPI, 1mm ≈ 8 dots, 5mm = 40 dots) ──
  // Chiều ngang tem: 320 dots. Chiều dọc: 240 dots.

  // 1. QR Code (nửa trái): cell size 8
  const qrCellSize = 8;
  const qrX = 10;
  const qrY = 10;

  // Ước lượng kích thước QR Code thực tế dựa trên số ký tự để căn giữa chính xác loại nhựa
  // QR Version 1: <= 14 ký tự (21 modules), Version 2: <= 26 ký tự (25 modules)
  const qrVersion = qrContent.length <= 14 ? 1 : (qrContent.length <= 26 ? 2 : 3);
  const qrModules = 21 + (qrVersion - 1) * 4;
  const qrSize = qrModules * qrCellSize; // Rộng/cao của QR code thực tế (ví dụ: 168 dots hoặc 200 dots)

  // 2. Loại nhựa (line2): in ngang, CĂN GIỮA DƯỚI QR CODE thực tế
  const line2Length = line2.length * 12; // Font "2" rộng 12 dots/ký tự
  const line2X = qrX + Math.max(0, Math.floor((qrSize - line2Length) / 2));
  const line2Y = 212; // Cách lề dưới 28 dots (khoảng 3.5mm)

  // 3. Đường kẻ dọc phân cách vùng QR (chiếm 22mm = 176 dots) và vùng chữ xoay (chiếm 18mm = 144 dots)
  const dividerX = 176;
  const dividerWidth = 2;

  // 4. Mã ID (line1) và Tên màu (line3) ở nửa phải xoay 270 độ
  // Y = 224: dịch điểm bắt đầu xuống dưới để điểm trên cùng của chữ (đầu chữ ở trên) 
  // cách viền trên tối thiểu 8mm (64 dots). Chữ chạy ngược lên trên đến tối đa Y = 64.
  const line1Y = 224;
  // X căn lề cho Tên màu (line3) đặt ở X = 236 (tương ứng với 29.5mm, cách dòng 1 khoảng 12 dots)
  // Font "2" nhân đôi có độ rộng 24 dots (chiếm từ X = 236 đến X = 260)
  const line3X = 236;
  const line3Y = 224;

  // Mã ID (line1) đặt ở X = 192 (cách vạch dọc 16 dots)
  // Font "3" nhân đôi có độ rộng 32 dots (chiếm từ X = 192 đến X = 224)
  const line1X = 192; 

  const commands = [
    'SIZE 40 mm, 30 mm',          // Kích thước tem: rộng 40mm, cao 30mm
    'GAP 2 mm, 0 mm',             // Khoảng cách giữa các tem
    'DIRECTION 1',                 // Hướng in
    'REFERENCE 0,0',               // Điểm gốc
    'OFFSET 0 mm',                 // Offset
    'CLS',                         // Xóa buffer

    // ── Nửa trái: QR Code to 30% + Loại nhựa căn giữa theo QR zone ──
    `QRCODE ${qrX},${qrY},M,${qrCellSize},A,0,"${qrContent}"`,
    `TEXT ${line2X},${line2Y},"2",0,1,1,"${line2}"`,

    // ── Đường kẻ dọc phân cách ──
    `BAR ${dividerX},0,${dividerWidth},240`,

    // ── Nửa phải: Mã ID và Tên màu xoay 270 độ, cỡ chữ nhân đôi ──
    `TEXT ${line1X},${line1Y},"3",270,2,2,"${line1}"`,
    `TEXT ${line3X},${line3Y},"2",270,2,2,"${line3}"`,

    'PRINT 1,1',                   // In 1 bản, 1 tờ
  ];

  return commands.join('\n') + '\n';
}


/**
 * Gửi lệnh in TSPL tới máy in USB qua cổng thiết bị.
 * Ghi bất đồng bộ để không chặn event loop của server khi in batch lớn.
 *
 * @param tsplCommand - Chuỗi lệnh TSPL đã được sinh từ buildTSPLCommand()
 * @param devicePath - Đường dẫn thiết bị (mặc định: /dev/usb/lp0)
 * @throws Error nếu không thể ghi vào cổng thiết bị (máy in chưa cắm, sai quyền, ...)
 */
export async function sendToPrinter(tsplCommand: string, devicePath: string = PRINTER_DEVICE_PATH): Promise<void> {
  await fs.promises.writeFile(devicePath, tsplCommand, { encoding: 'utf-8' });
}

/**
 * Sinh chuỗi lệnh TSPL in 1D Barcode cho Đơn hàng.
 * - Loại bỏ mã QR, sử dụng Barcode 1D (Code 128).
 * - Làm nổi bật Tên miếng (Tên sản phẩm - Tên miếng) thật to.
 * - Hiện STT (ví dụ 1-1).
 */
export function buildOrderBarcodeTSPLCommand(barcode: string, labelData: LabelData): string {
  const line2 = sanitizeTSPL(removeDiacritics(labelData.line2)).toUpperCase();
  const line3 = sanitizeTSPL(removeDiacritics(labelData.line3)).toUpperCase();
  const barcodeContent = sanitizeTSPL(removeDiacritics(barcode)).toUpperCase();
  
  // Căn lề trái 2mm cho Line 2 (Tên miếng)
  const line2X = 16;
  
  // Do máy in thực tế bị tràn chữ ở ký tự 18-19, ta giới hạn maxChars = 16 để tuyệt đối an toàn
  const maxChars = 16;
  const nameLines = [];
  let remaining = line2;

  while (remaining.length > 0 && nameLines.length < 2) {
    if (remaining.length <= maxChars) {
      nameLines.push(remaining);
      break;
    }
    
    // Tìm khoảng trắng hoặc dấu gạch ngang cuối cùng trong giới hạn maxChars
    let splitIndex = remaining.lastIndexOf(' ', maxChars);
    if (splitIndex === -1) {
      splitIndex = remaining.lastIndexOf('-', maxChars);
    }
    
    // Nếu là từ liền mạch quá dài, cắt cứng luôn tại maxChars
    if (splitIndex === -1 || splitIndex === 0) {
      splitIndex = maxChars;
    }

    nameLines.push(remaining.substring(0, splitIndex).trim());
    // Lấy phần còn lại
    remaining = remaining.substring(splitIndex).trim();
    // Bỏ dấu gạch ngang ở đầu dòng mới nếu bị cắt ngang
    if (remaining.startsWith('-')) remaining = remaining.substring(1).trim();
  }

  const printLine1 = nameLines[0] || '';
  const printLine2 = nameLines[1] || ''; // Chỉ hỗ trợ tối đa 2 dòng

  // Tính toán căn giữa cho Line 3 (STT)
  const line3CharWidth = 12; // Font "3" scale 1,1
  const line3Length = line3.length * line3CharWidth;
  const line3X = Math.max(0, Math.floor((320 - line3Length) / 2));

  // Mã vạch Code 128
  const barcodeX = 40; 
  // Nếu có 2 dòng text thì đẩy barcode xuống một chút
  const barcodeY = printLine2 ? 80 : 70;

  const commands = [
    'SIZE 40 mm, 30 mm',
    'GAP 2 mm, 0 mm',
    'DIRECTION 1',
    'REFERENCE 0,0',
    'OFFSET 0 mm',
    'CLS',

    // In tên miếng (hỗ trợ xuống dòng) - dùng Font "3" scale 1,1 như cũ
    ...(printLine2 
      ? [
          `TEXT ${line2X},10,"3",0,1,1,"${printLine1}"`,
          `TEXT ${line2X},40,"3",0,1,1,"${printLine2}"`
        ]
      : [
          `TEXT ${line2X},25,"3",0,1,1,"${printLine1}"`
        ]),

    // Barcode 1D ở giữa, human_readable = 0 (ẩn text), chiều cao 80, narrow=2, wide=4
    `BARCODE ${barcodeX},${barcodeY},"128M",80,0,0,2,4,"${barcodeContent}"`,

    // STT ở dưới
    `TEXT ${line3X},180,"3",0,1,1,"${line3}"`,

    'PRINT 1,1',
  ];

  return commands.join('\n') + '\n\n';
}

/**
 * Sinh chuỗi lệnh TSPL cho mã QR từng slot (line) của máy in (2 trang).
 * Trang 1: QR to (25mm) bên trái, số to bên phải
 * Trang 2: Số rất to ở giữa
 */
export function buildPrinterSlotTSPLCommand(qrCode: string, slotNumber: number): string {
  const qrContent = sanitizeTSPL(removeDiacritics(qrCode)).toUpperCase();
  const slotStr = slotNumber.toString();
  
  const commands = [
    'SIZE 40 mm, 30 mm',
    'GAP 2 mm, 0 mm',
    'DIRECTION 1',
    'REFERENCE 0,0',
    'OFFSET 0 mm',
    
    // --- PAGE 1: Big QR + Slot Number ---
    'CLS',
    // QR Cell size 9 (approx 24-28mm depending on QR version)
    `QRCODE 20,15,M,9,A,0,"${qrContent}"`,
    // Text number on the right. Font 3, scale 3x3 is 60x72
    `TEXT 250,80,"3",0,3,3,"${slotStr}"`,
    'PRINT 1,1',

    // --- PAGE 2: Giant Slot Number ---
    'CLS',
    // Căn giữa số khổng lồ (Font 3 scale 6x6 is 120x144). X=100 centers it nicely.
    `TEXT 100,50,"3",0,6,6,"${slotStr}"`,
    'PRINT 1,1'
  ];

  return commands.join('\n') + '\n\n';
}

/**
 * Tùy chọn in tem tùy chỉnh từ tab "In Tem".
 */
export type CustomLabelTemplate = 'qr-text' | 'barcode-text' | 'text-only' | 'qr-large';
export type FontSizeKey = 'sm' | 'md' | 'lg';

export interface CustomLabelOptions {
  template: CustomLabelTemplate;
  /** Nội dung QR/Barcode (bỏ trống nếu text-only) */
  qrContent?: string;
  line1: string;
  line2: string;
  line3: string;
  fontSize: FontSizeKey;
  /** Số bản in (1-20) */
  copies: number;
}

/**
 * Mapping font size key → TSPL font scale (xScale, yScale).
 * Font "3" gốc: 20x32 dots/ký tự.
 */
const FONT_SCALE_MAP: Record<FontSizeKey, [number, number]> = {
  sm: [1, 1],
  md: [2, 2],
  lg: [3, 3],
};

/**
 * Sinh chuỗi lệnh TSPL cho tem nhãn tùy chỉnh (40x30mm).
 * Hỗ trợ 4 template thiết kế, tuỳ chỉnh font size và số bản in.
 *
 * @param opts - Tùy chọn in: template, nội dung, font, số bản
 * @returns Chuỗi lệnh TSPL sẵn sàng gửi tới máy in
 */
export function buildCustomLabelTSPLCommand(opts: CustomLabelOptions): string {
  const s1 = sanitizeTSPL(removeDiacritics(opts.line1)).toUpperCase();
  const s2 = sanitizeTSPL(removeDiacritics(opts.line2)).toUpperCase();
  const s3 = sanitizeTSPL(removeDiacritics(opts.line3)).toUpperCase();
  const qr = opts.qrContent ? sanitizeTSPL(removeDiacritics(opts.qrContent)).toUpperCase() : '';
  const [sx, sy] = FONT_SCALE_MAP[opts.fontSize] || [1, 1];
  const copies = Math.max(1, Math.min(opts.copies || 1, 20));

  const header = [
    'SIZE 40 mm, 30 mm',
    'GAP 2 mm, 0 mm',
    'DIRECTION 1',
    'REFERENCE 0,0',
    'OFFSET 0 mm',
    'CLS',
  ];

  let body: string[];

  switch (opts.template) {
    // ── QR + Text: QR bên trái, line1 + line3 bên phải, line2 dưới QR ──
    case 'qr-text': {
      const qrCellSize = 8;
      body = [
        `QRCODE 10,10,M,${qrCellSize},A,0,"${qr || s1}"`,
        `TEXT 16,212,"2",0,1,1,"${s2}"`,
        `BAR 176,0,2,240`,
        `TEXT 192,224,"3",270,${sx},${sy},"${s1}"`,
        `TEXT 236,224,"2",270,${sx},${sy},"${s3}"`,
      ];
      break;
    }

    // ── Barcode + Text: Tên to ở trên, barcode giữa, STT dưới ──
    case 'barcode-text': {
      const barcodeContent = qr || s1;
      // Căn giữa dòng text trên cùng
      const charWidth = 20 * sx;
      const textWidth = s2.length * charWidth;
      const textX = Math.max(0, Math.floor((320 - textWidth) / 2));
      body = [
        `TEXT ${textX},10,"3",0,${sx},${sy},"${s2}"`,
        `BARCODE 40,${10 + 32 * sy + 10},"128M",80,0,0,2,4,"${barcodeContent}"`,
        `TEXT ${Math.max(0, Math.floor((320 - s3.length * 12) / 2))},${10 + 32 * sy + 100},"3",0,1,1,"${s3}"`,
      ];
      break;
    }

    // ── Text Only: 3 dòng to, căn giữa dọc ──
    case 'text-only': {
      const lineHeight = 32 * sy + 8;
      const totalHeight = lineHeight * 3;
      const startY = Math.max(8, Math.floor((240 - totalHeight) / 2));
      const cw = 20 * sx;

      const x1 = Math.max(0, Math.floor((320 - s1.length * cw) / 2));
      const x2 = Math.max(0, Math.floor((320 - s2.length * cw) / 2));
      const x3 = Math.max(0, Math.floor((320 - s3.length * cw) / 2));

      body = [
        `TEXT ${x1},${startY},"3",0,${sx},${sy},"${s1}"`,
        `TEXT ${x2},${startY + lineHeight},"3",0,${sx},${sy},"${s2}"`,
        `TEXT ${x3},${startY + lineHeight * 2},"3",0,${sx},${sy},"${s3}"`,
      ];
      break;
    }

    // ── QR Lớn: QR chiếm gần hết tem + 1 dòng text nhỏ dưới ──
    case 'qr-large': {
      const cellSize = 10;
      // Căn giữa QR trong 320x240
      const qrEstSize = 21 * cellSize; // ~210 dots cho QR version 1
      const qrX = Math.max(0, Math.floor((320 - qrEstSize) / 2));
      const qrY = 5;
      // Text 1 dòng nhỏ dưới cùng, căn giữa
      const label = s1 || s2;
      const labelWidth = label.length * 12;
      const labelX = Math.max(0, Math.floor((320 - labelWidth) / 2));
      body = [
        `QRCODE ${qrX},${qrY},M,${cellSize},A,0,"${qr || s1}"`,
        `TEXT ${labelX},222,"2",0,1,1,"${label}"`,
      ];
      break;
    }

    default:
      body = [`TEXT 10,100,"3",0,2,2,"NO TEMPLATE"`];
  }

  const commands = [...header, ...body, `PRINT ${copies},1`];
  return commands.join('\n') + '\n';
}

/**
 * Sinh lệnh TSPL dạng BITMAP cho toàn bộ tem nhãn 40×30mm.
 * Dữ liệu là bitmap đen trắng 1-bit: 320 pixels rộng × 240 pixels cao.
 * Mỗi dòng 40 bytes (320/8), tổng 9600 bytes.
 *
 * Ưu điểm so với TEXT command:
 * - Hỗ trợ tiếng Việt đầy đủ dấu (render trên client canvas)
 * - Preview = bản in (pixel-perfect)
 *
 * @param bitmapData - Buffer 9600 bytes, 1-bit per pixel, MSB first
 * @param copies - Số bản in (1-20)
 * @returns Buffer chứa lệnh TSPL hoàn chỉnh (ASCII header + binary bitmap + ASCII footer)
 */
export function buildBitmapTSPLCommand(bitmapData: Buffer, copies: number = 1): Buffer {
  const WIDTH_BYTES = 40;   // 320 pixels / 8
  const HEIGHT = 240;
  const validCopies = Math.max(1, Math.min(copies, 20));

  // Header ASCII — BITMAP command kết thúc bằng dấu phẩy, data binary theo ngay sau
  const headerStr = [
    'SIZE 40 mm, 30 mm',
    'GAP 2 mm, 0 mm',
    'DIRECTION 1',
    'REFERENCE 0,0',
    'OFFSET 0 mm',
    'CLS',
    `BITMAP 0,0,${WIDTH_BYTES},${HEIGHT},0,`,
  ].join('\n');

  // Footer ASCII — sau bitmap data, xuống dòng rồi lệnh PRINT
  const footerStr = `\nPRINT ${validCopies},1\n`;

  return Buffer.concat([
    Buffer.from(headerStr, 'ascii'),
    bitmapData,
    Buffer.from(footerStr, 'ascii'),
  ]);
}

/**
 * Gửi lệnh in dạng binary (Buffer) tới máy in USB.
 * Khác sendToPrinter() ở chỗ không encode UTF-8 — giữ nguyên raw bytes.
 */
export async function sendToPrinterBinary(data: Buffer, devicePath: string = PRINTER_DEVICE_PATH): Promise<void> {
  await fs.promises.writeFile(devicePath, data);
}
