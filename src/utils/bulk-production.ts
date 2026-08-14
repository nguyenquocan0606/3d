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
 * Chia đơn thành danh sách lượt in, mỗi máy có sức chứa mâm riêng.
 *
 * `sucChuaMoiMay[i]` = số con xếp vừa 1 mâm PEI **của máy thứ i**. Máy khổ bàn khác
 * nhau thì xếp được số con khác nhau, nên không ép chung một con số; máy nào không
 * khai riêng thì phía gọi truyền sẵn số chung vào đây.
 *
 * Vẫn chia vòng tròn: máy 1 → máy 2 → ... → quay lại máy 1, cho tới khi đủ tổng.
 * Lượt cuối nhận phần dư (VD tổng 250, mâm 60 → 4 mâm đầy + 1 mâm 10 con).
 */
export function chiaLuotInTheoMay(tongSoCon: number, sucChuaMoiMay: number[]): LuotInDuKien[] {
  if (!Number.isFinite(tongSoCon) || tongSoCon <= 0) return [];
  if (sucChuaMoiMay.length === 0) return [];

  const tong = Math.floor(tongSoCon);
  const sucChua = sucChuaMoiMay.map((n) => Math.floor(Number(n)));
  // Máy khai sức chứa <= 0 sẽ làm vòng lặp chạy mãi mà không xếp được con nào.
  if (sucChua.some((n) => !Number.isFinite(n) || n <= 0)) return [];

  const luots: LuotInDuKien[] = [];
  const soMamDaXep = new Array(sucChua.length).fill(0);
  let daXep = 0;
  let luotThu = 0;

  while (daXep < tong) {
    const may = luotThu % sucChua.length;
    const quantity = Math.min(sucChua[may], tong - daXep);
    soMamDaXep[may] += 1;
    luots.push({
      seq: luots.length + 1,
      printerIndex: may,
      peiIndex: soMamDaXep[may],
      quantity,
    });
    daXep += quantity;
    luotThu += 1;
  }

  return luots;
}

/**
 * Chia đơn khi mọi máy dùng chung một số con/mâm.
 *
 * Lượt cuối cùng nhận phần dư (VD tổng 250, mỗi mâm 60 → 4 mâm đầy 60 + 1 mâm 10 con).
 * Round-robin nên máy thứ k nhận các lượt k, k+soMay, k+2*soMay...
 */
export function chiaLuotIn(
  tongSoCon: number,
  soConMoiMam: number,
  soMay: number
): LuotInDuKien[] {
  if (!Number.isFinite(soMay) || soMay <= 0) return [];
  if (!Number.isFinite(soConMoiMam) || soConMoiMam <= 0) return [];
  return chiaLuotInTheoMay(tongSoCon, new Array(Math.floor(soMay)).fill(soConMoiMam));
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

/** Phần chung của 1 lượt in mà các hàm tổng hợp dưới đây cần. */
export interface LuotDeTongHop {
  printerId: string | null;
  quantity: number;
  defectQuantity: number;
  isRework: boolean;
  status: string;
  peiIndex: number;
}

/** Tổng số con lỗi đã ghi trong đơn. */
export const tongSoLoi = (runs: LuotDeTongHop[]) =>
  runs.reduce((s, r) => s + (r.defectQuantity || 0), 0);

/**
 * Còn bao nhiêu miếng lỗi chưa được in bù.
 *
 * Lượt bù đã tạo (kể cả chưa in xong) coi như đã nhận phần lỗi đó, nếu không mỗi
 * lần bấm "In miếng lỗi" lại đẻ thêm một loạt lượt cho cùng số lỗi cũ.
 */
export const canBuBaoNhieu = (runs: LuotDeTongHop[]) => {
  const daBu = runs.filter((r) => r.isRework).reduce((s, r) => s + r.quantity, 0);
  return Math.max(0, tongSoLoi(runs) - daBu);
};

/** Hàng tốt đã ra: chỉ lượt in xong, trừ đi số lỗi của chính lượt đó. */
export const soHangTot = (runs: LuotDeTongHop[]) =>
  runs
    .filter((r) => r.status === 'completed')
    .reduce((s, r) => s + Math.max(0, r.quantity - (r.defectQuantity || 0)), 0);

/**
 * Suy lại danh sách máy và sức chứa mâm của từng máy từ chính các lượt đã chia.
 *
 * DB không lưu riêng hai thứ này: thứ tự máy lấy theo máy xuất hiện lần đầu, còn
 * sức chứa lấy lượt **đầy nhất** của máy (lượt cuối có thể lẻ nên không lấy bừa).
 */
export function sucChuaTheoMayTuLuot(runs: LuotDeTongHop[]): {
  printerIds: string[];
  sucChua: Record<string, number>;
} {
  const printerIds: string[] = [];
  const sucChua: Record<string, number> = {};
  for (const run of runs) {
    if (!run.printerId) continue;
    if (!printerIds.includes(run.printerId)) printerIds.push(run.printerId);
    sucChua[run.printerId] = Math.max(sucChua[run.printerId] ?? 0, run.quantity);
  }
  return { printerIds, sucChua };
}
