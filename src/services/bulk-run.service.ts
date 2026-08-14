import prisma from '@/utils/db';
import { generateUniqueBarcode } from '@/utils/barcode';
import { chiaLuotInTheoMay } from '@/utils/bulk-production';

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

/**
 * Chia đơn thành các lượt in kèm mã vạch, dùng chung cho lúc tạo đơn và lúc chia lại.
 *
 * Mã vạch được sinh **trước** transaction để không giữ transaction mở trong lúc
 * query kiểm tra trùng mã.
 */
export async function chuanBiLuotIn(dauVao: DauVaoChiaLuot): Promise<LuotInMoi[]> {
  const tong = Math.floor(Number(dauVao.totalQuantity));
  const moiMam = Math.floor(Number(dauVao.perSheetQty));

  if (!Number.isFinite(tong) || tong <= 0) throw new LoiChiaLuot('Tổng số con phải lớn hơn 0');
  if (!Number.isFinite(moiMam) || moiMam <= 0)
    throw new LoiChiaLuot('Số con mỗi mâm PEI phải lớn hơn 0');
  if (!Array.isArray(dauVao.printerIds) || dauVao.printerIds.length === 0)
    throw new LoiChiaLuot('Vui lòng chọn ít nhất 1 máy in');

  // Giữ đúng thứ tự người dùng chọn máy để lượt PEI 1 rơi vào máy đầu danh sách
  const printers = await prisma.printer.findMany({ where: { id: { in: dauVao.printerIds } } });
  const theoThuTu = dauVao.printerIds
    .map((id) => printers.find((p) => p.id === id))
    .filter((p): p is (typeof printers)[number] => Boolean(p));
  if (theoThuTu.length === 0) throw new LoiChiaLuot('Không tìm thấy máy in đã chọn');

  const sucChua = theoThuTu.map((may) => {
    const rieng = Math.floor(Number(dauVao.printerLimits?.[may.id]));
    return Number.isFinite(rieng) && rieng > 0 ? rieng : moiMam;
  });

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
