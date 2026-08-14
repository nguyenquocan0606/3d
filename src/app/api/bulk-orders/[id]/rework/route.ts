import prisma from '@/utils/db';
import { ok, fail } from '@/utils/api-response';
import { chuanBiLuotIn, LoiChiaLuot } from '@/services/bulk-run.service';
import { canBuBaoNhieu, sucChuaTheoMayTuLuot } from '@/utils/bulk-production';

/**
 * "In miếng lỗi": gom số con lỗi của cả đơn rồi sinh **lượt in bù**.
 *
 * Lượt bù được cấp mã vạch riêng và quẹt y hệt lượt thường (bắt đầu → quét máy →
 * in xong), nên hàng bù cũng được tính thời gian và ghi lỗi như mọi lượt khác.
 * Tổng số con của đơn giữ nguyên — đơn chỉ chạy tiếp cho tới khi đủ **hàng tốt**.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const order = await prisma.bulkOrder.findUnique({
      where: { id },
      include: { runs: { orderBy: { seq: 'asc' } } },
    });
    if (!order) return fail('Không tìm thấy đơn', 404);

    const canBu = canBuBaoNhieu(order.runs);
    if (canBu <= 0) return fail('Đơn này chưa có miếng lỗi nào cần in bù', 400);

    // Chạy bù trên đúng các máy đang chạy đơn, theo đúng sức chứa mâm của từng máy.
    const { printerIds, sucChua } = sucChuaTheoMayTuLuot(order.runs);
    if (printerIds.length === 0) return fail('Đơn chưa có lượt nào để biết chạy máy nào', 400);

    let runsBu;
    try {
      runsBu = await chuanBiLuotIn({
        totalQuantity: canBu,
        perSheetQty: order.perSheetQty,
        printerIds,
        printerLimits: sucChua,
      });
    } catch (error) {
      if (error instanceof LoiChiaLuot) return fail(error.message, 400);
      throw error;
    }

    // seq chạy tiếp sau lượt cuối; peiIndex tiếp tục đếm trên từng máy để tem không
    // bị trùng số với mâm cũ đang dán trên máy.
    const seqMax = order.runs.reduce((max, r) => Math.max(max, r.seq), 0);
    const peiMax = new Map<string, number>();
    for (const run of order.runs) {
      if (!run.printerId) continue;
      peiMax.set(run.printerId, Math.max(peiMax.get(run.printerId) ?? 0, run.peiIndex));
    }

    const data = runsBu.map((run) => ({
      ...run,
      orderId: id,
      isRework: true,
      seq: seqMax + run.seq,
      peiIndex: (peiMax.get(run.printerId) ?? 0) + run.peiIndex,
    }));

    await prisma.$transaction([
      prisma.bulkRun.createMany({ data }),
      // Đơn đang "completed" mà phát sinh bù thì phải mở lại, không thì bảng nói dối.
      prisma.bulkOrder.update({ where: { id }, data: { status: 'printing' } }),
    ]);

    const full = await prisma.bulkOrder.findUnique({
      where: { id },
      include: { runs: { include: { printer: true }, orderBy: { seq: 'asc' } } },
    });

    return ok(full, `Đã thêm ${data.length} lượt in bù cho ${canBu} miếng lỗi — nhớ in tem`);
  } catch (error: unknown) {
    return fail(error instanceof Error ? error.message : 'Lỗi máy chủ');
  }
}
