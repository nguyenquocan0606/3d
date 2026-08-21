import { NextResponse } from 'next/server';
import prisma from '@/utils/db';
import { ok, fail } from '@/utils/api-response';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');

    if (!code) {
      return fail('Thiếu mã quét');
    }

    const order = await prisma.eshopOrder.findFirst({
      where: {
        OR: [
          { deliveryCode: code },
          { ecomOrderNo: code },
          { refNo: code },
          { id: code },
        ],
      },
      include: {
        items: true,
        pickProgress: true,
      },
    });

    if (!order) {
      return fail('Không tìm thấy đơn hàng Eshop');
    }

    // Cập nhật tên sản phẩm từ StoreProduct (nếu có) thay vì tên sàn
    const anyOrder = order as any;
    const skuCodes = anyOrder.items.map((i: any) => i.skuCode).filter(Boolean) as string[];
    if (skuCodes.length > 0) {
      const storeProducts = await prisma.storeProduct.findMany({
        where: { maQR: { in: skuCodes } },
        select: { maQR: true, ten: true },
      });
      
      const skuToNameMap = new Map<string, string>();
      for (const p of storeProducts) {
        skuToNameMap.set(p.maQR, p.ten);
      }

      anyOrder.items = anyOrder.items.map((item: any) => {
        if (item.skuCode && skuToNameMap.has(item.skuCode)) {
          return { ...item, itemName: skuToNameMap.get(item.skuCode)! };
        }
        return item;
      });
    }

    return ok(anyOrder);
  } catch (error: any) {
    return fail(error.message || 'Lỗi server');
  }
}
