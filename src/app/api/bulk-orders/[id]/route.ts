import prisma from '@/utils/db';
import { ghiBiaMo } from '@/services/sync.service';
import { baoThayDoi } from '@/services/sync-notify.service';
import { ok, fail } from '@/utils/api-response';
import { chuanBiChiaLai, LoiChiaLuot } from '@/services/bulk-run.service';
import { trangThaiDon } from '@/utils/bulk-production';

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
 * Mặc định chỉ đổi phần mô tả. Gửi kèm `printerIds` thì đơn được **chia lại lượt in**
 * theo kiểu giữ tiến độ: lượt đã quẹt và lượt in bù giữ nguyên, chỉ phần chưa ai đụng
 * tới mới bị tính lại — mã vạch cũ được dùng lại theo thứ tự, thừa thì xóa từ cuối,
 * thiếu thì cấp mã mới. Luật chia nằm ở `chiaLaiGiuTienDo`.
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
      suaLuotDaChay,
    } = await req.json();

    if (orderCode !== undefined && orderCode) {
      const trung = await prisma.bulkOrder.findUnique({ where: { orderCode } });
      if (trung && trung.id !== id) return fail('Mã đơn đã tồn tại. Vui lòng chọn mã khác.', 400);
    }

    const chiaLai = Array.isArray(printerIds) && printerIds.length > 0;
    const hienTai = await prisma.bulkOrder.findUnique({
      where: { id },
      include: { runs: { orderBy: { seq: 'asc' } } },
    });
    if (!hienTai) return fail('Không tìm thấy đơn', 404);

    const tongMoi = chiaLai
      ? Math.floor(Number(totalQuantity ?? hienTai.totalQuantity))
      : hienTai.totalQuantity;
    const mamMoi = chiaLai
      ? Math.floor(Number(perSheetQty ?? hienTai.perSheetQty))
      : hienTai.perSheetQty;

    let keHoach = null;
    if (chiaLai) {
      try {
        keHoach = await chuanBiChiaLai(
          hienTai.runs,
          { totalQuantity: tongMoi, perSheetQty: mamMoi, printerIds, printerLimits },
          // Mặc định bật: đổi sức chứa mâm phần lớn là do nhập nhầm, phải sửa cả mâm đã in.
          suaLuotDaChay !== false
        );
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
          ...(keHoach && { totalQuantity: tongMoi, perSheetQty: mamMoi }),
        },
      });

      if (keHoach) {
        if (keHoach.xoa.length > 0)
          await tx.bulkRun.deleteMany({ where: { orderId: id, id: { in: keHoach.xoa } } });
        for (const luot of keHoach.capNhat) {
          const { id: runId, ...duLieu } = luot;
          await tx.bulkRun.update({ where: { id: runId }, data: duLieu });
        }
        // Mâm đã in nhưng khai nhầm số con: chỉ sửa `quantity`, mốc giờ và số lỗi giữ nguyên.
        for (const luot of keHoach.suaDaChay)
          await tx.bulkRun.update({
            where: { id: luot.id },
            data: { quantity: luot.quantity },
          });
        if (keHoach.themMoi.length > 0)
          await tx.bulkRun.createMany({
            data: keHoach.themMoi.map((r) => ({ ...r, orderId: id })),
          });

        // Lượt đã chạy vẫn còn nguyên nên trạng thái đơn phải suy lại từ lượt, không
        // được ép về 'pending' như kiểu chia lại xóa sạch trước đây.
        const conLai = await tx.bulkRun.findMany({
          where: { orderId: id },
          select: { status: true },
        });
        await tx.bulkOrder.update({
          where: { id },
          data: { status: trangThaiDon(conLai.map((r) => r.status)) },
        });
      }

      return tx.bulkOrder.findUnique({
        where: { id },
        include: { runs: { include: { printer: true }, orderBy: { seq: 'asc' } } },
      });
    });

    if (keHoach) {
      for (const runId of keHoach.xoa) await ghiBiaMo('bulkRuns', runId);
      void baoThayDoi(['bulkOrders', 'bulkRuns']);
    }

    return ok(
      order,
      keHoach
        ? `Đã chia lại: giữ ${keHoach.soLuotKhoa} lượt đã chạy` +
            (keHoach.suaDaChay.length > 0
              ? ` (sửa số con ${keHoach.suaDaChay.length} mâm đã in)`
              : '') +
            `, tính lại ${keHoach.capNhat.length} lượt` +
            (keHoach.themMoi.length > 0 ? `, thêm ${keHoach.themMoi.length} lượt (in tem mới)` : '') +
            (keHoach.xoa.length > 0 ? `, xóa ${keHoach.xoa.length} lượt thừa` : '')
        : undefined
    );
  } catch (error: unknown) {
    return fail(error instanceof Error ? error.message : 'Lỗi máy chủ');
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.bulkOrder.delete({ where: { id } }); // runs xóa theo Cascade
    await ghiBiaMo('bulkOrders', id);
    void baoThayDoi(['bulkOrders', 'bulkRuns']);
    return ok(null, 'Đã xóa đơn');
  } catch (error: unknown) {
    return fail(error instanceof Error ? error.message : 'Lỗi máy chủ');
  }
}
