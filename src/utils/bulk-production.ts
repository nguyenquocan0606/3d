/**
 * Logic chia lượt in cho chế độ sản xuất số lượng lớn.
 *
 * Đơn vị sản xuất ở đây là 1 LƯỢT = 1 mâm PEI đầy hàng. Biết tổng số con và số con xếp vừa 1 mâm
 * là ra số lượt; chia cho các máy được chọn để không máy nào phải chờ máy khác xong mới có việc.
 *
 * Hai kiểu chia, xem [chiaLuotInTheoMay]: chưa khai thời gian in thì chia vòng tròn (round-robin),
 * khai đủ giờ/mâm cho mọi máy thì xếp theo mốc máy rảnh để cả xưởng xong gần như cùng lúc.
 */

export interface LuotInDuKien {
  seq: number; // thứ tự lượt trong cả đơn, 1..N
  printerIndex: number; // vị trí máy trong danh sách máy được chọn
  peiIndex: number; // lượt PEI thứ mấy trên chính máy đó (1, 2, 3...)
  quantity: number; // số con của lượt này
}

/**
 * Thời gian in 1 mâm ĐẦY của từng máy, tính bằng phút — chỉ hợp lệ khi mọi máy đều khai một số
 * dương. Thiếu dù một máy thì trả `null`: đoán bừa giờ của máy chưa khai sẽ chia lệch mà người
 * dùng không hề biết, thà quay về chia vòng tròn như cũ.
 */
export function phutHopLe(phutMoiMay: number[] | undefined | null, soMay: number): number[] | null {
  if (!Array.isArray(phutMoiMay) || phutMoiMay.length !== soMay) return null;
  const phut = phutMoiMay.map((n) => Number(n));
  return phut.every((n) => Number.isFinite(n) && n > 0) ? phut : null;
}

/**
 * Chia đơn thành danh sách lượt in, mỗi máy có sức chứa mâm riêng.
 *
 * `sucChuaMoiMay[i]` = số con xếp vừa 1 mâm PEI **của máy thứ i**. Máy khổ bàn khác
 * nhau thì xếp được số con khác nhau, nên không ép chung một con số; máy nào không
 * khai riêng thì phía gọi truyền sẵn số chung vào đây.
 *
 * Có hai kiểu chia, tùy vào việc có khai thời gian in hay không:
 *
 * - **Không khai giờ** → chia vòng tròn: máy 1 → máy 2 → ... → quay lại máy 1. Mọi máy nhận số
 *   mâm xấp xỉ bằng nhau.
 * - **Khai đủ giờ cho mọi máy** (`phutMoiMam[i]` = phút in 1 mâm đầy của máy đó) → mỗi mâm được
 *   giao cho **máy rảnh sớm nhất**. Mâm 61 con in lâu hơn hẳn mâm 35 con, chia đều số mâm thì máy
 *   nhanh ngồi chơi còn máy chậm chạy tiếp mấy tiếng; xếp theo mốc rảnh thì máy nhanh nhận nhiều
 *   mâm hơn và cả xưởng xong gần như cùng lúc.
 *
 * Lượt cuối nhận phần dư (VD tổng 250, mâm 60 → 4 mâm đầy + 1 mâm 10 con) và chỉ chiếm thời gian
 * theo tỉ lệ số con — mâm 10/60 con không giữ máy lâu bằng mâm đầy.
 */
