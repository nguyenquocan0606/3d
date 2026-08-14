/**
 * Công thức tính giá hàng hóa cửa hàng — mọi giá đều bắt nguồn từ giá vốn (giaVon) + % lợi nhuận
 * (tyLeLoiNhuan, mặc định 40%).
 *
 * 1) Giá bán lẻ ngoài sàn = giá vốn cộng đúng % lợi nhuận mong muốn:
 *      giaBanLe = giaVon * (1 + tyLeLoiNhuan/100)
 *
 * 2) Giá bán trên sàn (TikTok Shop, tạm dùng chung cho Shopee — sẽ tách công thức riêng sau) phải
 *    thu về ĐÚNG giá bán lẻ sau khi sàn trừ phí cố định 3.000đ + phí 30% trên giá bán, tức bán trên
 *    sàn lời y như bán lẻ:
 *      giaBanSan - phiCoDinh - phiPhanTram*giaBanSan = giaBanLe
 *      => giaBanSan = (giaBanLe + phiCoDinh) / (1 - phiPhanTram)
 *
 *    (2026-08-12) Đây là bản tổng quát của ràng buộc gốc 2026-08-06 "lợi nhuận sàn = đúng 1 giá vốn":
 *    đặt tyLeLoiNhuan = 100% thì giaBanLe = 2*giaVon và công thức về đúng như cũ.
 *
 *    COMBO không đi qua dây chuyền này: giá combo = giá tương ứng của mẹ × hệ số (xem tinhGiaCombo).
 *
 * 3) Giá niêm yết để set khuyến mãi (sàn tự trừ 25%) thì giá sau KM đúng bằng giaBanSan:
 *      giaKhuyenMai * (1 - tyLeKhuyenMai) = giaBanSan  => giaKhuyenMai = giaBanSan / (1 - tyLeKhuyenMai)
 */

const PHI_SAN_CO_DINH = 3000;
const PHI_SAN_PHAN_TRAM = 0.3;
const TY_LE_KHUYEN_MAI_SAN = 0.25;

/** % lợi nhuận mặc định dùng cho giá bán lẻ khi hàng hóa chưa nhập giá trị riêng. */
export const TY_LE_LOI_NHUAN_MAC_DINH = 40;

/**
 * Chuẩn hóa % lợi nhuận người dùng nhập: bỏ trống / không phải số / số âm đều rơi về mặc định 40%.
 * (0% là giá trị hợp lệ — bán đúng giá vốn.)
 */
export function chuanHoaTyLeLoiNhuan(giaTri: unknown): number {
  if (giaTri === null || giaTri === undefined || giaTri === '') return TY_LE_LOI_NHUAN_MAC_DINH;
  const so = Number(giaTri);
  if (!Number.isFinite(so) || so < 0) return TY_LE_LOI_NHUAN_MAC_DINH;
  return so;
}

/** Giá bán trên sàn — bán xong, trừ phí sàn thì còn lại đúng giá bán lẻ (lời như bán ngoài sàn). */
export function tinhGiaBanSan(giaBanLe: number): number {
  if (!giaBanLe || giaBanLe <= 0) return 0;
  return Math.round((giaBanLe + PHI_SAN_CO_DINH) / (1 - PHI_SAN_PHAN_TRAM));
}

/** Giá bán lẻ ngoài sàn = giá vốn + % lợi nhuận (mặc định 40%). */
export function tinhGiaBanLe(giaVon: number, tyLeLoiNhuan: number = TY_LE_LOI_NHUAN_MAC_DINH): number {
  if (!giaVon || giaVon <= 0) return 0;
  return Math.round(giaVon * (1 + chuanHoaTyLeLoiNhuan(tyLeLoiNhuan) / 100));
}

/** Giá niêm yết trên sàn để khi set khuyến mãi 25% thì giá sau KM về đúng giá bán sàn. */
export function tinhGiaKhuyenMai(giaBanSan: number): number {
  if (!giaBanSan || giaBanSan <= 0) return 0;
  return Math.round(giaBanSan / (1 - TY_LE_KHUYEN_MAI_SAN));
}

export type GiaTinhToan = {
  gia: number; // giá bán trên sàn (TikTok Shop / Shopee)
  giaBanLe: number;
  giaKhuyenMai: number;
};

/**
 * Tính trọn bộ 3 giá còn lại từ giá vốn — dùng chung cho cả client (preview) và server (nguồn sự thật).
 * Dây chuyền: giaVon + % lợi nhuận → giaBanLe → giaBanSan (bù phí sàn) → giaKhuyenMai (bù KM 25%),
 * nên đổi % lợi nhuận là cả 3 giá đổi theo.
 */
