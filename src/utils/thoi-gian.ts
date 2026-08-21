/**
 * Hằng số múi giờ xưởng và helper tính biên kỳ (today/7d/30d) theo UTC+8.
 *
 * Dùng một chuỗi '+08:00' duy nhất ở đây, tất cả module khác import lại —
 * tránh rải cứng nhiều nơi và nhầm lẫn giữa UTC+7 / UTC+8.
 */

/** Múi giờ xưởng. Postgres chạy UTC; mọi ranh giới ngày phải quy về chuỗi này. */
export const MUI_GIO_XUONG = '+08:00';

/** Nhãn hiển thị cho từng range */
const NHAN_KY: Record<string, string> = {
  today: 'Hôm nay',
  '7d': '7 ngày qua',
  '30d': '30 ngày qua',
};

export interface BieuKy {
  tu: Date;   // 00:00:00 UTC+8 của ngày đầu kỳ, tính theo UTC
  den: Date;  // thời điểm "ngay bây giờ"
  nhan: string;
}

/**
 * Tính biên kỳ (tu/den) theo múi giờ UTC+8.
 *
 * "00:00 hôm nay UTC+8" = "16:00 hôm qua UTC" (hay "17:00 hôm qua" nếu Việt Nam dùng UTC+7 — không
 * quan trọng vì mình chốt UTC+8 theo xưởng, không phải theo vị trí địa lý).
 */
export function tinhBienKy(range: 'today' | '7d' | '30d' = 'today'): BieuKy {
  const now = new Date();

  // Lấy ngày hôm nay theo UTC+8
  // Cách an toàn nhất: lấy timestamp UTC rồi dịch +8h để tính ngày/tháng/năm
  const offsetMs = 8 * 60 * 60 * 1000;
  const nowPlus8 = new Date(now.getTime() + offsetMs);

  // 00:00:00 hôm nay UTC+8, quy lại về UTC để truyền vào Prisma/SQL
  const startOfTodayUTC8 = new Date(
    Date.UTC(
      nowPlus8.getUTCFullYear(),
      nowPlus8.getUTCMonth(),
      nowPlus8.getUTCDate(),
    ) - offsetMs,
  );

  let tu: Date;
  switch (range) {
    case '7d':
      tu = new Date(startOfTodayUTC8.getTime() - 6 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      tu = new Date(startOfTodayUTC8.getTime() - 29 * 24 * 60 * 60 * 1000);
      break;
    default: // today
      tu = startOfTodayUTC8;
  }

  return { tu, den: now, nhan: NHAN_KY[range] ?? range };
}

/**
 * Trả ngày dạng "YYYY-MM-DD" theo múi giờ UTC+8.
 * Dùng để label trục X của chuỗi xu hướng.
 */
export function ngayUTC8(d: Date): string {
  const offsetMs = 8 * 60 * 60 * 1000;
  const shifted = new Date(d.getTime() + offsetMs);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/**
 * 00:00:00 UTC+8 của N ngày trước hôm nay (tính từ 00:00 hôm nay UTC+8).
 * Dùng cho generate_series.
 */
export function batDauChuoi(soNgay: number): Date {
  const { tu } = tinhBienKy('today');
  // tu = 00:00 hôm nay UTC+8; lui về `soNgay - 1` ngày nữa
  return new Date(tu.getTime() - (soNgay - 1) * 24 * 60 * 60 * 1000);
}
