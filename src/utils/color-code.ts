/**
 * Mã tem màu nhựa `CLR-<TÊN MÀU>`.
 *
 * Tem in ra có thể mang nhiều biến thể của cùng một màu, tùy nơi sinh mã và tùy
 * máy quét: `CLR-FOREST-GREEN`, `CLR-FOREST GREEN`, `CLRFORESTGREEN`... Riêng màu
 * nhiều chữ hay bị lệch nhau ở chỗ dấu cách/gạch nối nên so sánh nguyên văn là
 * không tìm thấy. Mọi chỗ đối chiếu tem màu phải so bằng `colorKey()`.
 */

/** Mã in lên tem cho một tên màu. Dấu cách thành gạch nối. */
export function colorCodeFor(colorName: string): string {
  return `CLR-${colorName.toUpperCase().replace(/\s+/g, '-')}`;
}

/** Có phải tem màu không (chấp nhận cả dạng thiếu gạch nối `CLRDO`). */
export function isColorCode(value: string): boolean {
  return /^CLR[-\s]?[A-Z0-9]/i.test(value.trim());
}

/** Bỏ dấu tiếng Việt — tem in bằng máy nhiệt không có dấu. */
function stripDiacritics(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/**
 * Khóa so sánh của một **tên màu**: bỏ dấu, viết hoa, bỏ hết dấu cách/gạch nối.
 * VD `Forest Green` → `FORESTGREEN`.
 */
export function colorKey(colorName: string): string {
  return stripDiacritics(colorName).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Khóa so sánh của một **mã tem quét được**: bỏ tiền tố `CLR` rồi lấy `colorKey`.
 * VD `CLR-FOREST GREEN`, `CLR-FOREST-GREEN`, `CLRFORESTGREEN` → `FORESTGREEN`.
 */
export function scannedColorKey(scanned: string): string {
  return colorKey(scanned.trim().replace(/^CLR[-\s]?/i, ''));
}

/** Tìm tên màu thật trong DB khớp với mã tem quét được. */
export function findColorByCode<T>(
  items: T[],
  scanned: string,
  getColorName: (item: T) => string,
): T | undefined {
  const key = scannedColorKey(scanned);
  if (!key) return undefined;
  return items.find((item) => colorKey(getColorName(item)) === key);
}
