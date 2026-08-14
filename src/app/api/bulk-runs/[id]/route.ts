import prisma from '@/utils/db';
import { ok, fail } from '@/utils/api-response';
import { trangThaiDon } from '@/utils/bulk-production';

/**
 * Sửa tay 1 lượt in — dùng khi quẹt nhầm hoặc đổi máy giữa chừng.
 * `status: 'pending'` sẽ xóa luôn mốc bắt đầu/kết thúc để quẹt lại từ đầu.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { status, printerId, quantity, startedAt, finishedAt } = await req.json();

    const hienTai = await prisma.bulkRun.findUnique({ where: { id } });
    if (!hienTai) return fail('Không tìm thấy lượt in', 404);

    let printerName: string | undefined;
    if (printerId !== undefined && printerId) {
      const may = await prisma.printer.findUnique({ where: { id: printerId } });
      if (!may) return fail('Không tìm thấy máy in', 400);
      printerName = may.name;
    }

    const xoaMocThoiGian = status === 'pending';

    const run = await prisma.bulkRun.update({
      where: { id },
      data: {
        ...(status !== undefined && { status }),
        ...(printerId !== undefined && { printerId: printerId || null }),
        ...(printerName !== undefined && { printerName }),
        ...(quantity !== undefined && { quantity: Math.max(0, Math.floor(Number(quantity))) }),
        ...(xoaMocThoiGian
          ? { startedAt: null, finishedAt: null }
          : {
              ...(startedAt !== undefined && { startedAt: startedAt ? new Date(startedAt) : null }),
              ...(finishedAt !== undefined && { finishedAt: finishedAt ? new Date(finishedAt) : null }),
            }),
      },
      include: { printer: true },
    });

    const cacLuot = await prisma.bulkRun.findMany({
      where: { orderId: run.orderId },
      select: { status: true },
    });
    await prisma.bulkOrder.update({
      where: { id: run.orderId },
      data: { status: trangThaiDon(cacLuot.map((r) => r.status)) },
    });

    return ok(run);
  } catch (error: unknown) {
    return fail(error instanceof Error ? error.message : 'Lỗi máy chủ');
  }
}
