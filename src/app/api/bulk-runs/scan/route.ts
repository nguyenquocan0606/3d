import prisma from '@/utils/db';
import { ok, fail } from '@/utils/api-response';
import { dinhDangThoiLuong, trangThaiDon } from '@/utils/bulk-production';

/**
 * Quẹt mã 1 lượt in: lần quẹt đầu = check-in (bắt đầu in), lần quẹt sau = check-out (in xong).
 *
 * `defectQuantity` (tùy chọn, chỉ dùng lúc check-out) là số con lỗi của mâm vừa in.
 * Hàng tốt = quantity - defectQuantity, và tổng lỗi cả đơn là căn cứ để bấm "In
 * miếng lỗi" sinh lượt in bù.
 * Mốc thời gian lấy theo lúc quẹt, không nhập tay.
 *
 * `printerId` (tùy chọn) là mã máy in quẹt kèm lúc check-in: máy chạy thật có thể
 * khác máy được chia lúc tạo đơn (máy kẹt nhựa, đổi mâm sang máy trống...), nên
 * quẹt tem máy nào thì lượt được gán về đúng máy đó.
 */
export async function POST(req: Request) {
  try {
    const { code, printerId, defectQuantity } = await req.json();
    const ma = String(code || '').trim();
    if (!ma) return fail('Thiếu mã lượt in', 400);

    const maMay = String(printerId || '').trim();
    // Số con lỗi chỉ ghi ở lần quẹt chốt "in xong"; không gửi thì coi như 0.
    const soLoi = Math.max(0, Math.floor(Number(defectQuantity) || 0));

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

    // Chỉ gán máy lúc check-in: check-out mà đổi máy thì mốc bắt đầu đã ghi cho
    // máy cũ sẽ vô nghĩa.
    let may = null;
    if (laCheckIn && maMay) {
      may = await prisma.printer.findUnique({ where: { id: maMay } });
      if (!may) return fail(`Không tìm thấy máy in mã: ${maMay}`, 404);
    }

    const runMoi = await prisma.bulkRun.update({
      where: { id: ma },
      data: laCheckIn
        ? {
            status: 'printing',
            startedAt: bayGio,
            finishedAt: null,
            ...(may && { printerId: may.id, printerName: may.name }),
          }
        : { status: 'completed', finishedAt: bayGio, defectQuantity: soLoi },
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
      : `In xong: ${runMoi.printerName} · PEI ${runMoi.peiIndex} — hết ${dinhDangThoiLuong(runMoi.startedAt, runMoi.finishedAt)}` +
        (soLoi > 0 ? ` · ${soLoi} con lỗi, được ${runMoi.quantity - soLoi} con tốt` : '');

    return ok({ run: runMoi, action: laCheckIn ? 'check-in' : 'check-out', orderStatus: statusDon }, message);
  } catch (error: unknown) {
    return fail(error instanceof Error ? error.message : 'Lỗi máy chủ');
  }
}