export function chiaLuotInTheoMay(
  tongSoCon: number,
  sucChuaMoiMay: number[],
  phutMoiMam?: number[] | null
): LuotInDuKien[] {
  if (!Number.isFinite(tongSoCon) || tongSoCon <= 0) return [];
  if (sucChuaMoiMay.length === 0) return [];

  const tong = Math.floor(tongSoCon);
  const sucChua = sucChuaMoiMay.map((n) => Math.floor(Number(n)));
  // Máy khai sức chứa <= 0 sẽ làm vòng lặp chạy mãi mà không xếp được con nào.
  if (sucChua.some((n) => !Number.isFinite(n) || n <= 0)) return [];

  const phut = phutHopLe(phutMoiMam, sucChua.length);

  const luots: LuotInDuKien[] = [];
  const soMamDaXep = new Array(sucChua.length).fill(0);
  /** Mốc máy rảnh trở lại, tính bằng phút kể từ lúc bấm chạy. */
  const ranhLuc = new Array(sucChua.length).fill(0);
  let daXep = 0;
  let luotThu = 0;

  while (daXep < tong) {
    let may = luotThu % sucChua.length;
    if (phut) {
      // Máy nào rảnh sớm nhất thì nhận mâm tiếp theo. Hòa thì máy đứng trước trong danh sách được
      // ưu tiên, nên vòng đầu vẫn đi đúng thứ tự người dùng bấm chọn.
      may = ranhLuc.reduce((tot, moc, i) => (moc < ranhLuc[tot] ? i : tot), 0);
    }
    const quantity = Math.min(sucChua[may], tong - daXep);
    if (phut) ranhLuc[may] += (phut[may] * quantity) / sucChua[may];
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

/** Khối lượng việc rơi vào một máy sau khi chia. */
export interface TaiMay {
  printerIndex: number;
  soLuot: number;
  soCon: number;
  /** Tổng thời gian in dự kiến (phút), hoặc null khi chưa khai giờ. */
  phut: number | null;
}

/**
 * Tổng kết mỗi máy phải chạy bao nhiêu mâm / bao nhiêu con / mất bao lâu.
 *
 * Dùng cho phần xem trước: người dùng cần thấy ngay là bốn máy có xong cùng lúc thật không, chứ
 * nhìn "4 lượt × 35 con" thì không biết được.
 */
export function taiTheoMay(
  luots: LuotInDuKien[],
  sucChuaMoiMay: number[],
  phutMoiMam?: number[] | null
): TaiMay[] {
  const phut = phutHopLe(phutMoiMam, sucChuaMoiMay.length);
  return sucChuaMoiMay.map((sucChua, i) => {
    const cuaMay = luots.filter((l) => l.printerIndex === i);
    return {
      printerIndex: i,
      soLuot: cuaMay.length,
      soCon: cuaMay.reduce((s, l) => s + l.quantity, 0),
      phut: phut ? cuaMay.reduce((s, l) => s + (phut[i] * l.quantity) / sucChua, 0) : null,
    };
  });
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

/** Một lượt đang có trong DB, đủ trường để tính kế hoạch chia lại. */
export interface LuotDaCo {
  id: string;
  printerId: string | null;
  seq: number;
  peiIndex: number;
  quantity: number;
  status: string;
  isRework: boolean;
}

/** Kế hoạch chia lại đơn mà không đụng vào phần đã chạy. */
export interface KeHoachChiaLai {
  /** Lượt bị khóa (đã quẹt hoặc lượt bù) — giữ nguyên mã, mốc giờ, số lỗi. */
  giuNguyen: LuotDaCo[];
  /**
   * Lượt đã chạy được **sửa lại số con** vì sức chứa mâm cũ nhập nhầm.
   * Chỉ có khi bật `suaLuotDaChay`; mọi thứ khác của lượt vẫn giữ nguyên.
   */
  suaDaChay: { id: string; quantity: number; quantityCu: number }[];
  /** Lượt `pending` dùng lại: **giữ nguyên mã vạch**, chỉ ghi đè máy/số con/thứ tự. */
  capNhat: {
    id: string;
    printerIndex: number;
    seq: number;
    peiIndex: number;
    quantity: number;
  }[];
  /** Lượt còn thiếu — phía gọi cấp mã vạch mới cho chúng. */
  themMoi: { printerIndex: number; seq: number; peiIndex: number; quantity: number }[];
  /** Mã của các lượt `pending` thừa ra, xóa từ cuối danh sách. */
  xoa: string[];
  /** Số con đã nằm trong các lượt bị khóa (phần kế hoạch cũ không lấy lại được). */
  daKhoa: number;
}

/**
 * Chia lại đơn nhưng **giữ nguyên phần đã chạy**.
 *
 * Chia lại kiểu xóa sạch làm mất hết mốc check-in/check-out và biến tem đã dán trên
 * máy thành rác. Ở đây chỉ phần chưa ai đụng tới mới bị tính lại:
 *
 * - Lượt đã quẹt (`printing`/`completed`) và lượt in bù bị **khóa**: số con, máy,
 *   mốc giờ, số miếng lỗi giữ nguyên. Số con của chúng được trừ vào tổng mới.
 * - Phần còn lại chia lại từ đầu theo sức chứa mâm mới, rồi **ghép vào các mã vạch
 *   `pending` đang có theo thứ tự `seq`** — mã cũ vẫn dùng được, không phải in lại tem.
 * - Thừa mã thì xóa từ cuối, thiếu mã thì phía gọi cấp thêm mã mới.
 *
 * `peiIndex` của lượt mới đếm tiếp sau số PEI lớn nhất đang có trên chính máy đó, để
 * không trùng số với mâm đang dán trên máy.
 *
 * `suaLuotDaChay` (mặc định bật) xử lý trường hợp **nhập nhầm sức chứa mâm**: máy A khai
 * 34 nhưng thật ra mâm xếp được 35 con. Khi đó những mâm ĐẦY đã in trên máy A cũng phải
 * đổi 34 → 35, nếu không tổng số con của đơn đếm sai. Chỉ mâm đầy mới đổi — mâm lẻ cuối
 * và lượt in bù vốn không xếp đầy mâm nên giữ nguyên.
 */
export function chiaLaiGiuTienDo(
  runs: LuotDaCo[],
  tongMoi: number,
  printerIds: string[],
  sucChuaMoiMay: number[],
  suaLuotDaChay = true,
  /** Phút in 1 mâm đầy của từng máy — khai đủ thì phần còn lại được chia sao cho các máy xong cùng lúc. */
  phutMoiMam?: number[] | null
): KeHoachChiaLai {
  const khoa = runs.filter((r) => r.isRework || r.status !== 'pending');
  const thayDuoc = runs
    .filter((r) => !r.isRework && r.status === 'pending')
    .sort((a, b) => a.seq - b.seq);

  // Sức chứa mâm CŨ của từng máy = lượt đầy nhất của máy đó (lượt cuối có thể lẻ).
  const sucChuaCu = new Map<string, number>();
  for (const run of runs) {
    if (!run.printerId || run.isRework) continue;
    sucChuaCu.set(run.printerId, Math.max(sucChuaCu.get(run.printerId) ?? 0, run.quantity));
  }
  const sucChuaMoi = new Map<string, number>();
  printerIds.forEach((id, i) => sucChuaMoi.set(id, sucChuaMoiMay[i]));

  // Mâm lẻ cuối cùng của toàn bộ đơn (trước khi chia lại)
  const seqMaxToanDon = runs.reduce((max, r) => Math.max(max, r.seq), 0);

  /** Số con của lượt đã chạy sau khi sửa nhầm (không bật thì giữ nguyên). */
  const soConSauSua = (run: LuotDaCo): number => {
    if (!suaLuotDaChay || run.isRework || !run.printerId) return run.quantity;
    const cu = sucChuaCu.get(run.printerId);
    const moi = sucChuaMoi.get(run.printerId);
    if (!moi || !cu) return run.quantity;

    // Nhận diện "mâm đầy" (được phép sửa số con):
    // 1. Số con bằng đúng sức chứa max của đợt trước (cu) -> là mâm đầy chuẩn.
    // 2. HOẶC nó KHÔNG phải mâm cuối cùng của đơn (seq < seqMaxToanDon) -> mặc định các mâm ở giữa đều là mâm đầy.
    // Điều này giúp bắt được các mâm 34 con (trong khi max là 35) do bị pha trộn giữa các lần chia.
    const laMamDay = run.quantity === cu || run.seq < seqMaxToanDon;
    if (!laMamDay) return run.quantity;
    
    return moi;
  };

  const suaDaChay = khoa
    .map((r) => ({ id: r.id, quantity: soConSauSua(r), quantityCu: r.quantity }))
    .filter((s) => s.quantity !== s.quantityCu);

  // Lượt bù không nằm trong kế hoạch gốc nên không trừ vào tổng số con của đơn.
  const daKhoa = khoa.filter((r) => !r.isRework).reduce((s, r) => s + soConSauSua(r), 0);
  const conLai = Math.max(0, Math.floor(tongMoi) - daKhoa);

  const seqMax = khoa.reduce((max, r) => Math.max(max, r.seq), 0);
  const peiMax = new Map<string, number>();
  for (const run of khoa) {
    if (!run.printerId) continue;
    peiMax.set(run.printerId, Math.max(peiMax.get(run.printerId) ?? 0, run.peiIndex));
  }

  const luots = chiaLuotInTheoMay(conLai, sucChuaMoiMay, phutMoiMam);
  const canhLai = luots.map((luot) => ({
    printerIndex: luot.printerIndex,
    seq: seqMax + luot.seq,
    peiIndex: (peiMax.get(printerIds[luot.printerIndex]) ?? 0) + luot.peiIndex,
    quantity: luot.quantity,
  }));

  return {
    giuNguyen: khoa,
    suaDaChay,
    capNhat: canhLai
      .slice(0, thayDuoc.length)
      .map((l, i) => ({ ...l, id: thayDuoc[i].id })),
    themMoi: canhLai.slice(thayDuoc.length),
    xoa: thayDuoc.slice(canhLai.length).map((r) => r.id),
    daKhoa,
  };
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

/** Số phút ra chuỗi ngắn kiểu "2g 15p" / "45p". */
export function dinhDangPhut(soPhut: number): string {
  if (!Number.isFinite(soPhut) || soPhut < 0) return '—';
  const tongPhut = Math.round(soPhut);
  const gio = Math.floor(tongPhut / 60);
  const phut = tongPhut % 60;
  if (gio === 0) return `${phut}p`;
  return `${gio}g ${phut}p`;
}

/** Định dạng thời lượng in ra chuỗi ngắn kiểu "2g 15p" / "45p" để hiện trong bảng. */
export function dinhDangThoiLuong(startedAt?: Date | string | null, finishedAt?: Date | string | null): string {
  if (!startedAt || !finishedAt) return '—';
  const batDau = new Date(startedAt).getTime();
  const ketThuc = new Date(finishedAt).getTime();
  if (!Number.isFinite(batDau) || !Number.isFinite(ketThuc) || ketThuc < batDau) return '—';

  return dinhDangPhut((ketThuc - batDau) / 60000);
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
