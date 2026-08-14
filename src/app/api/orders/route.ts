import { NextResponse } from 'next/server';
import prisma from '@/utils/db';
import { generateUniqueBarcode } from '@/utils/barcode';

export async function GET() {
  try {
    const orders = await prisma.order.findMany({
      include: {
        products: {
          include: {
            items: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({ status: 'success', data: orders });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Lỗi máy chủ';
    return NextResponse.json({ status: 'error', message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { customerName, products, orderCode } = body;

    if (orderCode) {
      const existing = await prisma.order.findFirst({ where: { orderCode } });
      if (existing) {
        return NextResponse.json({ status: 'error', message: 'Mã đơn hàng đã tồn tại. Vui lòng chọn mã khác.' }, { status: 400 });
      }
    }

    // products: array of { name: string, quantity: number, piecesPerProduct: { name: string, count: number }[] }
    // Example: { name: "Hộp 1", quantity: 5, piecesPerProduct: [{name: "Mặt A", count: 1}, {name: "Mặt B", count: 1}] }

    // Sinh toàn bộ barcode trước (ngoài transaction để không giữ transaction lâu),
    // dùng chung 1 Set để tránh trùng mã trong cùng batch
    const takenBarcodes = new Set<string>();
    interface IncomingProduct {
      name: string;
      quantity: number;
      price?: number | string;
      piecesPerProduct: Array<{ name: string; count: number }>;
    }
    const productsWithPieces: Array<{
      prod: IncomingProduct;
      piecesToCreate: Array<{ id: string; name: string; status: string }>;
    }> = [];
    for (const prod of products as IncomingProduct[]) {
      const piecesToCreate: Array<{ id: string; name: string; status: string }> = [];
      for (const pieceInfo of prod.piecesPerProduct) {
        const totalPieces = pieceInfo.count * prod.quantity;
        for (let i = 0; i < totalPieces; i++) {
          const barcode = await generateUniqueBarcode(takenBarcodes);
          piecesToCreate.push({
            id: barcode,
            name: pieceInfo.name,
            status: 'pending'
          });
        }
      }
      productsWithPieces.push({ prod, piecesToCreate });
    }

    // Dùng transaction để đảm bảo tạo đủ dữ liệu
    await prisma.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          orderCode: orderCode || null,
          customerName: customerName || 'Khách lẻ',
          status: 'pending',
        }
      });

      for (const { prod, piecesToCreate } of productsWithPieces) {
        const newProduct = await tx.orderProduct.create({
          data: {
            orderId: newOrder.id,
            name: prod.name,
            quantity: prod.quantity,
            price: Number(prod.price) || 0,
          }
        });

        // Bulk create items
        if (piecesToCreate.length > 0) {
          await tx.printItem.createMany({
            data: piecesToCreate.map((p) => ({ ...p, productId: newProduct.id }))
          });
        }
      }
    });

    return NextResponse.json({ status: 'success', message: 'Tạo đơn hàng thành công' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Lỗi máy chủ';
    return NextResponse.json({ status: 'error', message }, { status: 500 });
  }
}
