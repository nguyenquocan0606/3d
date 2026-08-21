/**
 * Kiểu dữ liệu dashboard tổng hợp — dùng chung server ↔ client.
 * Mọi shape trong §5 của KE-HOACH-DASHBOARD.md định nghĩa tại đây.
 */

// ─────────────────────────────────────────────────────────
// §5.1  Tầng 1: Cảnh báo
// ─────────────────────────────────────────────────────────

export type MucDoCanhBao = 'loi' | 'canhBao' | 'tin';

export interface ChiTietCanhBao {
  id: string;
  nhan: string;
  luc?: string; // ISO 8601
  [key: string]: unknown;
}

export interface CanhBao {
  ma: string;          // C1 … C20
  mucDo: MucDoCanhBao;
  tieuDe: string;
  soLuong: number;
  chiTiet: ChiTietCanhBao[];
  dichDen: {
    web: string;       // tên route/tab
    app?: string;      // deep-link Flutter
  };
  /** Chú thích độ chính xác — hiện cạnh icon ⚠ trên UI */
  ghiChu?: string;
}

export interface KetQuaCanhBao {
  tinhLuc: string;
  canhBao: CanhBao[];
  tongTheoMuc: Record<MucDoCanhBao, number>;
}

// ─────────────────────────────────────────────────────────
// §5.2  Tầng 2: Tổng quan
// ─────────────────────────────────────────────────────────

export interface BieuKyJSON {
  tu: string;   // ISO 8601
  den: string;
  nhan: string;
}

// --- Sản xuất SLL ---
export interface DonSLLDangChay {
  id: string;
  orderCode: string | null;
  productName: string;
  daXong: number;
  tong: number;
  phanTram: number;
}

export interface LuotDangIn {
  id: string;
  may: string;
  peiIndex: number;
  soCon: number;
  batDauLuc: string;
  phutDaTroi: number;
}

export interface SanXuatSLL {
  conXong: number;
  conLoi: number;
  /** null nếu không có lượt nào trong kỳ */
  tiLeLoi: number | null;
  luot: { xong: number; dangIn: number; cho: number };
  luotInBu: number;
  /** phút, null nếu chưa có dữ liệu */
  phutTrungBinhMoiLuot: number | null;
  donDangChay: DonSLLDangChay[];
  luotDangIn: LuotDangIn[];
}

// --- Sản xuất theo con ---
export interface SanXuatTheoCon {
  mieng: Record<string, number>;       // groupBy status
  daKiem: number;
  chuaXepMam: number;
  don: Record<string, number>;         // groupBy status
  mamGanMay: number;
}

// --- Nhựa ---
export interface ThongKeLoai {
  ten: string;
  soCuon: number;
  kg: number;
}

export interface ThongKeMau {
  ten: string;
  hex: string | null;
  soCuon: number;
  kg: number;
}

export interface DuBaoCanKiet {
  loai: string;
  kgCon: number;
  soNgayConLai: number;
  /** Dự báo dựa trên tiêu hao theo job, chưa phải tiêu hao thực tế */
  ghiChu?: string;
}

export interface Nhua {
  tongCuon: number;
  theoTrangThai: Record<string, number>;
  kgCon: number;
  /** g, ⚠ chỉ là "đã trừ theo job", không phải tiêu hao cân thực */
  gDaTruTrongKy: number;
  theoLoai: ThongKeLoai[];
  theoMau: ThongKeMau[];
  duBaoCanKiet: DuBaoCanKiet[];
  chuaGanCho: number;
}

// --- Kho ---
export interface PhienKiemKho {
  id: string;
  daQuet: number;
  tong: number;
  moLuc: string;
}

export interface Kho {
  soO: number;
  oTrong: number;
  phienKiemKho: PhienKiemKho | null;
}

