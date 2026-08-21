/**
 * Cache TTL trong RAM — §7.4.
 *
 * Chỉ có một tiến trình Next nên Map là đủ, không cần Redis.
 * Xóa cache theo tiền tố khi `baoThayDoi()` chạy để thợ quẹt xong
 * thấy số mới ngay, không phải chờ hết TTL.
 */

interface MucDem {
  han: number;
  duLieu: unknown;
}

const kho = new Map<string, MucDem>();

/**
 * Lấy dữ liệu từ cache nếu còn hạn, ngược lại gọi `tinh()` rồi ghi lại.
 */
export async function boNhoDem<T>(
  khoa: string,
  ttlMs: number,
  tinh: () => Promise<T>,
): Promise<T> {
  const co = kho.get(khoa);
  if (co && co.han > Date.now()) return co.duLieu as T;
  const duLieu = await tinh();
  kho.set(khoa, { han: Date.now() + ttlMs, duLieu });
  return duLieu;
}

/**
 * Xóa tất cả khóa bắt đầu bằng `tienTo`.
 * Dùng sau khi ghi dữ liệu để UI thấy số mới ngay.
 *
 * Ví dụ: `xoaTheoTienTo('dashboard:')` xóa toàn bộ cache dashboard.
 */
export function xoaTheoTienTo(tienTo: string): void {
  for (const khoa of kho.keys()) {
    if (khoa.startsWith(tienTo)) {
      kho.delete(khoa);
    }
  }
}

/** Xóa đúng một khóa (dùng khi chỉ một endpoint bị ảnh hưởng). */
export function xoaKhoa(khoa: string): void {
  kho.delete(khoa);
}

/** Trả số mục đang cache (dùng khi debug). */
export function demMucDang(): number {
  return kho.size;
}