export function tinhToanBoGia(giaVon: number, tyLeLoiNhuan: number = TY_LE_LOI_NHUAN_MAC_DINH): GiaTinhToan {
  const giaBanLe = tinhGiaBanLe(giaVon, tyLeLoiNhuan);
  const gia = tinhGiaBanSan(giaBanLe);
  return { gia, giaBanLe, giaKhuyenMai: tinhGiaKhuyenMai(gia) };
}

/** 3 sản phẩm con combo tự sinh cho mỗi sản phẩm mẹ: gộp 1 / 2 / 5 cái. */
export const SO_LUONG_COMBO_MAC_DINH = [1, 2, 5] as const;

/**
 * Hệ số nhân giá của từng combo so với sản phẩm mẹ, tra theo số cái gộp (khóa là chuỗi để lưu JSON).
 * Lưu RIÊNG TỪNG sản phẩm mẹ ở StoreProduct.heSoCombo, sửa ngay trên panel chi tiết của hàng mẹ.
 */
export type HeSoCombo = Record<string, number>;

/**
 * Mặc định (2026-08-06): combo 1 = 1.5x, combo 2 = 2x, combo 5 = 4x — càng mua nhiều càng lời trên
 * mỗi cái, không tuyến tính theo số lượng gộp.
 */
export const HE_SO_COMBO_MAC_DINH: HeSoCombo = { 1: 1.5, 2: 2, 5: 4 };

/** Hệ số đọc từ DB/JSON nhập vào có thể thiếu khóa hoặc sai kiểu — vá về mặc định để không vỡ giá. */
export function chuanHoaHeSoCombo(giaTri: unknown): HeSoCombo {
  const nguon = (giaTri ?? {}) as Record<string, unknown>;
  const heSo: HeSoCombo = {};
  for (const soLuong of SO_LUONG_COMBO_MAC_DINH) {
    const so = Number(nguon[soLuong]);
    heSo[soLuong] = Number.isFinite(so) && so >= 0 ? so : HE_SO_COMBO_MAC_DINH[soLuong];
  }
  return heSo;
}

/** Bộ giá của sản phẩm mẹ dùng làm gốc nhân ra giá combo. */
export type GiaGocCombo = GiaTinhToan & { giaVon: number };

/**
 * Giá combo = giá TƯƠNG ỨNG của sản phẩm mẹ × hệ số (2026-08-12, theo yêu cầu người dùng):
 *     giá sàn combo = giá sàn mẹ  × hệ số
 *     giá KM combo  = giá KM mẹ   × hệ số
 * Giá vốn và giá bán lẻ cũng nhân cùng hệ số để 4 con số luôn cùng một tỷ lệ.
 *
 * Lưu ý đã trao đổi và người dùng chấp nhận: giá sàn mẹ đã gồm phí cố định 3.000đ, nên nhân hệ số
 * thì phần phí đó cũng bị nhân lên theo (combo 5 gánh 4 × 3.000đ). Muốn phí chỉ tính 1 lần thì phải
 * nhân từ giá bán lẻ rồi mới cộng phí — không phải công thức đang dùng.
 */
export function tinhGiaCombo(cha: GiaGocCombo, soLuongCombo: number, heSoCombo: HeSoCombo): GiaGocCombo {
  const heSo = heSoCombo[soLuongCombo] ?? soLuongCombo;
  return {
    giaVon: Math.round(cha.giaVon * heSo),
    giaBanLe: Math.round(cha.giaBanLe * heSo),
    gia: Math.round(cha.gia * heSo),
    giaKhuyenMai: Math.round(cha.giaKhuyenMai * heSo),
  };
}

/** Bộ giá gốc của hàng mẹ, tính lại từ giá vốn + % lợi nhuận (không tin số client gửi lên). */
export function tinhGiaGocCombo(giaVon: number, tyLeLoiNhuan: number = TY_LE_LOI_NHUAN_MAC_DINH): GiaGocCombo {
  return { giaVon, ...tinhToanBoGia(giaVon, tyLeLoiNhuan) };
}

export function taoMaComboSku(maGoc: string, soLuong: number): string {
  return `${maGoc}-${soLuong}`;
}

/**
 * Tồn kho combo con = tồn kho sản phẩm mẹ chia cho số lượng gộp, làm tròn xuống — luôn tính "sống"
 * từ tồn kho mẹ (không lưu độc lập) để không bao giờ lệch khi tồn kho mẹ thay đổi.
 * Ví dụ: mẹ còn 5 → combo 1 = 5, combo 2 = floor(5/2) = 2, combo 5 = floor(5/5) = 1.
 */
export function tinhSoLuongCombo(soLuongCha: number, soLuongCombo: number): number {
  if (!soLuongCombo || soLuongCombo <= 0) return 0;
  return Math.max(0, Math.floor(soLuongCha / soLuongCombo));
}
