/**
 * Ảnh và file in của hàng hóa cửa hàng đều lưu cùng một hình dạng: metadata + `duLieu` base64.
 *
 * Mỗi cột base64 (`anh`, `tepIn`) đi kèm một cột metadata rút gọn (`anhMeta`, `tepInMeta`) để GET
 * danh sách đọc được tên/dung lượng/số lượng tệp mà không phải chạm vào base64 — tổng 2 cột nặng
 * này có thể vài trăm MB, đọc hết rồi vứt đi làm request mất ~7s.
 */

export type TepLuu = { id: string; ten: string; duLieu: string; loai: string; dungLuong: number };
/** Bản rút gọn lưu ở cột meta: y hệt nhưng không có `duLieu`. */
export type TepMeta = Omit<TepLuu, 'duLieu'>;

/**
 * Rút gọn để ghi vào cột meta. Liệt kê tường minh 4 trường thay vì "bỏ duLieu" — cột này phải luôn
 * nhẹ, nên trường nặng nào client thêm về sau cũng không lọt vào được.
 */
export function rutGonMeta(danhSach: TepLuu[]): TepMeta[] {
  return danhSach.map((item) => ({ id: item.id, ten: item.ten, loai: item.loai, dungLuong: item.dungLuong }));
}

/** Dựng lại đúng shape client mong đợi (`duLieu` rỗng) từ cột meta. */
export function khoiPhucTuMeta(meta: unknown): TepLuu[] {
  if (!Array.isArray(meta)) return [];
  return (meta as TepMeta[]).map((item) => ({ ...item, duLieu: '' }));
}

/** Body của PUT .../anh và .../tep-in phải là mảng tệp hợp lệ — chặn sớm để không ghi rác vào DB. */
export function laDanhSachTepHopLe(giaTri: unknown): giaTri is TepLuu[] {
  return (
    Array.isArray(giaTri) &&
    giaTri.every(
      (item) =>
        !!item &&
        typeof item === 'object' &&
        typeof (item as TepLuu).id === 'string' &&
        typeof (item as TepLuu).ten === 'string' &&
        typeof (item as TepLuu).duLieu === 'string',
    )
  );
}
