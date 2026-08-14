import prisma from '@/utils/db';
import { ok, fail } from '@/utils/api-response';
import { generateUniqueBarcode } from '@/utils/barcode';
import { chiaLuotIn } from '@/utils/bulk-production';

export async function GET() {
  try {
    const orders = await prisma.bulkOrder.findMany({
      include: {
        runs: {
          include: { printer: true },
          orderBy: { seq: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return ok(orders);
  } catch (error: unknown) {
    return fail(error instanceof Error ? error.message : 'Lỗi máy chủ');
  }
}

/**
 * Tạo đơn sản xuất số lượng lớn: nhập tổng số con + số con/mâm PEI + danh sách máy in,
 * hệ thống tự chia thành các lượt in và cấp mã vạch riêng cho từng lượt.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      orderCode,
      customerName,
      productName,
      totalQuantity,
      perSheetQty,
      printerIds,
      note,
    } = body as {
      orderCode?: string;
      customerName?: string;
      productName?: string;
      totalQuantity?: number | string;
      perSheetQty?: number | string;
      printerIds?: string[];
      note?: string;
    };

    const tong = Math.floor(Number(totalQuantity));
    const moiMam = Math.floor(Number(perSheetQty));

    if (!productName || !productName.trim()) return fail('Vui lòng nhập tên sản phẩm', 400);
    if (!Number.isFinite(tong) || tong <= 0) return fail('Tổng số con phải lớn hơn 0', 400);
    if (!Number.isFinite(moiMam) || moiMam <= 0) return fail('Số con mỗi mâm PEI phải lớn hơn 0', 400);
    if (!Array.isArray(printerIds) || printerIds.length === 0) return fail('Vui lòng chọn ít nhất 1 máy in', 400);

    const maDon = orderCode?.trim() || null;
    if (maDon) {
      const trung = await prisma.bulkOrder.findUnique({ where: { orderCode: maDon } });
      if (trung) return fail('Mã đơn đã tồn tại. Vui lòng chọn mã khác.', 400);
    }

    // Giữ đúng thứ tự người dùng chọn máy để lượt PEI 1 rơi vào máy đầu danh sách
    const printers = await prisma.printer.findMany({ where: { id: { in: printerIds } } });
    const printerTheoThuTu = printerIds
      .map((id) => printers.find((p) => p.id === id))
      .filter((p): p is (typeof printers)[number] => Boolean(p));
    if (printerTheoThuTu.length === 0) return fail('Không tìm thấy máy in đã chọn', 400);

    const luots = chiaLuotIn(tong, moiMam, printerTheoThuTu.length);

    // Sinh mã vạch trước, ngoài transaction, để không giữ transaction mở trong lúc query trùng mã
    const taken = new Set<string>();
    const runsToCreate: Array<{
      id: string;
      printerId: string;
      printerName: string;
      seq: number;
      peiIndex: number;
      quantity: number;
    }> = [];
    for (const luot of luots) {
      const may = printerTheoThuTu[luot.printerIndex];
      runsToCreate.push({
        id: await generateUniqueBarcode(taken),
        printerId: may.id,
        printerName: may.name,
        seq: luot.seq,
        peiIndex: luot.peiIndex,
        quantity: luot.quantity,
      });
    }

    const order = await prisma.$transaction(async (tx) => {
      const donMoi = await tx.bulkOrder.create({
        data: {
          orderCode: maDon,
          customerName: customerName?.trim() || 'Khách lẻ',
          productName: productName.trim(),
          totalQuantity: tong,
          perSheetQty: moiMam,
          note: note?.trim() || null,
          status: 'pending',
        },
      });

      await tx.bulkRun.createMany({
        data: runsToCreate.map((r) => ({ ...r, orderId: donMoi.id })),
      });

      return donMoi;
    });

    const full = await prisma.bulkOrder.findUnique({
      where: { id: order.id },
      include: { runs: { include: { printer: true }, orderBy: { seq: 'asc' } } },
    });

    return ok(full, `Đã tạo đơn với ${runsToCreate.length} lượt in trên ${printerTheoThuTu.length} máy`);
  } catch (error: unknown) {
    return fail(error instanceof Error ? error.message : 'Lỗi máy chủ');
  }
}
