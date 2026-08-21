/**
 * Dịch vụ tính toán Dashboard tổng hợp — §7 KE-HOACH-DASHBOARD.md.
 *
 * Nguyên tắc cứng:
 * - Đếm bằng groupBy/aggregate/$queryRaw, KHÔNG findMany rồi đếm JS.
 * - KHÔNG bao giờ findMany StoreProduct mà không có select (cột anh/tepIn là base64 vài trăm MB).
 * - Promise.allSettled — một nguồn hỏng không làm chết cả trang.
 * - Mọi ranh giới ngày quy về UTC+8 (hằng số MUI_GIO_XUONG).
 * - Combo con (parentId khác null) KHÔNG tính tồn riêng.
 */

import prisma from '@/utils/db';
import { MUI_GIO_XUONG, tinhBienKy, ngayUTC8, batDauChuoi } from '@/utils/thoi-gian';
import type {
  KetQuaCanhBao,
  CanhBao,
  KetQuaTongQuan,
  SanXuatSLL,
  SanXuatTheoCon,
  Nhua,
  Kho,
  HangHoa,
  Eshop,
  HaTang,
  KetQuaXuHuong,
  KetQuaHoatDong,
} from '@/types/dashboard.types';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Chuyển BigInt (Prisma trả từ COUNT) thành number an toàn. */
function soHoa(v: unknown): number {
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'number') return v;
  return 0;
}

/**
 * Lấy kết quả từ Promise.allSettled, trả null + ghi lỗi nếu rejected.
 */
