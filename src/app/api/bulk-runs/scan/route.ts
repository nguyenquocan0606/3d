import prisma from '@/utils/db';
import { ok, fail } from '@/utils/api-response';
import { dinhDangThoiLuong, trangThaiDon } from '@/utils/bulk-production';

/**
 * Quẹt mã 1 lượt in: lần quẹt đầu = check-in (bắt đầu in), lần quẹt sau = check-out (in xong).
 * Mốc thời gian lấy theo lúc quẹt, không nhập tay.
 */
export async function POST(req: Request) {
  try {
    const { code } = await req.json();
    const ma = String(code || '').trim();
    if (!ma) return fail('Thiếu mã lượt in', 400);

    const run = await prisma.bulkRun.findUnique({
      where: { id: ma },
      include: { order: true, printer: true },
    });
    if (!run) return fail(`Không tìm thấy lượt in mã: ${ma}`, 404);

    if (run.status === 'completed') {
      return fail(
        `Lượt ${run.printerName} · PEI ${run.peiIndex} đã in xong lúc ${new Date(run.finishedAt!).toLocaleString('vi-VN')}`,
        400
      );
    }

    const bayGio = new Date();
    const laCheckIn = run.status === 'pending';

    const runMoi = await prisma.bulkRun.update({
      where: { id: ma },
      data: laCheckIn
        ? { status: 'printing', startedAt: bayGio, finishedAt: null }
        : { status: 'completed', finishedAt: bayGio },
      include: { order: true, printer: true },
    });

    // Đồng bộ lại trạng thái đơn theo toàn bộ lượt
    const cacLuot = await prisma.bulkRun.findMany({
      where: { orderId: run.orderId },
      select: { status: true },
    });
    const statusDon = trangThaiDon(cacLuot.map((r) => r.status));
    if (statusDon !== run.order.status) {
      await prisma.bulkOrder.update({ where: { id: run.orderId }, data: { status: statusDon } });
    }

    const message = laCheckIn
      ? `Bắt đầu in: ${runMoi.printerName} · PEI ${runMoi.peiIndex} (${runMoi.quantity} con)`
      : `In xong: ${runMoi.printerName} · PEI ${runMoi.peiIndex} — hết ${dinhDangThoiLuong(runMoi.startedAt, runMoi.finishedAt)}`;

    return ok({ run: runMoi, action: laCheckIn ? 'check-in' : 'check-out', orderStatus: statusDon }, message);
  } catch (error: unknown) {
    return fail(error instanceof Error ? error.message : 'Lỗi máy chủ');
  }
}
