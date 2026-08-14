/**
 * Logic chia lượt in cho chế độ sản xuất số lượng lớn.
 *
 * Đơn vị sản xuất ở đây là 1 LƯỢT = 1 mâm PEI đầy hàng. Biết tổng số con và số con xếp vừa 1 mâm
 * là ra số lượt; chia vòng tròn (round-robin) cho các máy được chọn để không máy nào phải chờ máy
 * khác xong mới có việc.
 */

export interface LuotInDuKien {
  seq: number; // thứ tự lượt trong cả đơn, 1..N
  printerIndex: number; // vị trí máy trong danh sách máy được chọn
  peiIndex: number; // lượt PEI thứ mấy trên chính máy đó (1, 2, 3...)
  quantity: number; // số con của lượt này
}

/**
 * Chia đơn thành danh sách lượt in.
 *
 * Lượt cuối cùng nhận phần dư (VD tổng 250, mỗi mâm 60 → 4 mâm đầy 60 + 1 mâm 10 con).
 * Round-robin nên máy thứ k nhận các lượt k, k+soMay, k+2*soMay...
 */
export function chiaLuotIn(
  tongSoCon: number,
  soConMoiMam: number,
  soMay: number
): LuotInDuKien[] {
  if (!Number.isFinite(tongSoCon) || tongSoCon <= 0) return [];
  if (!Number.isFinite(soConMoiMam) || soConMoiMam <= 0) return [];
  if (!Number.isFinite(soMay) || soMay <= 0) return [];

  const tong = Math.floor(tongSoCon);
  const moiMam = Math.floor(soConMoiMam);
  const may = Math.floor(soMay);

  const soLuot = Math.ceil(tong / moiMam);
  const luots: LuotInDuKien[] = [];

  for (let i = 0; i < soLuot; i++) {
    const daXep = i * moiMam;
    luots.push({
      seq: i + 1,
      printerIndex: i % may,
      peiIndex: Math.floor(i / may) + 1,
      quantity: Math.min(moiMam, tong - daXep),
    });
  }

  return luots;
}

/**
 * Suy trạng thái đơn từ trạng thái các lượt: xong hết là `completed`, còn lại chỉ cần 1 lượt đã
 * động vào (đang in / đã xong) là `printing`.
 */
export function trangThaiDon(runStatuses: string[]): 'pending' | 'printing' | 'completed' {
  if (runStatuses.length === 0) return 'pending';
  if (runStatuses.every((s) => s === 'completed')) return 'completed';
  if (runStatuses.some((s) => s === 'printing' || s === 'completed')) return 'printing';
  return 'pending';
}

/** Định dạng thời lượng in ra chuỗi ngắn kiểu "2g 15p" / "45p" để hiện trong bảng. */
export function dinhDangThoiLuong(startedAt?: Date | string | null, finishedAt?: Date | string | null): string {
  if (!startedAt || !finishedAt) return '—';
  const batDau = new Date(startedAt).getTime();
  const ketThuc = new Date(finishedAt).getTime();
  if (!Number.isFinite(batDau) || !Number.isFinite(ketThuc) || ketThuc < batDau) return '—';

  const tongPhut = Math.round((ketThuc - batDau) / 60000);
  const gio = Math.floor(tongPhut / 60);
  const phut = tongPhut % 60;
  if (gio === 0) return `${phut}p`;
  return `${gio}g ${phut}p`;
}
