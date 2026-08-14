import sharp from 'sharp';

/** Cạnh vuông của thumbnail — chỉ đủ để hiển thị avatar nhỏ trong danh sách/chi tiết. */
const CANH_THUMBNAIL = 96;

/**
 * Nén ảnh đầu tiên của hàng hóa thành thumbnail nhỏ (vài KB) để nhúng vào danh sách
 * mà không phải tải cả mảng `anh` (có thể nặng hàng chục KB-MB mỗi ảnh gốc).
 * Trả về null nếu không có ảnh hoặc ảnh không giải mã được (định dạng lạ như HEIC).
 */
export async function taoAnhDaiDien(duLieuBase64: string | undefined | null): Promise<string | null> {
  if (!duLieuBase64) return null;

  const phanCach = duLieuBase64.indexOf(',');
  if (phanCach === -1) return null;

  try {
    const buffer = Buffer.from(duLieuBase64.slice(phanCach + 1), 'base64');
    const thumbnail = await sharp(buffer)
      .resize(CANH_THUMBNAIL, CANH_THUMBNAIL, { fit: 'cover' })
      .jpeg({ quality: 55 })
      .toBuffer();
    return `data:image/jpeg;base64,${thumbnail.toString('base64')}`;
  } catch {
    return null;
  }
}
