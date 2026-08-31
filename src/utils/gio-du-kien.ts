/**
 * Giờ dự kiến in xong = giờ máy hiện tại + thời gian còn lại máy in báo về.
 *
 * Máy chỉ gửi `remainingTimeSeconds`, không gửi mốc kết thúc, nên mốc này luôn tính ở phía
 * hiển thị (trình duyệt / điện thoại) — giờ nào người dùng đang nhìn đồng hồ thì ra giờ đó.
 */

const HAI_SO = (n: number) => String(n).padStart(2, '0');

/**
 * Trả về "21:30" nếu xong trong hôm nay, "21:30 (mai)" nếu sang ngày mai,
 * còn xa hơn thì kèm ngày: "21:30 28/08". Không có số liệu thì trả `null`.
 */
export function gioDuKienXong(
  giayConLai: number | null | undefined,
  bayGio: Date = new Date(),
): string | null {
  if (!giayConLai || giayConLai <= 0 || !Number.isFinite(giayConLai)) return null;

  const xong = new Date(bayGio.getTime() + giayConLai * 1000);
  const gio = `${HAI_SO(xong.getHours())}:${HAI_SO(xong.getMinutes())}`;

  const nuaDem = new Date(bayGio.getFullYear(), bayGio.getMonth(), bayGio.getDate());
  const nuaDemXong = new Date(xong.getFullYear(), xong.getMonth(), xong.getDate());
  const soNgay = Math.round((nuaDemXong.getTime() - nuaDem.getTime()) / 86_400_000);

  if (soNgay <= 0) return gio;
  if (soNgay === 1) return `${gio} (mai)`;
  return `${gio} ${HAI_SO(xong.getDate())}/${HAI_SO(xong.getMonth() + 1)}`;
}