function layKetQua<T>(
  ket: PromiseSettledResult<T>,
  ten: string,
  loi: Record<string, string>,
): T | null {
  if (ket.status === 'fulfilled') return ket.value;
  loi[ten] = ket.reason instanceof Error ? ket.reason.message : String(ket.reason);
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// §5.1  Cảnh báo (C1–C20)
// ─────────────────────────────────────────────────────────────────────────────

async function tinhCanhBao(): Promise<KetQuaCanhBao> {
  const now = new Date();
  const truoc24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const truoc7ngay = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Chạy song song các truy vấn độc lập
  const [
    c1Res, c2Res, c3Res, c4Res, c5Res,
    c6Res, c7Res, c8Res, c9Res, c10Res,
    c11Res, c12Res, c13Res, c14Res, c15Res,
    c16Res, c17Res, c19Res, c20Res,
  ] = await Promise.allSettled([
    // C1: Máy in báo lỗi trong 24h và chưa có sự kiện phục hồi sau đó
    prisma.$queryRaw<Array<{ printerId: string; tenMay: string; createdAt: Date; noiDung: string }>>`
      SELECT DISTINCT ON (s."printerId") s."printerId", s."tenMay", s."createdAt", s."noiDung"
      FROM "SuKienMayIn" s
      WHERE s."loai" = 'loi'
        AND s."createdAt" >= ${truoc24h}
        AND NOT EXISTS (
          SELECT 1 FROM "SuKienMayIn" r
          WHERE r."printerId" = s."printerId"
            AND r."loai" IN ('batDau', 'inTiep')
            AND r."createdAt" > s."createdAt"
        )
      ORDER BY s."printerId", s."createdAt" DESC`,

    // C2: Máy mất mạng (mangMat gần nhất sau mangLai gần nhất)
    prisma.$queryRaw<Array<{ printerId: string; tenMay: string; createdAt: Date }>>`
      SELECT DISTINCT ON (s."printerId") s."printerId", s."tenMay", s."createdAt"
      FROM "SuKienMayIn" s
      WHERE s."loai" = 'mangMat'
        AND NOT EXISTS (
          SELECT 1 FROM "SuKienMayIn" r
          WHERE r."printerId" = s."printerId"
            AND r."loai" = 'mangLai'
            AND r."createdAt" > s."createdAt"
        )
      ORDER BY s."printerId", s."createdAt" DESC`,

    // C3: Lượt SLL chạy quá lâu (> max(2× trung bình máy đó, 90 phút))
    prisma.$queryRaw<Array<{ id: string; printerId: string; printerName: string; orderId: string; startedAt: Date; phutDaTroi: number }>>`
      WITH tb AS (
        SELECT "printerId",
               AVG(EXTRACT(EPOCH FROM ("finishedAt" - "startedAt")) / 60) AS avg_phut
        FROM "BulkRun"
        WHERE "status" = 'completed'
          AND "startedAt" IS NOT NULL AND "finishedAt" IS NOT NULL
        GROUP BY "printerId"
      )
      SELECT r."id", r."printerId", r."printerName", r."orderId",
             r."startedAt",
             EXTRACT(EPOCH FROM (NOW() - r."startedAt")) / 60 AS "phutDaTroi"
      FROM "BulkRun" r
      LEFT JOIN tb ON tb."printerId" = r."printerId"
      WHERE r."status" = 'printing'
        AND r."startedAt" IS NOT NULL
        AND EXTRACT(EPOCH FROM (NOW() - r."startedAt")) / 60
            > GREATEST(COALESCE(2 * tb.avg_phut, 90), 90)`,

    // C4: Cuộn sắp hết (<20% ban đầu)
    prisma.spool.findMany({
      where: { status: 'active' },
      select: { id: true, filamentId: true, remainingWeightG: true, initialWeightG: true,
                filament: { select: { type: true, colorName: true } } },
    }).then(rows => rows.filter(s => s.remainingWeightG / s.initialWeightG < 0.2)),

    // C5: Loại nhựa sắp cạn kho — tổng kg < trung bình 7 ngày × 3 (⚠)
    prisma.$queryRaw<Array<{ type: string; colorName: string; kgCon: number; tieuHao7Ngay: number }>>`
      WITH tong AS (
        SELECT f."type", f."colorName",
               SUM(s."remainingWeightG") / 1000.0 AS "kgCon"
        FROM "Spool" s
        JOIN "Filament" f ON f."id" = s."filamentId"
        WHERE s."status" = 'active'
        GROUP BY f."type", f."colorName"
      ),
      tieu AS (
        SELECT f."type", f."colorName",
               COALESCE(SUM(u."usedWeightG"), 0) / 7000.0 AS "tieuHao7Ngay"
        FROM "Task3DSpoolUsage" u
        JOIN "Spool" s ON s."id" = u."spoolId"
        JOIN "Filament" f ON f."id" = s."filamentId"
        WHERE u."createdAt" >= ${truoc7ngay}
        GROUP BY f."type", f."colorName"
      )
      SELECT t."type", t."colorName", t."kgCon",
             COALESCE(ti."tieuHao7Ngay", 0) AS "tieuHao7Ngay"
      FROM tong t
      LEFT JOIN tieu ti USING ("type", "colorName")
      WHERE COALESCE(ti."tieuHao7Ngay", 0) > 0
        AND t."kgCon" < COALESCE(ti."tieuHao7Ngay", 0) * 3`,

    // C6: Cuộn không rõ chỗ (active, không có locationId lẫn printerId)
    prisma.spool.count({ where: { status: 'active', locationId: null, printerId: null } }),

    // C7: Hàng hóa dưới ngưỡng (chỉ hàng mẹ)
    prisma.$queryRaw<Array<{ id: string; ten: string; soLuong: number; nguongCanhBao: number }>>`
      SELECT "id", "ten", "soLuong", "nguongCanhBao"
      FROM "StoreProduct"
      WHERE "parentId" IS NULL
        AND "soLuong" <= "nguongCanhBao"`,

    // C8: Đơn eShop sắp tới hạn (trong 6h tới, chưa nhặt xong)
    prisma.$queryRaw<Array<{ id: string; refNo: string | null; prepareDueTime: Date; conLai_phut: number }>>`
      SELECT o."id", o."refNo", o."prepareDueTime",
             EXTRACT(EPOCH FROM (o."prepareDueTime" - NOW())) / 60 AS "conLai_phut"
      FROM "EshopOrder" o
      WHERE o."prepareDueTime" IS NOT NULL
        AND o."prepareDueTime" > NOW()
        AND o."prepareDueTime" < NOW() + INTERVAL '6 hours'
        AND NOT EXISTS (
          SELECT 1 FROM "EshopPickProgress" pp
          WHERE pp."orderId" = o."id" AND pp."status" = 'picked'
        )
      ORDER BY o."prepareDueTime"`,

    // C9: Đơn xong chưa trừ kho
    prisma.eshopOrder.count({
      where: { completeDate: { not: null }, daTruTonKhoLuc: null },
    }),

    // C10: Token MISA sắp hết hạn
    prisma.misaCredential.findUnique({
      where: { id: 'default' },
      select: { tokenExpiresAt: true, lastCheckOk: true },
    }),

    // C11: Đồng bộ eShop treo
    prisma.eshopSyncState.findUnique({
      where: { id: 'default' },
      select: { lastSyncAt: true, lastSyncOk: true },
    }),

    // C12: Thao tác app bị từ chối trong 24h
    prisma.syncAction.findMany({
      where: { ketQua: 'rejected', apDungLuc: { gte: truoc24h } },
      select: { id: true, loai: true, thietBi: true, apDungLuc: true, thongDiep: true },
      orderBy: { apDungLuc: 'desc' },
    }),

    // C13: Thông báo đẩy trượt trong 24h
    prisma.suKienMayIn.count({ where: { daGui: false, createdAt: { gte: truoc24h } } }),

    // C14: Không còn thiết bị nhận push
    prisma.thietBiThongBao.count({ where: { hoatDong: true } }),

    // C15: Zalo mất kết nối
    prisma.zaloAccount.findMany({
      select: { id: true, nhan: true, trangThai: true, lastMessageAt: true },
    }),

    // C16: Tin Zalo chưa đọc
    prisma.$queryRaw<[{ tong: bigint }]>`
      SELECT COALESCE(SUM("unreadCount"), 0) AS tong FROM "ZaloThread"`,

    // C17: Phiên kiểm kho bỏ quên > 24h
    prisma.inventorySession.findMany({
      where: { active: true, createdAt: { lt: truoc24h } },
      select: { id: true, createdAt: true },
    }),

    // C19: Mâm PEI kẹt (gắn máy nhưng mọi PrintItem đã completed > 2h)
    prisma.$queryRaw<Array<{ id: string; printerId: string; updatedAt: Date }>>`
      SELECT p."id", p."printerId", p."updatedAt"
      FROM "PeiSheet" p
      WHERE p."printerId" IS NOT NULL
        AND EXISTS (SELECT 1 FROM "PrintItem" pi WHERE pi."peiSheetId" = p."id")
        AND NOT EXISTS (
          SELECT 1 FROM "PrintItem" pi
          WHERE pi."peiSheetId" = p."id" AND pi."status" <> 'completed'
        )
        AND p."updatedAt" < NOW() - INTERVAL '2 hours'`,

    // C20: Đơn hàng ì (không hoàn thành, updatedAt > 7 ngày trước)
    prisma.order.count({
      where: { status: { not: 'completed' }, updatedAt: { lt: truoc7ngay } },
    }),
  ]);

  const canhBaoList: CanhBao[] = [];

  // Xử lý từng kết quả ---

  // C1
  if (c1Res.status === 'fulfilled' && c1Res.value.length > 0) {
    canhBaoList.push({
      ma: 'C1', mucDo: 'loi', tieuDe: 'Máy in báo lỗi',
      soLuong: c1Res.value.length,
      chiTiet: c1Res.value.map(r => ({
        id: r.printerId, nhan: r.tenMay, luc: r.createdAt.toISOString(),
        moTa: r.noiDung,
      })),
      dichDen: { web: 'printers', app: '/printers' },
    });
  }

  // C2
  if (c2Res.status === 'fulfilled' && c2Res.value.length > 0) {
    canhBaoList.push({
      ma: 'C2', mucDo: 'loi', tieuDe: 'Máy in mất kết nối mạng',
      soLuong: c2Res.value.length,
      chiTiet: c2Res.value.map(r => ({
        id: r.printerId, nhan: r.tenMay, luc: r.createdAt.toISOString(),
      })),
      dichDen: { web: 'printers', app: '/printers' },
    });
  }

  // C3
  if (c3Res.status === 'fulfilled' && c3Res.value.length > 0) {
    canhBaoList.push({
      ma: 'C3', mucDo: 'canhBao', tieuDe: 'Lượt SLL chạy quá lâu',
      soLuong: c3Res.value.length,
      chiTiet: c3Res.value.map(r => ({
        id: r.id, nhan: `${r.printerName} — ${Math.round(Number(r.phutDaTroi))} phút`,
        luc: r.startedAt.toISOString(), orderId: r.orderId,
      })),
      dichDen: { web: 'production', app: '/bulk-orders' },
    });
  }

  // C4
  if (c4Res.status === 'fulfilled' && c4Res.value.length > 0) {
    canhBaoList.push({
      ma: 'C4', mucDo: 'canhBao', tieuDe: 'Cuộn sắp hết nhựa',
      soLuong: c4Res.value.length,
      chiTiet: c4Res.value.slice(0, 10).map(s => ({
        id: s.id,
        nhan: `${s.filament.type} ${s.filament.colorName} — còn ${Math.round(s.remainingWeightG)}g`,
      })),
      dichDen: { web: 'spools?filter=low', app: '/spools' },
    });
  }

  // C5 (⚠)
  if (c5Res.status === 'fulfilled' && c5Res.value.length > 0) {
    canhBaoList.push({
      ma: 'C5', mucDo: 'canhBao', tieuDe: 'Loại nhựa sắp cạn kho',
      soLuong: c5Res.value.length,
      chiTiet: c5Res.value.map(r => ({
        id: `${r.type}-${r.colorName}`,
        nhan: `${r.type} ${r.colorName} — còn ${r.kgCon.toFixed(1)}kg`,
      })),
      dichDen: { web: 'spools', app: '/spools' },
      ghiChu: 'Dự báo dựa trên nhựa trừ theo job, chưa phải cân thực tế',
    });
  }

  // C6
  if (c6Res.status === 'fulfilled' && soHoa(c6Res.value) > 0) {
    canhBaoList.push({
      ma: 'C6', mucDo: 'tin', tieuDe: 'Cuộn nhựa không rõ vị trí',
      soLuong: soHoa(c6Res.value),
      chiTiet: [],
      dichDen: { web: 'spools?filter=unassigned', app: '/spools' },
    });
  }

  // C7
  if (c7Res.status === 'fulfilled' && c7Res.value.length > 0) {
    canhBaoList.push({
      ma: 'C7', mucDo: 'canhBao', tieuDe: 'Hàng hóa dưới ngưỡng tồn',
      soLuong: c7Res.value.length,
      chiTiet: c7Res.value.slice(0, 10).map(r => ({
        id: r.id, nhan: `${r.ten} — tồn ${r.soLuong}/${r.nguongCanhBao}`,
      })),
      dichDen: { web: 'store', app: '/store' },
    });
  }

  // C8
  if (c8Res.status === 'fulfilled' && c8Res.value.length > 0) {
    const loiDon = c8Res.value.filter(r => Number(r.conLai_phut) < 120);
    const canhBaoDon = c8Res.value.filter(r => Number(r.conLai_phut) >= 120);
    if (loiDon.length > 0) {
      canhBaoList.push({
        ma: 'C8', mucDo: 'loi', tieuDe: 'Đơn eShop sắp hết hạn chuẩn bị',
        soLuong: loiDon.length,
        chiTiet: loiDon.map(r => ({
          id: r.id, nhan: `${r.refNo ?? r.id} — còn ${Math.round(Number(r.conLai_phut))} phút`,
          luc: r.prepareDueTime.toISOString(),
        })),
        dichDen: { web: 'eshop', app: '' },
      });
    }
    if (canhBaoDon.length > 0) {
      canhBaoList.push({
        ma: 'C8b', mucDo: 'canhBao', tieuDe: 'Đơn eShop sắp tới hạn chuẩn bị',
        soLuong: canhBaoDon.length,
        chiTiet: canhBaoDon.map(r => ({
          id: r.id, nhan: `${r.refNo ?? r.id} — còn ${Math.round(Number(r.conLai_phut))} phút`,
          luc: r.prepareDueTime.toISOString(),
        })),
        dichDen: { web: 'eshop', app: '' },
      });
    }
  }

  // C9
  if (c9Res.status === 'fulfilled' && soHoa(c9Res.value) > 0) {
    canhBaoList.push({
      ma: 'C9', mucDo: 'canhBao', tieuDe: 'Đơn eShop xong chưa trừ kho',
      soLuong: soHoa(c9Res.value),
      chiTiet: [],
      dichDen: { web: 'eshop', app: '' },
    });
  }

  // C10
  if (c10Res.status === 'fulfilled' && c10Res.value) {
    const cred = c10Res.value;
    const sapHet = cred.tokenExpiresAt && cred.tokenExpiresAt < new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const loi = cred.lastCheckOk === false;
    if (sapHet || loi) {
      canhBaoList.push({
        ma: 'C10', mucDo: 'loi', tieuDe: 'Token MISA sắp hết hạn',
        soLuong: 1,
        chiTiet: [{ id: 'misa', nhan: sapHet ? 'Token hết hạn trong 2h' : 'Kiểm tra token thất bại',
                    luc: cred.tokenExpiresAt?.toISOString() }],
        dichDen: { web: 'settings?tab=misa', app: '/settings' },
      });
    }
  }

  // C11
  if (c11Res.status === 'fulfilled' && c11Res.value) {
    const sync = c11Res.value;
    const treo = !sync.lastSyncAt || sync.lastSyncAt < new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const loi = sync.lastSyncOk === false;
    if (treo || loi) {
      canhBaoList.push({
        ma: 'C11', mucDo: 'canhBao', tieuDe: 'Đồng bộ eShop bị treo hoặc lỗi',
        soLuong: 1,
        chiTiet: [{ id: 'eshop-sync', nhan: loi ? 'Lần đồng bộ cuối thất bại' : 'Quá 3h chưa đồng bộ',
                    luc: sync.lastSyncAt?.toISOString() }],
        dichDen: { web: 'eshop', app: '' },
      });
    }
  }

  // C12
  if (c12Res.status === 'fulfilled' && c12Res.value.length > 0) {
    canhBaoList.push({
      ma: 'C12', mucDo: 'loi', tieuDe: 'Thao tác app bị từ chối',
      soLuong: c12Res.value.length,
      chiTiet: c12Res.value.slice(0, 5).map(r => ({
        id: r.id, nhan: `${r.thietBi ?? 'Không rõ thiết bị'}: ${r.loai}`,
        luc: r.apDungLuc.toISOString(), moTa: r.thongDiep ?? '',
      })),
      // Web chưa có màn xem thao tác bị từ chối nên để rỗng — chi tiết đã hiện
      // ngay trong thẻ cảnh báo. Đẩy sang tab Sản xuất chỉ làm thợ đi lạc.
      // '/pending-sync' phải khớp Routes.pendingSync trong mobile/lib/core/routes.dart.
      dichDen: { web: '', app: '/pending-sync' },
    });
  }

  // C13
  if (c13Res.status === 'fulfilled' && soHoa(c13Res.value) > 0) {
    canhBaoList.push({
      ma: 'C13', mucDo: 'canhBao', tieuDe: 'Thông báo đẩy trượt',
      soLuong: soHoa(c13Res.value),
      chiTiet: [],
      dichDen: { web: 'zalo', app: '/printer-events' },
    });
  }

  // C14
  if (c14Res.status === 'fulfilled' && soHoa(c14Res.value) === 0) {
    canhBaoList.push({
      ma: 'C14', mucDo: 'canhBao', tieuDe: 'Không có thiết bị nhận push',
      // soLuong = số việc phải xử lý (1), KHÔNG phải số thiết bị (0) — để badge
      // trên thẻ không hiện "0" cạnh một cảnh báo đang bật, đọc rất khó hiểu.
      soLuong: 1,
      chiTiet: [{ id: 'push', nhan: 'Chưa máy nào đăng ký nhận thông báo',
                  luc: now.toISOString(),
                  moTa: 'Máy in lỗi sẽ không ai nhận được báo. Mở app rồi bật thông báo.' }],
      dichDen: { web: 'settings?tab=notifications', app: '/settings' },
    });
  }

  // C15 & C16
  if (c15Res.status === 'fulfilled') {
    const matKnoi = c15Res.value.filter(z =>
      z.trangThai !== 'dang_chay' ||
      (z.lastMessageAt && z.lastMessageAt < new Date(now.getTime() - 6 * 60 * 60 * 1000))
    );
    if (matKnoi.length > 0) {
      canhBaoList.push({
        ma: 'C15', mucDo: 'canhBao', tieuDe: 'Zalo mất kết nối',
        soLuong: matKnoi.length,
        chiTiet: matKnoi.map(z => ({ id: z.id, nhan: z.nhan ?? z.id, moTa: z.trangThai })),
        dichDen: { web: 'zalo', app: '' },
      });
    }
  }

  if (c16Res.status === 'fulfilled') {
    const tongChuaDoc = soHoa(c16Res.value[0]?.tong);
    if (tongChuaDoc > 0) {
      canhBaoList.push({
        ma: 'C16', mucDo: 'tin', tieuDe: 'Có tin nhắn Zalo chưa đọc',
        soLuong: tongChuaDoc,
        chiTiet: [],
        dichDen: { web: 'zalo', app: '' },
      });
    }
  }

  // C17
  if (c17Res.status === 'fulfilled' && c17Res.value.length > 0) {
    canhBaoList.push({
      ma: 'C17', mucDo: 'tin', tieuDe: 'Phiên kiểm kho bỏ quên',
      soLuong: c17Res.value.length,
      chiTiet: c17Res.value.map(s => ({
        id: s.id, nhan: `Phiên tạo lúc ${s.createdAt.toISOString()}`,
        luc: s.createdAt.toISOString(),
      })),
      dichDen: { web: 'check-inventory', app: '/inventory' },
    });
  }

  // C18: tính ở client (MQTT), không qua API — bỏ qua ở backend

  // C19
  if (c19Res.status === 'fulfilled' && c19Res.value.length > 0) {
    canhBaoList.push({
      ma: 'C19', mucDo: 'tin', tieuDe: 'Mâm PEI kẹt — đã in xong nhưng chưa gỡ',
      soLuong: c19Res.value.length,
      chiTiet: c19Res.value.map(r => ({
        id: r.id, nhan: `Mâm ${r.id} trên máy ${r.printerId}`,
        luc: r.updatedAt.toISOString(),
      })),
      dichDen: { web: 'production', app: '/pei' },
    });
  }

  // C20
  if (c20Res.status === 'fulfilled' && soHoa(c20Res.value) > 0) {
    canhBaoList.push({
      ma: 'C20', mucDo: 'tin', tieuDe: 'Đơn hàng ì — không cập nhật 7 ngày',
      soLuong: soHoa(c20Res.value),
      chiTiet: [],
      dichDen: { web: 'production', app: '/production' },
    });
  }

  // Sắp xếp: lỗi → cảnh báo → tin
  const thuTuMuc: Record<string, number> = { loi: 0, canhBao: 1, tin: 2 };
  canhBaoList.sort((a, b) => thuTuMuc[a.mucDo] - thuTuMuc[b.mucDo]);

  const tongTheoMuc = { loi: 0, canhBao: 0, tin: 0 };
  for (const cb of canhBaoList) {
    tongTheoMuc[cb.mucDo] = (tongTheoMuc[cb.mucDo] ?? 0) + 1;
  }

  return {
    tinhLuc: now.toISOString(),
    canhBao: canhBaoList,
    tongTheoMuc,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §5.2  Tổng quan — tính từng nhóm
// ─────────────────────────────────────────────────────────────────────────────

async function tinhSanXuatSLL(tu: Date, den: Date): Promise<SanXuatSLL> {
  const [theoTrangThai, luotKy, donDangChay, luotDangIn] = await Promise.all([
    // Lượt theo trạng thái (không giới hạn kỳ)
    prisma.bulkRun.groupBy({ by: ['status'], _count: { _all: true } }),

    // Số con, lỗi trong kỳ — dùng aggregate trên các lượt đã xong trong kỳ
    prisma.bulkRun.aggregate({
      where: { status: 'completed', finishedAt: { gte: tu, lte: den } },
      _sum: { quantity: true, defectQuantity: true },
      _count: { _all: true },
    }),

    // Đơn đang chạy + tiến độ
    prisma.$queryRaw<Array<{
      id: string; orderCode: string | null; productName: string;
      totalQuantity: number; daXong: number;
    }>>`
      SELECT o."id", o."orderCode", o."productName", o."totalQuantity",
             COALESCE(SUM(r."quantity" - r."defectQuantity") FILTER (WHERE r."status" = 'completed'), 0) AS "daXong"
      FROM "BulkOrder" o
      LEFT JOIN "BulkRun" r ON r."orderId" = o."id"
      WHERE o."status" = 'printing'
      GROUP BY o."id", o."orderCode", o."productName", o."totalQuantity"`,

    // Lượt đang in ngay lúc này
    prisma.$queryRaw<Array<{
      id: string; printerName: string; peiIndex: number; quantity: number; startedAt: Date
    }>>`
      SELECT r."id", r."printerName", r."peiIndex", r."quantity", r."startedAt"
      FROM "BulkRun" r
      WHERE r."status" = 'printing' AND r."startedAt" IS NOT NULL
      ORDER BY r."startedAt"`,
  ]);

  // Lượt in bù trong kỳ
  const luotInBu = await prisma.bulkRun.count({
    where: { isRework: true, finishedAt: { gte: tu, lte: den } },
  });

  // Thời gian trung bình 1 lượt trong kỳ (tính bằng $queryRaw để có EPOCH)
  const [tbRow] = await prisma.$queryRaw<[{ avg_phut: number | null }]>`
    SELECT AVG(EXTRACT(EPOCH FROM ("finishedAt" - "startedAt")) / 60) AS avg_phut
    FROM "BulkRun"
    WHERE "status" = 'completed'
      AND "startedAt" IS NOT NULL AND "finishedAt" IS NOT NULL
      AND "finishedAt" >= ${tu} AND "finishedAt" <= ${den}`;

  const theoTtMap: Record<string, number> = {};
  for (const g of theoTrangThai) theoTtMap[g.status] = g._count._all;

  // conXong = con đạt chất lượng (không kể con lỗi)
  const tongLuong = luotKy._sum.quantity ?? 0;
  const conLoi = luotKy._sum.defectQuantity ?? 0;
  const conXong = tongLuong - conLoi;

  const now = new Date();
  return {
    conXong,
    conLoi,
    tiLeLoi: conXong + conLoi > 0 ? conLoi / (conXong + conLoi) : null,
    luot: {
      xong: theoTtMap['completed'] ?? 0,
      dangIn: theoTtMap['printing'] ?? 0,
      cho: theoTtMap['pending'] ?? 0,
    },
    luotInBu,
    phutTrungBinhMoiLuot: tbRow.avg_phut != null ? Math.round(Number(tbRow.avg_phut)) : null,
    donDangChay: donDangChay.map(d => ({
      id: d.id, orderCode: d.orderCode, productName: d.productName,
      daXong: soHoa(d.daXong), tong: d.totalQuantity,
      phanTram: d.totalQuantity > 0 ? Math.round(soHoa(d.daXong) / d.totalQuantity * 100) : 0,
    })),
    luotDangIn: luotDangIn.map(r => ({
      id: r.id, may: r.printerName, peiIndex: r.peiIndex, soCon: r.quantity,
      batDauLuc: r.startedAt.toISOString(),
      phutDaTroi: Math.round((now.getTime() - r.startedAt.getTime()) / 60_000),
    })),
  };
}

// Snapshot toàn hệ thống — không lọc theo kỳ vì không có completedAt trên PrintItem (§10 #6)
async function tinhSanXuatTheoCon(): Promise<SanXuatTheoCon> {
  const [miengTheoTT, donTheoTT, daKiem, chuaXepMam, mamGanMay] = await Promise.all([
    prisma.printItem.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.printItem.count({ where: { isChecked: true, status: 'completed' } }),
    prisma.printItem.count({ where: { status: 'pending', peiSheetId: null } }),
    prisma.peiSheet.count({ where: { printerId: { not: null } } }),
  ]);

  const mieng: Record<string, number> = {};
  for (const g of miengTheoTT) mieng[g.status] = g._count._all;

  const don: Record<string, number> = {};
  for (const g of donTheoTT) don[g.status] = g._count._all;

  return { mieng, daKiem, chuaXepMam, don, mamGanMay };
}

async function tinhNhua(tu: Date, den: Date): Promise<Nhua> {
  const [theoTrangThai, theoLoaiMau, gTru, chuaGan] = await Promise.all([
    prisma.spool.groupBy({
      by: ['status'],
      _count: { _all: true },
      _sum: { remainingWeightG: true },
    }),
    // Theo loại + màu
    prisma.$queryRaw<Array<{
      type: string; colorName: string; colorHex: string | null; soCuon: number; tong_g: number
    }>>`
      SELECT f."type", f."colorName", f."colorHex",
             COUNT(s."id")::int AS "soCuon",
             COALESCE(SUM(s."remainingWeightG"), 0) AS "tong_g"
      FROM "Spool" s
      JOIN "Filament" f ON f."id" = s."filamentId"
      WHERE s."status" = 'active'
      GROUP BY f."type", f."colorName", f."colorHex"`,
    // Nhựa trừ trong kỳ (⚠ — chỉ là "trừ theo job", không phải cân thực)
    prisma.task3DSpoolUsage.aggregate({
      where: { createdAt: { gte: tu, lte: den } },
      _sum: { usedWeightG: true },
    }),
    // Cuộn không rõ chỗ
    prisma.spool.count({ where: { status: 'active', locationId: null, printerId: null } }),
  ]);

  const theoTtMap: Record<string, number> = {};
  let kgCon = 0;
  for (const g of theoTrangThai) {
    theoTtMap[g.status] = g._count._all;
    if (g.status === 'active') kgCon = (g._sum.remainingWeightG ?? 0) / 1000;
  }

  // Dự báo cạn: tính tiêu hao 30 ngày
  const truoc30Ngay = new Date(tu.getTime() - 30 * 24 * 60 * 60 * 1000);
  const tieuHao30Ngay = await prisma.$queryRaw<Array<{
    type: string; colorName: string; tong_g: number
  }>>`
    SELECT f."type", f."colorName",
           COALESCE(SUM(u."usedWeightG"), 0) AS "tong_g"
    FROM "Task3DSpoolUsage" u
    JOIN "Spool" s ON s."id" = u."spoolId"
    JOIN "Filament" f ON f."id" = s."filamentId"
    WHERE u."createdAt" >= ${truoc30Ngay}
    GROUP BY f."type", f."colorName"`;

  // Tổng còn theo (type, colorName)
  const tonMap: Record<string, number> = {};
  for (const r of theoLoaiMau) {
    const key = `${r.type}|||${r.colorName}`;
    tonMap[key] = r.tong_g;
  }

  const duBaoCanKiet = tieuHao30Ngay
    .filter(r => r.tong_g > 0)
    .map(r => {
      const key = `${r.type}|||${r.colorName}`;
      const kgConLoai = (tonMap[key] ?? 0) / 1000;
      const tieuHaoMoi_kg = r.tong_g / 30 / 1000;
      const soNgay = tieuHaoMoi_kg > 0 ? Math.floor(kgConLoai / tieuHaoMoi_kg) : 9999;
      return { loai: `${r.type} ${r.colorName}`, kgCon: kgConLoai, soNgayConLai: soNgay,
               ghiChu: 'Dự báo dựa trên nhựa trừ theo job' };
    })
    .filter(r => r.soNgayConLai < 14)
    .sort((a, b) => a.soNgayConLai - b.soNgayConLai);

  // Nhóm theo loại và theo màu
  const loaiMap: Record<string, ThongKeLoai> = {};
  const mauMap: Record<string, ThongKeMau> = {};
  for (const r of theoLoaiMau) {
    if (!loaiMap[r.type]) loaiMap[r.type] = { ten: r.type, soCuon: 0, kg: 0 };
    loaiMap[r.type].soCuon += r.soCuon;
    loaiMap[r.type].kg += r.tong_g / 1000;
    const mauKey = r.colorName;
    if (!mauMap[mauKey]) mauMap[mauKey] = { ten: r.colorName, hex: r.colorHex, soCuon: 0, kg: 0 };
    mauMap[mauKey].soCuon += r.soCuon;
    mauMap[mauKey].kg += r.tong_g / 1000;
  }

  return {
    tongCuon: Object.values(theoTtMap).reduce((a, b) => a + b, 0),
    theoTrangThai: theoTtMap,
    kgCon,
    gDaTruTrongKy: gTru._sum.usedWeightG ?? 0,
    theoLoai: Object.values(loaiMap).sort((a, b) => b.kg - a.kg),
    theoMau: Object.values(mauMap).sort((a, b) => b.kg - a.kg),
    duBaoCanKiet,
    chuaGanCho: chuaGan,
  };
}

// Khai báo interface để dùng trong hàm
interface ThongKeLoai { ten: string; soCuon: number; kg: number }
interface ThongKeMau { ten: string; hex: string | null; soCuon: number; kg: number }

async function tinhKho(): Promise<Kho> {
  const [soO, phien, tongActive] = await Promise.all([
    prisma.location.count(),
    prisma.inventorySession.findFirst({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true, items: { select: { id: true } } },
    }),
    prisma.spool.count({ where: { status: 'active' } }),
  ]);

  // Ô trống = location không có cuộn active nào
  const [{ oTrong }] = await prisma.$queryRaw<[{ oTrong: bigint }]>`
    SELECT COUNT(*) AS "oTrong"
    FROM "Location" l
    WHERE NOT EXISTS (
      SELECT 1 FROM "Spool" s WHERE s."locationId" = l."id" AND s."status" = 'active'
    )`;

  return {
    soO,
    oTrong: soHoa(oTrong),
    phienKiemKho: phien ? {
      id: phien.id,
      daQuet: phien.items.length,
      tong: tongActive,
      moLuc: phien.createdAt.toISOString(),
    } : null,
  };
}

async function tinhHangHoa(): Promise<HangHoa> {
  // KHÔNG bao giờ findMany StoreProduct — dùng raw SQL, chỉ đọc 4 cột cần thiết
  const [row] = await prisma.$queryRaw<Array<{
    soMatHang: bigint; duoiNguong: bigint; hetHang: bigint;
    giaVon: number; banLe: number
  }>>`
    SELECT
      COUNT(*) FILTER (WHERE "parentId" IS NULL) AS "soMatHang",
      COUNT(*) FILTER (WHERE "parentId" IS NULL AND "soLuong" <= "nguongCanhBao") AS "duoiNguong",
      COUNT(*) FILTER (WHERE "parentId" IS NULL AND "soLuong" <= 0) AS "hetHang",
      COALESCE(SUM("soLuong" * "giaVon") FILTER (WHERE "parentId" IS NULL), 0) AS "giaVon",
      COALESCE(SUM("soLuong" * "giaBanLe") FILTER (WHERE "parentId" IS NULL), 0) AS "banLe"
    FROM "StoreProduct"`;

  return {
    soMatHang: soHoa(row.soMatHang),
    duoiNguong: soHoa(row.duoiNguong),
    hetHang: soHoa(row.hetHang),
    giaTriTonGiaVon: row.giaVon,
    giaTriTonBanLe: row.banLe,
  };
}

async function tinhEshop(tu: Date, den: Date): Promise<Eshop> {
  const [donKy, theoKenh, nhatProg, xongChuaTru, syncState, canInBs] = await Promise.all([
    // Đơn + doanh thu trong kỳ
    prisma.eshopOrder.aggregate({
      where: { refDate: { gte: tu, lte: den } },
      _count: { _all: true },
      _sum: { totalRevenue: true },
    }),
    // Theo kênh
    prisma.$queryRaw<Array<{ channelName: string | null; soDon: number; doanhThu: number }>>`
      SELECT "channelName", COUNT(*)::int AS "soDon",
             COALESCE(SUM("totalRevenue"), 0) AS "doanhThu"
      FROM "EshopOrder"
      WHERE "refDate" >= ${tu} AND "refDate" <= ${den}
      GROUP BY "channelName"
      ORDER BY "soDon" DESC`,
    // Trạng thái nhặt hàng
    prisma.$queryRaw<Array<{ status: string | null; so: bigint }>>`
      SELECT pp."status", COUNT(o."id") AS so
      FROM "EshopOrder" o
      LEFT JOIN "EshopPickProgress" pp ON pp."orderId" = o."id"
      WHERE o."refDate" >= ${tu} AND o."refDate" <= ${den}
      GROUP BY pp."status"`,
    // Xong chưa trừ kho
    prisma.eshopOrder.count({ where: { completeDate: { not: null }, daTruTonKhoLuc: null } }),
    // Trạng thái đồng bộ + token
    Promise.all([
      prisma.eshopSyncState.findUnique({
        where: { id: 'default' },
        select: { lastSyncAt: true, lastSyncOk: true, lastRunVia: true, lastCount: true },
      }),
      prisma.misaCredential.findUnique({
        where: { id: 'default' },
        select: { tokenExpiresAt: true },
      }),
    ]),
    // Top 10 SKU bán chạy 30 ngày — quy về mã mẹ (cắt hậu tố -1/-2/-5)
    prisma.$queryRaw<Array<{ skuMa: string; soLuong: number }>>`
      SELECT
        REGEXP_REPLACE(i."skuCode", '-[0-9]+$', '') AS "skuMa",
        SUM(
          i."quantity" * COALESCE(
            (SELECT sp."soLuongCombo" FROM "StoreProduct" sp WHERE sp."maQR" = i."skuCode"), 1
          )
        ) AS "soLuong"
      FROM "EshopOrderItem" i
      JOIN "EshopOrder" o ON o."id" = i."orderId"
      WHERE o."refDate" >= NOW() - INTERVAL '30 days'
        AND i."skuCode" IS NOT NULL
      GROUP BY "skuMa"
      ORDER BY "soLuong" DESC
      LIMIT 10`,
  ]);

  // Tính trạng thái nhặt
  let cho = 0, dangNhat = 0, daNhat = 0;
  for (const row of nhatProg) {
    const so = soHoa(row.so);
    if (row.status === 'picked') daNhat = so;
    else if (row.status === 'picking') dangNhat = so;
    else cho += so; // null = chưa có dòng progress
  }

  // SKU bán chạy mà sắp hết
  const skuMaCodes = canInBs.map(r => r.skuMa);
  const tonKhoMap: Record<string, { ten: string; ton: number }> = {};
  if (skuMaCodes.length > 0) {
    const tonRows = await prisma.$queryRaw<Array<{ maQR: string; ten: string; soLuong: number }>>`
      SELECT "maQR", "ten", "soLuong"
      FROM "StoreProduct"
      WHERE "maQR" = ANY(${skuMaCodes}::text[])
        AND "parentId" IS NULL`;
    for (const r of tonRows) tonKhoMap[r.maQR] = { ten: r.ten, ton: r.soLuong };
  }

  const canIn = canInBs
    .map(r => ({
      sku: r.skuMa,
      ten: tonKhoMap[r.skuMa]?.ten ?? r.skuMa,
      ban30Ngay: soHoa(r.soLuong),
      ton: tonKhoMap[r.skuMa]?.ton ?? -1,
    }))
    .filter(r => r.ton >= 0 && r.ton <= 5); // chỉ giữ hàng sắp hết

  const [syncStateData, credData] = syncState;

  return {
    soDon: donKy._count._all,
    doanhThu: donKy._sum.totalRevenue ?? 0,
    theoKenh: theoKenh.map(r => ({
      ten: r.channelName ?? 'Không rõ',
      soDon: r.soDon,
      doanhThu: r.doanhThu,
    })),
    nhat: { cho, dangNhat, daNhat },
    xongChuaTruKho: xongChuaTru,
    dongBo: {
      lucCuoi: syncStateData?.lastSyncAt?.toISOString() ?? null,
      ok: syncStateData?.lastSyncOk ?? null,
      qua: syncStateData?.lastRunVia ?? null,
      soDon: syncStateData?.lastCount ?? 0,
      tokenHetHanLuc: credData?.tokenExpiresAt?.toISOString() ?? null,
    },
    canInBoSung: canIn,
  };
}

async function tinhHaTang(tu: Date, den: Date): Promise<HaTang> {
  const truoc24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [temTheoTT, thaoTacApp, thietBiPush, zaloChuaDoc] = await Promise.all([
    // Tem theo trạng thái trong kỳ
    prisma.printJob.groupBy({
      by: ['status'],
      where: { createdAt: { gte: tu, lte: den } },
      _count: { _all: true },
    }),
    // Thao tác app 24h
    prisma.$queryRaw<Array<{ loai: string; ketQua: string; so: bigint }>>`
      SELECT "loai", "ketQua", COUNT(*) AS so
      FROM "SyncAction"
      WHERE "apDungLuc" >= ${truoc24h}
      GROUP BY "loai", "ketQua"`,
    prisma.thietBiThongBao.count({ where: { hoatDong: true } }),
    prisma.$queryRaw<[{ tong: bigint }]>`
      SELECT COALESCE(SUM("unreadCount"), 0) AS tong FROM "ZaloThread"`,
  ]);

  const tem: Record<string, number> = {};
  for (const g of temTheoTT) tem[g.status] = g._count._all;

  let applied = 0, rejected = 0;
  const loaiMap: Record<string, number> = {};
  for (const r of thaoTacApp) {
    const so = soHoa(r.so);
    if (r.ketQua === 'applied') applied += so;
    else if (r.ketQua === 'rejected') rejected += so;
    loaiMap[r.loai] = (loaiMap[r.loai] ?? 0) + so;
  }

  return {
    tem,
    thaoTacApp24h: {
      applied, rejected,
      theoLoai: Object.entries(loaiMap)
        .map(([loai, so]) => ({ loai, so }))
        .sort((a, b) => b.so - a.so),
    },
    thietBiPush,
    zaloChuaDoc: soHoa(zaloChuaDoc[0]?.tong),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// API công khai
// ─────────────────────────────────────────────────────────────────────────────

export async function layCanhBao(): Promise<KetQuaCanhBao> {
  return tinhCanhBao();
}

export async function layTongQuan(range: 'today' | '7d' | '30d'): Promise<KetQuaTongQuan> {
  const { tu, den, nhan } = tinhBienKy(range);

  const [sllRes, theoConRes, nhuaRes, khoRes, hangRes, eshopRes, haTangRes] =
    await Promise.allSettled([
      tinhSanXuatSLL(tu, den),
      tinhSanXuatTheoCon(),
      tinhNhua(tu, den),
      tinhKho(),
      tinhHangHoa(),
      tinhEshop(tu, den),
      tinhHaTang(tu, den),
    ]);

  const loi: Record<string, string> = {};

  return {
    ky: { tu: tu.toISOString(), den: den.toISOString(), nhan },
    sanXuatSLL: layKetQua(sllRes, 'sanXuatSLL', loi),
    sanXuatTheoCon: layKetQua(theoConRes, 'sanXuatTheoCon', loi),
    nhua: layKetQua(nhuaRes, 'nhua', loi),
    kho: layKetQua(khoRes, 'kho', loi),
    hangHoa: layKetQua(hangRes, 'hangHoa', loi),
    eshop: layKetQua(eshopRes, 'eshop', loi),
    haTang: layKetQua(haTangRes, 'haTang', loi),
    ...(Object.keys(loi).length > 0 ? { loi } : {}),
  };
}

export async function layXuHuong(soNgay: number): Promise<KetQuaXuHuong> {
  const denNgay = new Date();
  const tuNgay = batDauChuoi(soNgay);

  // Chuỗi thời gian — dùng generate_series + AT TIME ZONE để đúng UTC+8
  const [conXongRows, loiMayInRows, nhuaTruRows, eshopRows, temRows, xhSanLuong, xhLoi, xhNhua, xhSku] =
    await Promise.all([
      // Sản lượng con/ngày + tỉ lệ lỗi
      prisma.$queryRaw<Array<{ ngay: Date; so_con: number; so_loi: number; so_luot: number }>>`
        SELECT d::date AS ngay,
               COALESCE(SUM(r."quantity" - r."defectQuantity"), 0) AS so_con,
               COALESCE(SUM(r."defectQuantity"), 0) AS so_loi,
               COUNT(r."id") AS so_luot
        FROM generate_series(${tuNgay}::date, ${denNgay}::date, '1 day') d
        LEFT JOIN "BulkRun" r
          ON (r."finishedAt" AT TIME ZONE 'UTC' AT TIME ZONE ${MUI_GIO_XUONG})::date = d::date
         AND r."status" = 'completed'
        GROUP BY d ORDER BY d`,

      // Lỗi máy in/ngày
      prisma.$queryRaw<Array<{ ngay: Date; so: number }>>`
        SELECT d::date AS ngay, COUNT(s."id") AS so
        FROM generate_series(${tuNgay}::date, ${denNgay}::date, '1 day') d
        LEFT JOIN "SuKienMayIn" s
          ON (s."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${MUI_GIO_XUONG})::date = d::date
         AND s."loai" = 'loi'
        GROUP BY d ORDER BY d`,

      // Nhựa trừ/ngày (⚠)
      prisma.$queryRaw<Array<{ ngay: Date; tong_g: number }>>`
        SELECT d::date AS ngay, COALESCE(SUM(u."usedWeightG"), 0) AS tong_g
        FROM generate_series(${tuNgay}::date, ${denNgay}::date, '1 day') d
        LEFT JOIN "Task3DSpoolUsage" u
          ON (u."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${MUI_GIO_XUONG})::date = d::date
        GROUP BY d ORDER BY d`,

      // Đơn eShop + doanh thu/ngày
      prisma.$queryRaw<Array<{ ngay: Date; so_don: number; doanh_thu: number }>>`
        SELECT d::date AS ngay,
               COUNT(o."id") AS so_don,
               COALESCE(SUM(o."totalRevenue"), 0) AS doanh_thu
        FROM generate_series(${tuNgay}::date, ${denNgay}::date, '1 day') d
        LEFT JOIN "EshopOrder" o
          ON (o."refDate" AT TIME ZONE 'UTC' AT TIME ZONE ${MUI_GIO_XUONG})::date = d::date
        GROUP BY d ORDER BY d`,

      // Tem/ngày
      prisma.$queryRaw<Array<{ ngay: Date; so: number }>>`
        SELECT d::date AS ngay, COUNT(j."id") AS so
        FROM generate_series(${tuNgay}::date, ${denNgay}::date, '1 day') d
        LEFT JOIN "PrintJob" j
          ON (j."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${MUI_GIO_XUONG})::date = d::date
        GROUP BY d ORDER BY d`,

      // Top 5 máy theo sản lượng 30 ngày
      prisma.$queryRaw<Array<{ printerId: string; printerName: string; soConXong: number }>>`
        SELECT r."printerId", r."printerName",
               SUM(r."quantity" - r."defectQuantity") AS "soConXong"
        FROM "BulkRun" r
        WHERE r."status" = 'completed'
          AND r."finishedAt" >= ${tuNgay}
        GROUP BY r."printerId", r."printerName"
        ORDER BY "soConXong" DESC LIMIT 5`,

      // Top 5 máy theo số lỗi
      prisma.$queryRaw<Array<{ printerId: string; tenMay: string; soLanLoi: number }>>`
        SELECT s."printerId", s."tenMay", COUNT(*) AS "soLanLoi"
        FROM "SuKienMayIn" s
        WHERE s."loai" = 'loi'
          AND s."createdAt" >= ${tuNgay}
        GROUP BY s."printerId", s."tenMay"
        ORDER BY "soLanLoi" DESC LIMIT 5`,

      // Top 5 nhựa tiêu hao
      prisma.$queryRaw<Array<{ type: string; colorName: string; colorHex: string | null; tong_g: number }>>`
        SELECT f."type", f."colorName", f."colorHex",
               COALESCE(SUM(u."usedWeightG"), 0) AS tong_g
        FROM "Task3DSpoolUsage" u
        JOIN "Spool" s ON s."id" = u."spoolId"
        JOIN "Filament" f ON f."id" = s."filamentId"
        WHERE u."createdAt" >= ${tuNgay}
        GROUP BY f."type", f."colorName", f."colorHex"
        ORDER BY tong_g DESC LIMIT 5`,

      // Top 10 SKU bán chạy — quy về mã mẹ, nhân soLuongCombo
      prisma.$queryRaw<Array<{ skuMa: string; ten: string | null; soLuong: number }>>`
        SELECT
          REGEXP_REPLACE(i."skuCode", '-[0-9]+$', '') AS "skuMa",
          MAX(i."itemName") AS ten,
          SUM(
            i."quantity" * COALESCE(
              (SELECT sp."soLuongCombo" FROM "StoreProduct" sp WHERE sp."maQR" = i."skuCode"), 1
            )
          ) AS "soLuong"
        FROM "EshopOrderItem" i
        JOIN "EshopOrder" o ON o."id" = i."orderId"
        WHERE o."refDate" >= ${tuNgay}
          AND i."skuCode" IS NOT NULL
        GROUP BY "skuMa"
        ORDER BY "soLuong" DESC
        LIMIT 10`,
    ]);

  // Danh sách ngày để làm trục X
  const ngayList: string[] = conXongRows.map(r => ngayUTC8(new Date(r.ngay)));

  return {
    ngay: ngayList,
    chuoi: {
      conXong: conXongRows.map(r => soHoa(r.so_con)),
      // null nếu ngày không có lượt SLL nào (không phải 0%) — §5.3
      tiLeLoi: conXongRows.map(r => {
        const soLuot = soHoa(r.so_luot);
        if (soLuot === 0) return null;
        const tong = soHoa(r.so_con) + soHoa(r.so_loi);
        return tong > 0 ? soHoa(r.so_loi) / tong : null;
      }),
      nhuaTru: nhuaTruRows.map(r => soHoa(r.tong_g)),
      donEshop: eshopRows.map(r => soHoa(r.so_don)),
      doanhThu: eshopRows.map(r => Number(r.doanh_thu)),
      loiMayIn: loiMayInRows.map(r => soHoa(r.so)),
      tem: temRows.map(r => soHoa(r.so)),
    },
    xepHang: {
      mayTheoSanLuong: xhSanLuong.map(r => ({
        printerId: r.printerId ?? '',
        tenMay: r.printerName,
        soConXong: soHoa(r.soConXong),
      })),
      mayTheoLoi: xhLoi.map(r => ({
        printerId: r.printerId,
        tenMay: r.tenMay,
        soLanLoi: soHoa(r.soLanLoi),
      })),
      nhuaTieuHao: xhNhua.map(r => ({
        loai: r.type, mau: r.colorName, hex: r.colorHex,
        tong_g: soHoa(r.tong_g),
      })),
      skuBanChay: xhSku.map(r => ({
        sku: r.skuMa, ten: r.ten ?? r.skuMa, soLuong: soHoa(r.soLuong),
      })),
    },
  };
}

export async function layHoatDong(limit: number): Promise<KetQuaHoatDong> {
  const truoc24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Lấy song song 5 nguồn
  const [suKienRows, bulkRunRows, syncRows, eshopRows, temRows] = await Promise.all([
    prisma.suKienMayIn.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: { id: true, tenMay: true, loai: true, tieuDe: true, noiDung: true, createdAt: true, printerId: true },
    }),
    prisma.$queryRaw<Array<{
      id: string; orderId: string; printerName: string; peiIndex: number;
      quantity: number; defectQuantity: number; status: string;
      startedAt: Date | null; finishedAt: Date | null
    }>>`
      SELECT r."id", r."orderId", r."printerName", r."peiIndex",
             r."quantity", r."defectQuantity", r."status",
             r."startedAt", r."finishedAt"
      FROM "BulkRun" r
      WHERE r."startedAt" >= ${truoc24h} OR r."finishedAt" >= ${truoc24h}
      ORDER BY GREATEST(r."startedAt", r."finishedAt") DESC NULLS LAST
      LIMIT ${limit}`,
    prisma.syncAction.findMany({
      where: { apDungLuc: { gte: truoc24h } },
      take: limit,
      orderBy: { apDungLuc: 'desc' },
      select: { id: true, loai: true, ketQua: true, thietBi: true, apDungLuc: true, thongDiep: true },
    }),
    prisma.eshopOrder.findMany({
      where: { syncedAt: { gte: truoc24h } },
      take: limit,
      orderBy: { syncedAt: 'desc' },
      select: { id: true, refNo: true, channelName: true, syncedAt: true },
    }),
    prisma.printJob.findMany({
      where: { createdAt: { gte: truoc24h } },
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: { id: true, qrCode: true, status: true, createdAt: true },
    }),
  ]);

  // Gộp và sắp xếp theo thời gian giảm dần
  const tat: KetQuaHoatDong = [];

  for (const r of suKienRows) {
    tat.push({ luc: r.createdAt.toISOString(), nhom: 'mayIn',
               tieuDe: `Máy ${r.tenMay}`, moTa: r.tieuDe,
               dichDen: `printers/${r.printerId}` });
  }

  for (const r of bulkRunRows) {
    const luc = r.finishedAt ?? r.startedAt;
    if (!luc) continue;
    const loi = r.defectQuantity > 0 ? ` (${r.defectQuantity} lỗi)` : '';
    const moTa = r.status === 'completed'
      ? `PEI ${r.peiIndex} máy ${r.printerName}: xong${loi}`
      : `PEI ${r.peiIndex} máy ${r.printerName}: bắt đầu`;
    tat.push({ luc: luc.toISOString(), nhom: 'sll', tieuDe: 'Lượt SLL', moTa,
               dichDen: `bulk/${r.orderId}` });
  }

  for (const r of syncRows) {
    const biTuChoi = r.ketQua === 'rejected' ? ' — bị từ chối' : '';
    tat.push({ luc: r.apDungLuc.toISOString(), nhom: 'app',
               tieuDe: `${r.thietBi ?? 'Thiết bị'}: ${r.loai}${biTuChoi}`,
               moTa: r.thongDiep ?? '' });
  }

  for (const r of eshopRows) {
    tat.push({ luc: r.syncedAt.toISOString(), nhom: 'eshop',
               tieuDe: `Đồng bộ đơn ${r.channelName ?? ''}`,
               moTa: r.refNo ?? r.id,
               dichDen: `eshop/${r.id}` });
  }

  for (const r of temRows) {
    tat.push({ luc: r.createdAt.toISOString(), nhom: 'tem',
               tieuDe: 'In tem', moTa: r.qrCode });
  }

  tat.sort((a, b) => new Date(b.luc).getTime() - new Date(a.luc).getTime());
  return tat.slice(0, limit);
}
