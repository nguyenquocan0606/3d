import { GiaGocCombo, tinhGiaGocCombo, TY_LE_LOI_NHUAN_MAC_DINH } from './dinh-gia-hang-hoa';

/**
 * Khối lượng riêng của từng loại nhựa (g/cm³) — dùng để đổi thể tích mesh ra khối lượng in.
 * Không có trong danh sách thì rơi về DENSITY_MAC_DINH (PLA), vì đây chỉ là ước lượng nhanh
 * (bản 1), sai lệch vài % không ảnh hưởng nhiều tới giá cuối.
 */
export const DENSITY_G_CM3: Record<string, number> = {
  PLA: 1.24,
  PETG: 1.27,
  ABS: 1.04,
  ASA: 1.05,
  TPU: 1.21,
  NYLON: 1.14,
  PC: 1.2,
};

const DENSITY_MAC_DINH = DENSITY_G_CM3.PLA;

/** Tra khối lượng riêng theo tên loại nhựa, không phân biệt hoa/thường. */
export function traDensity(filamentType: string | null | undefined): number {
  if (!filamentType) return DENSITY_MAC_DINH;
  return DENSITY_G_CM3[filamentType.trim().toUpperCase()] ?? DENSITY_MAC_DINH;
}

/**
 * Phụ phí vỏ/perimeter cố định: mesh đặc 100% không phản ánh đúng shell + infill thật, phần vỏ
 * (2-3 lớp thành, layer trên/dưới) luôn tốn nhựa hơn tỷ lệ infill danh nghĩa — cộng thêm % này vào
 * infill hiệu dụng để ước lượng đỡ lệch thấp so với slicer thật.
 */
const PHU_PHI_VO = 0.12;

/** Đổi infill% (0-100) thành tỷ lệ nhựa hiệu dụng so với thể tích đặc 100%. */
export function infillHieuDung(infillPercent: number): number {
  const infill = Math.max(0, Math.min(100, infillPercent)) / 100;
  return Math.min(1, infill + PHU_PHI_VO);
}

export type UocLuongInput = {
  volumeCm3: number;
  instanceCount: number;
  infillPercent: number;
  filamentType: string | null | undefined;
  /** mm — layer càng mỏng thì thời gian in càng lâu, dùng làm hệ số nhân thời gian. */
  layerHeightMm: number;
};

export type UocLuongKetQua = {
  weightG: number;
  timeMinutes: number;
};

/**
 * Ước lượng nhanh khối lượng nhựa + thời gian in từ thể tích mesh — KHÔNG chạy slicer thật.
 *
 * Thời gian in ước lượng bằng heuristic tuyến tính theo thể tích nhựa thực in (không phải thể tích
 * mesh đặc), quy đổi qua một tốc độ đùn trung bình cố định rồi chia theo layer height (lớp càng
 * mỏng càng nhiều lớp, càng lâu). Đây chỉ để có con số ngay tức thì — sai số có thể 20-30% so với
 * slice thật, luôn hiển thị kèm cảnh báo ở UI.
 */
export function uocLuongInBan(input: UocLuongInput): UocLuongKetQua {
  const density = traDensity(input.filamentType);
  const heSoInfill = infillHieuDung(input.infillPercent);
  const theTichThucCm3 = input.volumeCm3 * Math.max(0, input.instanceCount) * heSoInfill;
  const weightG = Math.round(theTichThucCm3 * density * 100) / 100;

  // Tốc độ đùn tham khảo ~15 cm³/giờ ở layer 0.2mm trên máy Bambu tốc độ tiêu chuẩn. Layer mỏng hơn
  // thì số lớp nhiều hơn (mỗi lớp vẫn tốn thời gian đi viền/thành như nhau) nên IN LÂU HƠN dù tổng
  // thể tích đùn ra không đổi — heSoLayer > 1 khi layerHeightMm < 0.2 (nhân thêm thời gian).
  const TOC_DO_THAM_CHIEU_CM3_MOI_GIO = 15;
  const heSoLayer = 0.2 / Math.max(0.04, input.layerHeightMm);
  const gioIn = (theTichThucCm3 / TOC_DO_THAM_CHIEU_CM3_MOI_GIO) * heSoLayer;
  const timeMinutes = Math.round(gioIn * 60);

  return { weightG, timeMinutes };
}

/**
 * giaVon (giá vốn) của một lần in = tiền nhựa (theo gram thực tế) + tiền điện/khấu hao máy (theo
 * thời gian in). Từ giaVon này gọi thẳng `tinhGiaGocCombo` (đã có sẵn, dùng chung với hàng hóa cửa
 * hàng) để ra bộ 4 giá — không viết lại pipeline giá.
 */
export function tinhGiaVonInBan(input: {
  weightG: number;
  filamentCostPerKg: number | null | undefined;
  timeMinutes: number;
  gioMayInVnd: number;
}): number {
  const tienNhua = (input.weightG / 1000) * (input.filamentCostPerKg ?? 0);
  const tienMay = (input.timeMinutes / 60) * input.gioMayInVnd;
  return Math.round(tienNhua + tienMay);
}

export function tinhGiaBaoGia(
  input: {
    weightG: number;
    filamentCostPerKg: number | null | undefined;
    timeMinutes: number;
    gioMayInVnd: number;
  },
  tyLeLoiNhuan: number = TY_LE_LOI_NHUAN_MAC_DINH,
): GiaGocCombo {
  const giaVon = tinhGiaVonInBan(input);
  return tinhGiaGocCombo(giaVon, tyLeLoiNhuan);
}
