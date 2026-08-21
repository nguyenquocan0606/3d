import { NextResponse } from 'next/server';
import prisma from '@/utils/db';
import { ghiBiaMo } from '@/services/sync.service';
import { baoThayDoi } from '@/services/sync-notify.service';
import { generateUniqueBarcode } from '@/utils/barcode';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const order = await prisma.order.findFirst({
      where: {
        OR: [
          { id: id },
          { orderCode: id }
        ]
      },
      include: {
        products: {
          include: { items: true }
        }
      }
    });

    if (!order) return NextResponse.json({ status: 'error', message: 'Không tìm thấy đơn hàng' }, { status: 404 });
    return NextResponse.json({ status: 'success', data: order });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Lỗi máy chủ';
    return NextResponse.json({ status: 'error', message }, { status: 500 });
  }
}

interface PieceInfo {
  name: string;
  count: number;
}

interface IncomingProduct {
  id?: string;
  name: string;
  quantity: number;
  price?: number | string;
  piecesPerProduct: PieceInfo[];
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { customerName, products, orderCode } = body as {
      customerName?: string;
      products: IncomingProduct[];
      orderCode?: string;
    };

    // Kiểm tra orderCode trùng lặp
    if (orderCode) {
      const existing = await prisma.order.findFirst({ where: { orderCode } });
      if (existing && existing.id !== id) {
        return NextResponse.json({ status: 'error', message: 'Mã đơn hàng đã tồn tại. Vui lòng chọn mã khác.' }, { status: 400 });
      }
    }

    // Lấy order hiện tại kèm danh sách items
    const existingOrder = await prisma.order.findUnique({
      where: { id },
      include: {
        products: {
          include: { items: true }
        }
      }
    });

    if (!existingOrder) {
      return NextResponse.json({ status: 'error', message: 'Không tìm thấy đơn hàng' }, { status: 404 });
    }

    // ── BƯỚC 1: Kiểm tra điều kiện TRƯỚC khi ghi bất cứ thứ gì ──
    // Sản phẩm bị xóa khỏi danh sách gửi lên: chỉ cho phép xóa nếu KHÔNG có tem nào đã in
    const incomingProductIds = products.map((p) => p.id).filter(Boolean);
    const productsToDelete = existingOrder.products.filter(p => !incomingProductIds.includes(p.id));
    for (const p of productsToDelete) {
      const hasCompletedItems = p.items.some(i => i.status !== 'pending');
      if (hasCompletedItems) {
        return NextResponse.json(
          { status: 'error', message: `Sản phẩm "${p.name}" đã có tem đang in/in xong, không thể xóa bỏ hoàn toàn.` },
          { status: 400 }
        );
      }
    }

    // ── BƯỚC 2: Tính toán diff tem (sinh barcode NGOÀI transaction để không giữ transaction lâu) ──
    const takenBarcodes = new Set<string>();

    // Tem mới cần sinh cho sản phẩm đã tồn tại
    const newPiecesForExisting: Array<{ id: string; productId: string; name: string; status: string }> = [];
    // Tem pending cần xóa bớt
    const pieceIdsToDelete: string[] = [];
    // Sản phẩm mới tinh kèm tem đã sinh sẵn barcode
    const newProducts: Array<{ prod: IncomingProduct; pieces: Array<{ id: string; name: string; status: string }> }> = [];

