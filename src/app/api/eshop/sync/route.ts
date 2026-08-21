import { ok, fail } from '@/utils/api-response';
import { LoiEshop, dongBoDonEshop, ghiTrangThaiDongBo, truTonKhoDonEshop } from '@/services/eshop.service';

/**
 * Mặc định chỉ kéo đơn trong 24 giờ gần nhất (VD chạy lúc 12h hôm nay thì lấy từ 12h hôm qua).
 * Đồng bộ tự động chạy mỗi 12 tiếng nên cửa sổ 24h luôn gối đầu, không sót đơn.
 */
const SO_GIO_MAC_DINH = 24;

/**
 * POST /api/eshop/sync — kéo đơn từ MISA về DB rồi TỰ TRỪ TỒN KHO luôn.
 * Body (tùy chọn): { tuNgay: ISO, denNgay: ISO }. Không truyền thì lấy 24 giờ gần nhất.
 *
 * Request tới MISA đi qua máy chính nếu đã khai địa chỉ; máy chính không phản hồi thì tự gọi thẳng.
 */
export async function POST(req: Request) {
  try {
    let body: { tuNgay?: string; denNgay?: string } = {};
    try {
      body = await req.json();
    } catch {
      // Không có body — dùng khoảng thời gian mặc định bên dưới.
    }

    const denNgay = body.denNgay && !Number.isNaN(Date.parse(body.denNgay)) ? new Date(body.denNgay) : new Date();
    const tuNgay =
      body.tuNgay && !Number.isNaN(Date.parse(body.tuNgay))
        ? new Date(body.tuNgay)
        : new Date(denNgay.getTime() - SO_GIO_MAC_DINH * 60 * 60 * 1000);

    if (tuNgay > denNgay) return fail('Ngày bắt đầu phải trước ngày kết thúc', 400);

    const ketQua = await dongBoDonEshop(tuNgay, denNgay);
    const tonKho = await truTonKhoDonEshop();

    const message =
      `Đã đồng bộ ${ketQua.soDon} đơn (${ketQua.qua === 'agent' ? 'qua máy chính' : 'server gọi thẳng'})` +
      (tonKho.soDon > 0
        ? `, trừ tồn kho ${tonKho.soDon} đơn (${tonKho.soSanPham} hàng hóa).`
        : '. Không có đơn nào cần trừ tồn kho.') +
      (ketQua.canhBao ? ` ${ketQua.canhBao}` : '');

    await ghiTrangThaiDongBo(!ketQua.canhBao, message, ketQua.soDon);

    return ok({ ...ketQua, tonKho }, message);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Lỗi máy chủ';
    await ghiTrangThaiDongBo(false, message, 0);
    return fail(message, error instanceof LoiEshop ? 502 : 500);
  }
}