// --- Hàng hóa ---
export interface HangHoa {
  soMatHang: number;
  duoiNguong: number;
  hetHang: number;
  /** ⚠ tồn theo giá vốn — combo con không tính */
  giaTriTonGiaVon: number;
  /** ⚠ tồn theo giá bán lẻ — combo con không tính */
  giaTriTonBanLe: number;
}

// --- eShop ---
export interface TheoKenh {
  ten: string;
  soDon: number;
  doanhThu: number;
}

export interface TrangThaiNhat {
  cho: number;
  dangNhat: number;
  daNhat: number;
}

export interface TrangThaiDongBo {
  lucCuoi: string | null;
  ok: boolean | null;
  qua: string | null;
  soDon: number;
  tokenHetHanLuc: string | null;
}

export interface CanInBoSung {
  sku: string;
  ten: string;
  ban30Ngay: number;
  ton: number;
}

export interface Eshop {
  soDon: number;
  /** ⚠ từ trường totalRevenue MISA, chưa đối chiếu phí sàn */
  doanhThu: number;
  theoKenh: TheoKenh[];
  nhat: TrangThaiNhat;
  xongChuaTruKho: number;
  dongBo: TrangThaiDongBo;
  canInBoSung: CanInBoSung[];
}

// --- Hạ tầng ---
export interface ThaoTacApp24h {
  applied: number;
  rejected: number;
  theoLoai: Array<{ loai: string; so: number }>;
}

export interface HaTang {
  tem: Record<string, number>;
  thaoTacApp24h: ThaoTacApp24h;
  thietBiPush: number;
  zaloChuaDoc: number;
}

// Payload trả về
export interface KetQuaTongQuan {
  ky: BieuKyJSON;
  sanXuatSLL: SanXuatSLL | null;
  sanXuatTheoCon: SanXuatTheoCon | null;
  nhua: Nhua | null;
  kho: Kho | null;
  hangHoa: HangHoa | null;
  eshop: Eshop | null;
  haTang: HaTang | null;
  /** Nhóm nào lỗi khi tính */
  loi?: Record<string, string>;
}

// ─────────────────────────────────────────────────────────
// §5.3  Tầng 3: Xu hướng
// ─────────────────────────────────────────────────────────

export interface ChuoiThoiGian {
  conXong: number[];
  /** null = ngày không có lượt SLL nào — vẽ đứt đoạn thay vì nối 0 */
  tiLeLoi: (number | null)[];
  nhuaTru: number[];
  donEshop: number[];
  doanhThu: number[];
  loiMayIn: number[];
  tem: number[];
}

export interface XepHangMayTheoSanLuong {
  printerId: string;
  tenMay: string;
  soConXong: number;
}

export interface XepHangMayTheoLoi {
  printerId: string;
  tenMay: string;
  soLanLoi: number;
}

export interface XepHangNhuaTieuHao {
  loai: string;
  mau: string;
  hex: string | null;
  tong_g: number;
}

export interface XepHangSKU {
  sku: string;         // mã mẹ (đã quy về)
  ten: string;
  soLuong: number;
}

export interface XepHang {
  mayTheoSanLuong: XepHangMayTheoSanLuong[];
  mayTheoLoi: XepHangMayTheoLoi[];
  nhuaTieuHao: XepHangNhuaTieuHao[];
  skuBanChay: XepHangSKU[];
}

export interface KetQuaXuHuong {
  ngay: string[];           // YYYY-MM-DD theo UTC+8
  chuoi: ChuoiThoiGian;
  xepHang: XepHang;
}

// ─────────────────────────────────────────────────────────
// §5.5  Tầng 4: Feed hoạt động
// ─────────────────────────────────────────────────────────

export type NhomHoatDong = 'mayIn' | 'sll' | 'eshop' | 'app' | 'tem';

export interface HoatDong {
  luc: string;                 // ISO 8601
  nhom: NhomHoatDong;
  tieuDe: string;
  moTa: string;
  dichDen?: string;
}

export type KetQuaHoatDong = HoatDong[];
