import { ok, fail } from '@/utils/api-response';
import { truTonKhoDonEshop } from '@/services/eshop.service';

/**
 * POST /api/eshop/stock — trừ tồn kho thủ công cho các đơn eShop đủ điều kiện mà chưa trừ.
 * Bình thường không cần gọi (đồng bộ đã tự trừ), giữ lại để chạy bù khi cần.
 * An toàn khi gọi lại nhiều lần: đơn nào trừ rồi sẽ bị bỏ qua (xem EshopOrder.daTruTonKhoLuc).
 */
export async function POST() {
  try {
    const ketQua = await truTonKhoDonEshop();
    const message =
      ketQua.soDon === 0
        ? 'Không có đơn nào cần trừ tồn kho.'
        : `Đã trừ tồn kho cho ${ketQua.soDon} đơn (${ketQua.soSanPham} hàng hóa).`;
    return ok(ketQua, message);
  } catch (error: unknown) {
    return fail(error instanceof Error ? error.message : 'Lỗi máy chủ');
  }
}
