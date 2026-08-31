import prisma from '@/utils/db';
import { ok, fail } from '@/utils/api-response';
import { tinhGiaVonInBan, traDensity } from '@/utils/bao-gia-in-3d';
import { tinhGiaGocCombo, TY_LE_LOI_NHUAN_MAC_DINH } from '@/utils/dinh-gia-hang-hoa';

const SLICER_WORKER_TOKEN = process.env.SLICER_WORKER_TOKEN || '';

/**
 * POST /api/quote/slice/[id]/complete — slicer-worker gọi ngược vào đây khi slice xong (hoặc lỗi).
 *
 * Worker KHÔNG có quyền truy cập Postgres (cô lập — xem scripts/slicer-worker.mjs) nên chỉ báo số
 * đo vật lý (volumeCm3, timeMinutes) qua đây; việc tính giá vẫn nằm ở phía TS này, tái dùng đúng
 * công thức của bản 1 (`tinhGiaVonInBan` + `tinhGiaGocCombo`) — không có logic tính giá thứ hai.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (SLICER_WORKER_TOKEN && request.headers.get('x-worker-token') !== SLICER_WORKER_TOKEN) {
      return fail('Sai token', 401);
    }

    const { id } = await params;
    const body = await request.json();

    const quote = await prisma.quote.findUnique({ where: { id } });
    if (!quote) return fail('Không tìm thấy quote', 404);

    if (!body.ok) {
      const thatBai = await prisma.quote.update({
        where: { id },
        data: { sliceStatus: 'failed', sliceError: body.error || 'Slice thất bại không rõ lý do' },
      });
      return ok(thatBai);
    }

    // Thể tích worker trả về là CHO 1 BẢN (đã gồm walls+infill thật, không phải mesh đặc 100% như
    // bản 1 ước lượng) — nhân theo số bản sao để ra tổng cho cả lượt in.
    const volumeCm3 = Number(body.volumeCm3) * quote.instanceCount;
    const timeMinutes = Number(body.timeMinutes) * quote.instanceCount;

    const [filament, config] = await Promise.all([
      quote.filamentId ? prisma.filament.findUnique({ where: { id: quote.filamentId } }) : Promise.resolve(null),
      prisma.cauHinhBaoGia.upsert({ where: { id: 'default' }, update: {}, create: { id: 'default' } }),
    ]);

    const weightG = Math.round(volumeCm3 * traDensity(filament?.type) * 100) / 100;
    const giaVon = tinhGiaVonInBan({
      weightG,
      filamentCostPerKg: filament?.costPerKg,
      timeMinutes,
      gioMayInVnd: config.gioMayInVnd,
    });
    const gia = tinhGiaGocCombo(giaVon, TY_LE_LOI_NHUAN_MAC_DINH);

    const xong = await prisma.quote.update({
      where: { id },
      data: {
        volumeCm3,
        weightG,
        timeMinutes,
        sliceStatus: 'done',
        giaVon: gia.giaVon,
        gia: gia.gia,
        giaBanLe: gia.giaBanLe,
        giaKhuyenMai: gia.giaKhuyenMai,
      },
    });

    return ok(xong);
  } catch (error: unknown) {
    return fail(error instanceof Error ? error.message : 'Lỗi máy chủ');
  }
}
