import prisma from '@/utils/db';
import { ok, fail } from '@/utils/api-response';

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params;
    const body = await req.json();

    const { status, pickedItems } = body;

    const progress = await prisma.eshopPickProgress.upsert({
      where: { orderId: id },
      create: {
        orderId: id,
        status: status || 'picking',
        pickedItems: pickedItems || {},
      },
      update: {
        status: status || 'picking',
        pickedItems: pickedItems || {},
      },
    });

    return ok(progress);
  } catch (error: unknown) {
    return fail(error instanceof Error ? error.message : 'Lỗi cập nhật tiến độ nhặt hàng');
  }
}
