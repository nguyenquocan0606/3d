import prisma from '@/utils/db';
import { generateUniqueBarcode } from '@/utils/barcode';
import { chiaLaiGiuTienDo, chiaLuotInTheoMay, type LuotDaCo } from '@/utils/bulk-production';

export interface DauVaoChiaLuot {
  totalQuantity: number;
  /** Số con mỗi mâm dùng chung cho máy không khai riêng. */
  perSheetQty: number;
  /** Thứ tự trong mảng = thứ tự nhận lượt (máy đầu danh sách nhận PEI 1). */
  printerIds: string[];
  /** printerId → số con mỗi mâm của riêng máy đó (tùy chọn). */
  printerLimits?: Record<string, number>;
}

export interface LuotInMoi {
  id: string;
  printerId: string;
  printerName: string;
  seq: number;
  peiIndex: number;
  quantity: number;
}

/** Lỗi nhập liệu — route bắt lại rồi trả 400 kèm đúng câu này. */
export class LoiChiaLuot extends Error {}

type MayIn = { id: string; name: string };

/**
 * Đọc danh sách máy theo đúng thứ tự người dùng chọn kèm sức chứa mâm của từng máy.
 *
 * Thứ tự quan trọng: máy đầu danh sách nhận lượt PEI 1. Máy không khai riêng trong
 * `printerLimits` thì dùng `perSheetQty` chung của đơn.
 */
async function layMayVaSucChua(
  dauVao: DauVaoChiaLuot
): Promise<{ theoThuTu: MayIn[]; sucChua: number[] }> {
  const moiMam = Math.floor(Number(dauVao.perSheetQty));
  if (!Number.isFinite(moiMam) || moiMam <= 0)
    throw new LoiChiaLuot('Số con mỗi mâm PEI phải lớn hơn 0');
  if (!Array.isArray(dauVao.printerIds) || dauVao.printerIds.length === 0)
    throw new LoiChiaLuot('Vui lòng chọn ít nhất 1 máy in');

  const printers = await prisma.printer.findMany({ where: { id: { in: dauVao.printerIds } } });
  const theoThuTu = dauVao.printerIds
    .map((id) => printers.find((p) => p.id === id))
    .filter((p): p is (typeof printers)[number] => Boolean(p));
  if (theoThuTu.length === 0) throw new LoiChiaLuot('Không tìm thấy máy in đã chọn');

  const sucChua = theoThuTu.map((may) => {
    const rieng = Math.floor(Number(dauVao.printerLimits?.[may.id]));
    return Number.isFinite(rieng) && rieng > 0 ? rieng : moiMam;
  });

  return { theoThuTu, sucChua };
}

/**
 * Chia đơn thành các lượt in kèm mã vạch, dùng chung cho lúc tạo đơn và lúc chia lại.
 *
 * Mã vạch được sinh **trước** transaction để không giữ transaction mở trong lúc
 * query kiểm tra trùng mã.
 */
export async function chuanBiLuotIn(dauVao: DauVaoChiaLuot): Promise<LuotInMoi[]> {
  const tong = Math.floor(Number(dauVao.totalQuantity));
  if (!Number.isFinite(tong) || tong <= 0) throw new LoiChiaLuot('Tổng số con phải lớn hơn 0');

  const { theoThuTu, sucChua } = await layMayVaSucChua(dauVao);
  const luots = chiaLuotInTheoMay(tong, sucChua);
  if (luots.length === 0) throw new LoiChiaLuot('Không chia được lượt in với số liệu đã nhập');

  const daDung = new Set<string>();
  const ketQua: LuotInMoi[] = [];
  for (const luot of luots) {
    const may = theoThuTu[luot.printerIndex];
    ketQua.push({
      id: await generateUniqueBarcode(daDung),
      printerId: may.id,
      printerName: may.name,
      seq: luot.seq,
      peiIndex: luot.peiIndex,
      quantity: luot.quantity,
    });
  }
  return ketQua;
}

/** Một lượt `pending` được dùng lại: mã vạch cũ, nội dung mới. */
export interface LuotSuaLai extends LuotInMoi {
  printerId: string;
}

export interface KetQuaChiaLai {
  /** Ghi đè lên lượt cũ theo `id` — mã vạch không đổi nên tem cũ vẫn quẹt được. */
  capNhat: LuotSuaLai[];
  /** Lượt đã chạy chỉ sửa lại số con vì sức chứa mâm cũ nhập nhầm. */
  suaDaChay: { id: string; quantity: number; quantityCu: number }[];
  /** Lượt mới hoàn toàn, đã có mã vạch — phải in tem. */
  themMoi: LuotInMoi[];
  /** Mã lượt `pending` thừa, xóa đi. */
  xoa: string[];
  /** Số lượt bị khóa vì đã chạy (hoặc là lượt bù). */
  soLuotKhoa: number;
  /** Số con đã nằm trong các lượt bị khóa. */
  daKhoa: number;
}

/**
 * Chuẩn bị chia lại đơn mà **không xóa phần đã chạy**.
 *
 * Xem [chiaLaiGiuTienDo] cho luật chia. Ở đây chỉ thêm phần tra máy in và cấp mã
 * vạch cho những lượt còn thiếu (cấp ngoài transaction như [chuanBiLuotIn]).
 */
export async function chuanBiChiaLai(
  runs: LuotDaCo[],
  dauVao: DauVaoChiaLuot,
  /** Sửa luôn số con của mâm ĐẦY đã in, dùng khi sức chứa mâm cũ nhập nhầm. */
  suaLuotDaChay = true
): Promise<KetQuaChiaLai> {
  const tong = Math.floor(Number(dauVao.totalQuantity));
  if (!Number.isFinite(tong) || tong <= 0) throw new LoiChiaLuot('Tổng số con phải lớn hơn 0');

  const { theoThuTu, sucChua } = await layMayVaSucChua(dauVao);
  const keHoach = chiaLaiGiuTienDo(
    runs,
    tong,
    theoThuTu.map((m) => m.id),
    sucChua,
    suaLuotDaChay
  );

  if (keHoach.capNhat.length === 0 && keHoach.themMoi.length === 0 && keHoach.daKhoa < tong)
    throw new LoiChiaLuot('Không chia được lượt in với số liệu đã nhập');

  const capNhat: LuotSuaLai[] = keHoach.capNhat.map((l) => {
    const may = theoThuTu[l.printerIndex];
    return {
      id: l.id,
      printerId: may.id,
      printerName: may.name,
      seq: l.seq,
      peiIndex: l.peiIndex,
      quantity: l.quantity,
    };
  });

  const daDung = new Set<string>(runs.map((r) => r.id));
  const themMoi: LuotInMoi[] = [];
  for (const l of keHoach.themMoi) {
    const may = theoThuTu[l.printerIndex];
    themMoi.push({
      id: await generateUniqueBarcode(daDung),
      printerId: may.id,
      printerName: may.name,
      seq: l.seq,
      peiIndex: l.peiIndex,
      quantity: l.quantity,
    });
  }

  return {
    capNhat,
    suaDaChay: keHoach.suaDaChay,
    themMoi,
    xoa: keHoach.xoa,
    soLuotKhoa: keHoach.giuNguyen.length,
    daKhoa: keHoach.daKhoa,
  };
}
