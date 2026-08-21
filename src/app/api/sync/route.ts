import prisma from '@/utils/db';
import { ok, fail } from '@/utils/api-response';
import { giauAccessCode } from '@/services/printer.service';

/**
 * Kéo thay đổi về cho app di động — xem `KE-HOACH-DONG-BO-OFFLINE.md` §3.1.
 *
 *   GET /api/sync              → toàn bộ dữ liệu (lần đồng bộ đầu)
 *   GET /api/sync?since=<iso>  → chỉ thay đổi sau mốc đó
 *
 * Trả **bảng phẳng**, không lồng nhau, dù app hiển thị đơn hàng theo cây. Lý do:
 * lồng nhau thì đổi trạng thái một tem sẽ không làm `updatedAt` của đơn nhúc
 * nhích, và delta bỏ sót. App tự ghép lại từ CSDL cục bộ của nó.
 */

/** Bảng nào app cần, và cột nào được phép gửi. */
async function docThayDoi(since: Date | null) {
  const sau = since ? { updatedAt: { gt: since } } : {};

  const [
    locations,
    filaments,
    printers,
    spools,
    peiSheets,
    orders,
    orderProducts,
    printItems,
    bulkOrders,
    bulkRuns,
    storeProducts,
  ] = await Promise.all([
    prisma.location.findMany({ where: sau }),
    prisma.filament.findMany({ where: sau }),
    // `lanAccessCode` là mật khẩu vào máy in — tuyệt đối không đẩy xuống SQLite của điện thoại.
    // App chỉ cần biết "đã có mã chưa" để hiện đúng ô nhập, nên gửi cờ `coAccessCode` thay thế.
    prisma.printer.findMany({ where: sau }).then((ds) => ds.map(giauAccessCode)),
    prisma.spool.findMany({ where: sau }),
    prisma.peiSheet.findMany({ where: sau }),
    prisma.order.findMany({ where: sau }),
    prisma.orderProduct.findMany({ where: sau }),
    prisma.printItem.findMany({ where: sau }),
    prisma.bulkOrder.findMany({ where: sau }),
    prisma.bulkRun.findMany({ where: sau }),
    // `anh` / `tepIn` là base64, cả bảng có thể vài trăm MB — không bao giờ gửi
    // qua đồng bộ. App dùng `anhDaiDien` (thumbnail) và tải ảnh gốc theo yêu cầu.
    prisma.storeProduct.findMany({
      where: sau,
      select: {
        id: true, maQR: true, ten: true, danhMuc: true,
        giaVon: true, tyLeLoiNhuan: true, gia: true, giaBanLe: true, giaKhuyenMai: true,
        soLuong: true, donVi: true, nguongCanhBao: true, nhaCungCap: true, ghiChu: true,
        thongTinRieng: true, anhDaiDien: true, anhMeta: true, tepInMeta: true,
        lichSu: true, ngayTao: true, ngayCapNhat: true, updatedAt: true,
        parentId: true, soLuongCombo: true, heSoCombo: true,
      },
    }),
  ]);

  return {
    locations, filaments, printers, spools, peiSheets,
    orders, orderProducts, printItems, bulkOrders, bulkRuns, storeProducts,
  };
}

export async function GET(req: Request) {
  try {
    const thamSo = new URL(req.url).searchParams.get('since');
    let since: Date | null = null;
    if (thamSo) {
      const d = new Date(thamSo);
      if (Number.isNaN(d.getTime())) return fail('Tham số `since` không phải mốc thời gian hợp lệ.', 400);
      since = d;
    }

    // Lấy mốc **trước** khi đọc bảng, và lấy theo đồng hồ CSDL.
    //
    // Trước khi đọc: bản ghi được ghi trong lúc đang đọc sẽ nằm sau mốc này nên
    // lần sau vẫn kéo về. Lấy mốc sau khi đọc thì những bản ghi đó rơi vào khe hở
    // và mất vĩnh viễn.
    //
    // Theo đồng hồ CSDL: `updatedAt` do Postgres đặt, so với giờ của tiến trình
    // Node là so hai đồng hồ khác nhau. Máy PDA thì càng không tin được.
    const [{ now }] = await prisma.$queryRaw<{ now: Date }[]>`SELECT NOW() as now`;

    const changes = await docThayDoi(since);

    // Bia mộ: chỉ cần từ lần đồng bộ trước tới giờ. Lần đầu (chưa có `since`) thì
    // không cần — máy chưa có gì trong CSDL cục bộ để mà xóa.
    const bia = since
      ? await prisma.syncTombstone.findMany({
          where: { xoaLuc: { gt: since } },
          select: { bang: true, banGhiId: true },
        })
      : [];

    const deleted: Record<string, string[]> = {};
    for (const b of bia) (deleted[b.bang] ??= []).push(b.banGhiId);

    return ok({ serverTime: now.toISOString(), changes, deleted });
  } catch (error: unknown) {
    return fail(error instanceof Error ? error.message : 'Lỗi máy chủ');
  }
}