    for (const prod of products) {
      if (prod.id) {
        const existingProd = existingOrder.products.find(p => p.id === prod.id);
        if (!existingProd) continue;

        // So sánh từng tên miếng (name): thiếu thì sinh thêm, thừa thì xóa tem pending
        for (const pieceInfo of prod.piecesPerProduct) {
          const targetCount = pieceInfo.count * prod.quantity;
          const existingPiecesOfThisName = existingProd.items.filter(i => i.name === pieceInfo.name);

          if (targetCount > existingPiecesOfThisName.length) {
            const diff = targetCount - existingPiecesOfThisName.length;
            for (let i = 0; i < diff; i++) {
              const barcode = await generateUniqueBarcode(takenBarcodes);
              newPiecesForExisting.push({
                id: barcode,
                productId: prod.id,
                name: pieceInfo.name,
                status: 'pending'
              });
            }
          } else if (targetCount < existingPiecesOfThisName.length) {
            // Giảm số lượng -> Xóa bớt tem pending của tên này (tối đa số pending hiện có)
            const diff = existingPiecesOfThisName.length - targetCount;
            const pendingItems = existingPiecesOfThisName.filter(i => i.status === 'pending');
            const deleteCount = Math.min(diff, pendingItems.length);
            pieceIdsToDelete.push(...pendingItems.slice(0, deleteCount).map(i => i.id));
          }
        }
      } else {
        // Sản phẩm mới tinh (thêm vào)
        const pieces: Array<{ id: string; name: string; status: string }> = [];
        for (const pieceInfo of prod.piecesPerProduct) {
          const totalPieces = pieceInfo.count * prod.quantity;
          for (let i = 0; i < totalPieces; i++) {
            const barcode = await generateUniqueBarcode(takenBarcodes);
            pieces.push({ id: barcode, name: pieceInfo.name, status: 'pending' });
          }
        }
        newProducts.push({ prod, pieces });
      }
    }

    // ── BƯỚC 3: Ghi tất cả trong 1 transaction (lỗi ở đâu rollback toàn bộ) ──
    await prisma.$transaction(async (tx) => {
      // Cập nhật tên khách hàng và mã
      await tx.order.update({
        where: { id },
        data: {
          orderCode: orderCode || null,
          customerName: customerName || 'Khách lẻ'
        }
      });

      // Cập nhật thông tin các sản phẩm đã tồn tại
      for (const prod of products) {
        if (!prod.id) continue;
        await tx.orderProduct.update({
          where: { id: prod.id },
          data: { name: prod.name, quantity: prod.quantity, price: Number(prod.price) || 0 }
        });
      }

      // Xóa tem pending thừa
      if (pieceIdsToDelete.length > 0) {
        await tx.printItem.deleteMany({
          where: { id: { in: pieceIdsToDelete } }
        });
      }

      // Xóa sản phẩm không còn trong danh sách (đã kiểm tra an toàn ở BƯỚC 1)
      for (const p of productsToDelete) {
        await tx.orderProduct.delete({ where: { id: p.id } });
      }

      // Tạo sản phẩm mới + tem của nó
      for (const { prod, pieces } of newProducts) {
        const newProduct = await tx.orderProduct.create({
          data: {
            orderId: id,
            name: prod.name,
            quantity: prod.quantity,
            price: Number(prod.price) || 0,
          }
        });
        if (pieces.length > 0) {
          await tx.printItem.createMany({
            data: pieces.map((p) => ({ ...p, productId: newProduct.id }))
          });
        }
      }

      // Tạo tem mới cho sản phẩm đã tồn tại
      if (newPiecesForExisting.length > 0) {
        await tx.printItem.createMany({
          data: newPiecesForExisting
        });
      }
    });

    return NextResponse.json({ status: 'success', message: 'Cập nhật đơn hàng thành công' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Lỗi máy chủ';
    return NextResponse.json({ status: 'error', message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        products: {
          include: { items: true }
        }
      }
    });

    if (!order) {
      return NextResponse.json({ status: 'error', message: 'Không tìm thấy đơn hàng' }, { status: 404 });
    }

    // Chỉ cho xóa khi chưa có tem nào đi vào sản xuất (giống rule ở PUT)
    const hasNonPendingItems = order.products.some(p => p.items.some(i => i.status !== 'pending'));
    if (hasNonPendingItems) {
      return NextResponse.json(
        { status: 'error', message: 'Đơn hàng đã có tem đang in/in xong, không thể xóa.' },
        { status: 400 }
      );
    }

    // Cascade: Order → OrderProduct → PrintItem (đã khai báo onDelete: Cascade trong schema)
    await prisma.order.delete({ where: { id } });
    await ghiBiaMo('orders', id);
    // Con (OrderProduct, PrintItem) bị Cascade xóa theo — không ghi bia mộ
    // riêng cho chúng, app tự dọn con khi thấy cha biến mất.
    void baoThayDoi(['orders', 'orderProducts', 'printItems']);

    return NextResponse.json({ status: 'success', message: 'Đã xóa đơn hàng' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Lỗi máy chủ';
    return NextResponse.json({ status: 'error', message }, { status: 500 });
  }
}
