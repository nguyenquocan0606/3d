import prisma from '@/utils/db';
import { ok, fail } from '@/utils/api-response';
import { tinhGiaBaoGia, uocLuongInBan } from '@/utils/bao-gia-in-3d';
import { TY_LE_LOI_NHUAN_MAC_DINH } from '@/utils/dinh-gia-hang-hoa';

/**
 * POST /api/quote/estimate — ước lượng nhanh (bản 1, KHÔNG chạy slicer thật).
 *
 * Client tự tính thể tích mesh (three.js) + số bản nhân bản, gửi lên đây cùng lựa chọn máy in/mâm
 * PEI/nhựa/infill/layer height. Server tra giá vốn nhựa + giá điện/khấu hao máy, ra bộ giá, lưu lại
 * 1 dòng Quote (mode "estimate") để giữ lịch sử — KHÔNG tạo Order/PrintItem.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      fileName,
      volumeCm3,
      instanceCount = 1,
      infillPercent = 15,
      layerHeightMm = 0.2,
      printerId,
      peiSheetId,
      filamentId,
      tyLeLoiNhuan,
    } = body ?? {};

    if (!fileName || typeof fileName !== 'string') return fail('Thiếu fileName', 400);
    if (!Number.isFinite(volumeCm3) || volumeCm3 <= 0) return fail('volumeCm3 không hợp lệ', 400);
    if (!Number.isFinite(instanceCount) || instanceCount < 1) return fail('instanceCount không hợp lệ', 400);

    const [filament, config] = await Promise.all([
      filamentId ? prisma.filament.findUnique({ where: { id: filamentId } }) : Promise.resolve(null),
      prisma.cauHinhBaoGia.upsert({ where: { id: 'default' }, update: {}, create: { id: 'default' } }),
    ]);

    const { weightG, timeMinutes } = uocLuongInBan({
      volumeCm3,
      instanceCount,
      infillPercent,
      layerHeightMm,
      filamentType: filament?.type,
    });

    const gia = tinhGiaBaoGia(
      {
        weightG,
        timeMinutes,
        filamentCostPerKg: filament?.costPerKg,
        gioMayInVnd: config.gioMayInVnd,
      },
      Number.isFinite(tyLeLoiNhuan) ? tyLeLoiNhuan : TY_LE_LOI_NHUAN_MAC_DINH,
    );

    const quote = await prisma.quote.create({
      data: {
        fileName,
        printerId: printerId || null,
        peiSheetId: peiSheetId || null,
        filamentId: filamentId || null,
        infillPercent,
        layerHeightMm,
        instanceCount,
        volumeCm3,
        weightG,
        timeMinutes,
        mode: 'estimate',
        giaVon: gia.giaVon,
        gia: gia.gia,
        giaBanLe: gia.giaBanLe,
        giaKhuyenMai: gia.giaKhuyenMai,
      },
    });

    return ok(quote);
  } catch (error: unknown) {
    return fail(error instanceof Error ? error.message : 'Lỗi máy chủ');
  }
}
