import prisma from '@/utils/db';
import { ok, fail } from '@/utils/api-response';
import { chuanBiLuotIn, LoiChiaLuot } from '@/services/bulk-run.service';

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
 *
 * `printerLimits` (tùy chọn) khai số con/mâm riêng cho từng máy — máy khổ bàn khác
 * nhau thì xếp được số con khác nhau; máy không khai thì dùng `perSheetQty` chung.
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
      printerLimits,
      note,
    } = body as {
      orderCode?: string;
      customerName?: string;
      productName?: string;
      totalQuantity?: number | string;
      perSheetQty?: number | string;
      printerIds?: string[];
      printerLimits?: Record<string, number>;
      note?: string;
    };

    if (!productName || !productName.trim()) return fail('Vui lòng nhập tên sản phẩm', 400);

    const maDon = orderCode?.trim() || null;
    if (maDon) {
      const trung = await prisma.bulkOrder.findUnique({ where: { orderCode: maDon } });
      if (trung) return fail('Mã đơn đã tồn tại. Vui lòng chọn mã khác.', 400);
    }

    let runsToCreate;
    try {
      runsToCreate = await chuanBiLuotIn({
        totalQuantity: Number(totalQuantity),
        perSheetQty: Number(perSheetQty),
        printerIds: printerIds ?? [],
        printerLimits,
      });
    } catch (error) {
      if (error instanceof LoiChiaLuot) return fail(error.message, 400);
      throw error;
    }

    const soMay = new Set(runsToCreate.map((r) => r.printerId)).size;

    const order = await prisma.$transaction(async (tx) => {
      const donMoi = await tx.bulkOrder.create({
        data: {
          orderCode: maDon,
          customerName: customerName?.trim() || 'Khách lẻ',
          productName: productName.trim(),
          totalQuantity: Math.floor(Number(totalQuantity)),
          perSheetQty: Math.floor(Number(perSheetQty)),
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

    return ok(full, `Đã tạo đơn với ${runsToCreate.length} lượt in trên ${soMay} máy`);
  } catch (error: unknown) {
    return fail(error instanceof Error ? error.message : 'Lỗi máy chủ');
  }
}
