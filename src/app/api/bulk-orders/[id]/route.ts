import prisma from '@/utils/db';
import { ok, fail } from '@/utils/api-response';

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

/** Sửa thông tin đơn (không đụng tới danh sách lượt đã chia — muốn chia lại thì xóa và tạo đơn mới). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { customerName, productName, note, status, orderCode } = await req.json();

    if (orderCode !== undefined && orderCode) {
      const trung = await prisma.bulkOrder.findUnique({ where: { orderCode } });
      if (trung && trung.id !== id) return fail('Mã đơn đã tồn tại. Vui lòng chọn mã khác.', 400);
    }

    const order = await prisma.bulkOrder.update({
      where: { id },
      data: {
        ...(orderCode !== undefined && { orderCode: orderCode || null }),
        ...(customerName !== undefined && { customerName }),
        ...(productName !== undefined && { productName }),
        ...(note !== undefined && { note }),
        ...(status !== undefined && { status }),
      },
      include: { runs: { include: { printer: true }, orderBy: { seq: 'asc' } } },
    });

    return ok(order);
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
