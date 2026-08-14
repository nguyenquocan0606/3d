import prisma from '@/utils/db';
import { ok, fail } from '@/utils/api-response';
import { chuanBiLuotIn, LoiChiaLuot } from '@/services/bulk-run.service';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const order = await prisma.bulkOrder.findUnique({
      where: { id },
      include: { runs: { include: { printer: true }, orderBy: { seq: 'asc' } } },
    });
    if (!order) return fail('Không tìm thấy đơn', 404);
    return ok(order);
  } catch (error: unknown) {
    return fail(error instanceof Error ? error.message : 'Lỗi máy chủ');
  }
}

/**
 * Sửa đơn.
 *
 * Mặc định chỉ đổi phần mô tả. Gửi kèm `printerIds` thì đơn được **chia lại lượt từ
 * đầu**: toàn bộ lượt cũ bị xóa, mã vạch mới được cấp — nghĩa là tem đã in ra thành
 * rác và mọi mốc check-in/check-out đã ghi đều mất. Phía gọi phải hỏi lại người dùng
 * trước khi gửi.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const {
      customerName,
      productName,
      note,
      status,
      orderCode,
      totalQuantity,
      perSheetQty,
      printerIds,
      printerLimits,
    } = await req.json();

    if (orderCode !== undefined && orderCode) {
      const trung = await prisma.bulkOrder.findUnique({ where: { orderCode } });
      if (trung && trung.id !== id) return fail('Mã đơn đã tồn tại. Vui lòng chọn mã khác.', 400);
    }

    const chiaLai = Array.isArray(printerIds) && printerIds.length > 0;
    const hienTai = await prisma.bulkOrder.findUnique({ where: { id } });
    if (!hienTai) return fail('Không tìm thấy đơn', 404);

    const tongMoi = chiaLai
      ? Math.floor(Number(totalQuantity ?? hienTai.totalQuantity))
      : hienTai.totalQuantity;
    const mamMoi = chiaLai
      ? Math.floor(Number(perSheetQty ?? hienTai.perSheetQty))
      : hienTai.perSheetQty;

    let runsMoi = null;
    if (chiaLai) {
      try {
        runsMoi = await chuanBiLuotIn({
          totalQuantity: tongMoi,
          perSheetQty: mamMoi,
          printerIds,
          printerLimits,
        });
      } catch (error) {
        if (error instanceof LoiChiaLuot) return fail(error.message, 400);
        throw error;
      }
    }

    const order = await prisma.$transaction(async (tx) => {
      await tx.bulkOrder.update({
        where: { id },
        data: {
          ...(orderCode !== undefined && { orderCode: orderCode || null }),
          ...(customerName !== undefined && { customerName }),
          ...(productName !== undefined && { productName }),
          ...(note !== undefined && { note }),
          ...(status !== undefined && { status }),
          ...(runsMoi && {
            totalQuantity: tongMoi,
            perSheetQty: mamMoi,
            // Lượt cũ mất hết nên đơn quay về vạch xuất phát, dù trước đó đang chạy.
            status: 'pending',
          }),
        },
      });

      if (runsMoi) {
        await tx.bulkRun.deleteMany({ where: { orderId: id } });
        await tx.bulkRun.createMany({
          data: runsMoi.map((r) => ({ ...r, orderId: id })),
        });
      }

      return tx.bulkOrder.findUnique({
        where: { id },
        include: { runs: { include: { printer: true }, orderBy: { seq: 'asc' } } },
      });
    });

    return ok(
      order,
      runsMoi ? `Đã chia lại thành ${runsMoi.length} lượt in — nhớ in lại tem` : undefined
    );
  } catch (error: unknown) {
    return fail(error instanceof Error ? error.message : 'Lỗi máy chủ');
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.bulkOrder.delete({ where: { id } }); // runs xóa theo Cascade
    return ok(null, 'Đã xóa đơn');
  } catch (error: unknown) {
    return fail(error instanceof Error ? error.message : 'Lỗi máy chủ');
  }
}
