/**
 * Chuyển canvas tem nhãn thành bitmap 1-bit để gửi cho máy in tem TSPL
 * (xem `/api/print-jobs/custom`). Tem 40mm×30mm = 320×240 dots @ 203 DPI.
 */

/** Chiều rộng tem tính bằng dot */
export const LABEL_W = 320;
/** Chiều cao tem tính bằng dot */
export const LABEL_H = 240;

/**
 * Canvas 320×240 → bitmap 1-bit, 40 byte/dòng, MSB trước.
 * Bit 0 = máy in đốt nhiệt (ra mực đen), bit 1 = để trắng.
 */
export function canvasToMonoBitmap(canvas: HTMLCanvasElement): Uint8Array {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Trình duyệt không tạo được canvas context');

  const pixels = ctx.getImageData(0, 0, LABEL_W, LABEL_H).data; // RGBA
  const bytesPerRow = LABEL_W / 8; // 40
  const bitmap = new Uint8Array(bytesPerRow * LABEL_H);
  bitmap.fill(0xff); // nền giấy trắng

  for (let y = 0; y < LABEL_H; y++) {
    for (let x = 0; x < LABEL_W; x++) {
      const idx = (y * LABEL_W + x) * 4;
      const a = pixels[idx + 3] / 255;
      // Xám hoá rồi trộn với nền trắng theo độ trong suốt
      const gray = (0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2]) * a + 255 * (1 - a);
      if (gray < 128) {
        bitmap[y * bytesPerRow + Math.floor(x / 8)] &= ~(1 << (7 - (x % 8)));
      }
    }
  }
  return bitmap;
}

/** Bitmap → base64 để gửi qua JSON */
export function uint8ToBase64(arr: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}

/** Vẽ chữ căn giữa, tự thu nhỏ cho vừa bề ngang tem */
export function drawFittedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  baselineY: number,
  maxWidth: number,
  fontPx: number,
  weight: 'bold' | 'normal' = 'bold',
) {
  let size = fontPx;
  ctx.font = `${weight} ${size}px "Arial", sans-serif`;
  while (size > 8 && ctx.measureText(text).width > maxWidth) {
    size -= 2;
    ctx.font = `${weight} ${size}px "Arial", sans-serif`;
  }
  ctx.textAlign = 'center';
  ctx.fillText(text, centerX, baselineY);
}
