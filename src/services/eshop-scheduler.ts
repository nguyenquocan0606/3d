import { dongBoDonEshop, ghiTrangThaiDongBo, truTonKhoDonEshop } from './eshop.service';

/**
 * Bộ hẹn giờ đồng bộ đơn eShop: chạy 2 mốc mỗi ngày, 00:00 và 12:00 giờ Việt Nam.
 *
 * Việt Nam là UTC+7 cố định (không có giờ mùa hè) nên quy hai mốc đó về UTC 17:00 và 05:00 rồi tính
 * bằng số học UTC — không phụ thuộc múi giờ của máy chủ.
 */
const GIO_CHAY_UTC = [5, 17];
/**
 * Mỗi lần chạy kéo đơn 24 giờ gần nhất. Bộ hẹn giờ chạy mỗi 12 tiếng nên cửa sổ 24h gối đầu nhau,
 * lỡ một lần chạy vẫn không sót đơn.
 */
const SO_GIO_KEO = 24;

declare global {
  var eshopSchedulerDaChay: boolean | undefined;
}

/** Số mili-giây từ bây giờ tới mốc 00:00 hoặc 12:00 giờ VN gần nhất phía trước. */
function msToiMocKeTiep(bayGio: Date): number {
  for (let ngayLech = 0; ngayLech <= 1; ngayLech += 1) {
    for (const gio of GIO_CHAY_UTC) {
      const moc = new Date(
        Date.UTC(
          bayGio.getUTCFullYear(),
          bayGio.getUTCMonth(),
          bayGio.getUTCDate() + ngayLech,
          gio,
          0,
          0,
          0,
        ),
      );
      if (moc.getTime() > bayGio.getTime()) return moc.getTime() - bayGio.getTime();
    }
  }
  return 12 * 60 * 60 * 1000; // không bao giờ tới đây, giữ lại để hàm luôn trả số hợp lệ
}

async function chayMotLuot() {
  const denNgay = new Date();
  const tuNgay = new Date(denNgay.getTime() - SO_GIO_KEO * 60 * 60 * 1000);

  try {
    const ketQua = await dongBoDonEshop(tuNgay, denNgay);
    const tonKho = await truTonKhoDonEshop();
    const message =
      `Tự động (${ketQua.qua === 'agent' ? 'qua máy chính' : 'server gọi thẳng'}): ` +
      `đồng bộ ${ketQua.soDon} đơn, trừ tồn kho ${tonKho.soDon} đơn.` +
      (ketQua.canhBao ? ` ${ketQua.canhBao}` : '');
    await ghiTrangThaiDongBo(!ketQua.canhBao, message, ketQua.soDon);
    console.log(`[eShop] ${message}`);
  } catch (error) {
    // Token MISA hết hạn là lỗi thường gặp — ghi lại trạng thái để tab eShop hiện cảnh báo đỏ,
    // không để văng ra ngoài làm chết tiến trình.
    const message = error instanceof Error ? error.message : 'Lỗi không xác định';
    await ghiTrangThaiDongBo(false, `Tự động thất bại: ${message}`, 0).catch(() => {});
    console.error(`[eShop] Đồng bộ tự động thất bại: ${message}`);
  }
}

function henMocKeTiep() {
  const cho = msToiMocKeTiep(new Date());
  setTimeout(async () => {
    await chayMotLuot();
    henMocKeTiep();
  }, cho).unref?.();
  console.log(`[eShop] Lần đồng bộ tự động kế tiếp sau ${Math.round(cho / 60000)} phút.`);
}

/** Gọi 1 lần lúc server khởi động. Không đồng bộ ngay lúc boot — chờ tới mốc giờ gần nhất. */
export function khoiDongLichDongBoEshop() {
  if (globalThis.eshopSchedulerDaChay) return; // dev hot-reload gọi register() nhiều lần
  globalThis.eshopSchedulerDaChay = true;
  henMocKeTiep();
}
