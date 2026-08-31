'use client';

import React, { ChangeEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import TheNguoiDung, { useNguoiDungHienTai } from '@/components/Auth/the-nguoi-dung';
import QRCode from 'qrcode';
import {
  AlertTriangle,
  ArrowDownUp,
  Boxes,
  Calculator,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Columns3,
  CornerDownRight,
  Download,
  FileDown,
  FileText,
  FileUp,
  History,
  Image as ImageIcon,
  ImagePlus,
  Loader2,
  Minus,
  Package,
  PackagePlus,
  Paperclip,
  Pencil,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  ScanLine,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingCart,
  Star,
  Store,
  Tag,
  Trash2,
  X,
  XCircle,
  ZoomIn,
} from 'lucide-react';
import {
  HE_SO_COMBO_MAC_DINH,
  SO_LUONG_COMBO_MAC_DINH,
  TY_LE_LOI_NHUAN_MAC_DINH,
  chuanHoaHeSoCombo,
  chuanHoaTyLeLoiNhuan,
  taoMaComboSku,
  tinhGiaCombo,
  tinhGiaGocCombo,
  tinhSoLuongCombo,
  tinhToanBoGia,
  type HeSoCombo,
} from '@/utils/dinh-gia-hang-hoa';

type TruongRieng = {
  id: string;
  ten: string;
};

type AnhSanPham = {
  id: string;
  ten: string;
  duLieu: string;
  loai: string;
  dungLuong: number;
};

/** File in kèm hàng hóa (bản thiết kế/tệp in — PDF, STL, 3MF, gcode...) để in lại ngay khi sắp hết hàng. */
type TepIn = {
  id: string;
  ten: string;
  duLieu: string;
  loai: string;
  dungLuong: number;
};

type LichSuKho = {
  id: string;
  thoiGian: string;
  noiDung: string;
};

type SanPham = {
  id: string;
  maQR: string;
  ten: string;
  danhMuc: string;
  /** Giá vốn — giá trị gốc người dùng nhập; gia/giaBanLe/giaKhuyenMai đều tự tính từ đây (xem dinh-gia-hang-hoa.ts). */
  giaVon: number;
  /** % lợi nhuận người dùng nhập (mặc định 40) — chỉ dùng để tính giá bán lẻ. */
  tyLeLoiNhuan: number;
  gia: number; // giá bán trên sàn (TikTok Shop / Shopee)
  giaBanLe: number; // giá bán lẻ ngoài sàn = giaVon x (1 + tyLeLoiNhuan/100)
  giaKhuyenMai: number; // giá niêm yết để set khuyến mãi 25% trên sàn thì về đúng `gia`
  soLuong: number;
  donVi: string;
  nguongCanhBao: number;
  nhaCungCap: string;
  ghiChu: string;
  thongTinRieng: Record<string, string>;
  /** Thumbnail nhỏ của anh[0], luôn có sẵn ngay từ danh sách — dùng hiển thị avatar mà không cần tải ảnh gốc. */
  anhDaiDien: string | null;
  /**
   * Khi mới tải danh sách, mỗi phần tử chỉ có metadata (duLieu rỗng) để tránh tải toàn bộ ảnh gốc
   * của mọi hàng hóa cùng lúc. Ảnh thật chỉ được nạp qua taiAnhDayDu() khi cần xem/sửa.
   */
  anh: AnhSanPham[];
  tepIn: TepIn[];
  lichSu: LichSuKho[];
  ngayTao: string;
  ngayCapNhat: string;
  /** Sản phẩm con combo (1/2/5 cái) trỏ về id sản phẩm mẹ — null nếu bản thân nó là sản phẩm mẹ. */
  parentId: string | null;
  /** Số cái gộp trong combo (1/2/5) — chỉ có ở sản phẩm con. */
  soLuongCombo: number | null;
  /** Hệ số nhân ra giá 3 combo con — chỉ có ở sản phẩm mẹ, sửa ngay trên panel chi tiết. */
  heSoCombo: HeSoCombo;
};

type BieuMau = {
  ten: string;
  danhMuc: string;
  giaVon: string;
  tyLeLoiNhuan: string;
  soLuong: string;
  donVi: string;
  nguongCanhBao: string;
  nhaCungCap: string;
  ghiChu: string;
  thongTinRieng: Record<string, string>;
};

type KetQuaBieuMau = BieuMau & { anh: AnhSanPham[]; tepIn: TepIn[] };

/**
 * Bảng tính giá vốn tham khảo (một mẻ in): tiền nhựa theo gram + tiền máy theo giờ, chia đều cho số
 * sản phẩm ra được. Hoàn toàn TÁCH RỜI dữ liệu hàng hóa — không tự ghi vào giá vốn của sản phẩm nào.
 */
type MauTinhGiaVon = {
  soGam: string;
  soGio: string;
  soSanPham: string;
  tienMoiGam: string;
  tienMoiGio: string;
};

type KieuSapXep = 'moiNhat' | 'tenAZ' | 'tonItNhat' | 'giaTriCao' | 'thieuTepAnh';
type TrangThaiQuet = 'cho' | 'thanhCong' | 'loi';

/** Số dòng dựng thêm mỗi mẻ khi cuộn danh sách hàng hóa (mẻ đầu tiên cũng bằng đúng số này). */
const SO_HANG_MOI_LAN = 10;

const KEY_SAN_PHAM = 'quan-ly-cua-hang-san-pham-v1';
const KEY_TRUONG_RIENG = 'quan-ly-cua-hang-truong-rieng-v1';
/** Bảng tính giá vốn tham khảo — chỉ nằm ở máy người dùng, KHÔNG dính vào dữ liệu hàng hóa trên server. */
const KEY_TINH_GIA_VON = 'quan-ly-cua-hang-tinh-gia-von-v1';

/** Cạnh dài tối đa khi nén ảnh — dữ liệu ảnh được đồng bộ base64 lên server nên phải giữ nhẹ. */
const CANH_ANH_TOI_DA = 1400;

/**
 * File in không nén được như ảnh nên vẫn cần chặn ngưỡng dung lượng, nhưng giờ file in đã tải/đồng bộ
 * lazy theo từng hàng hóa (giống ảnh — xem taiTepInDayDu) thay vì gửi kèm mọi hàng hóa mỗi lần đồng bộ,
 * nên nới rộng lên mức đủ cho file .gcode/.gcode.3mf multi-plate thực tế (trước đây 20MB hay bị chặn).
 */
const DUNG_LUONG_TEP_IN_TOI_DA = 50 * 1024 * 1024;

/**
 * Trần dung lượng 1 request gửi ảnh/file in. Cloudflare + nginx trước app chặn body quá lớn bằng
 * trang 413 HTML — đo thực tế: 50 MB qua được, 110 MB bị chặn. Đặt 80 MB cho body (đã tính base64
 * phình ~4/3), tức tệp gốc tối đa 50 MB ở trên còn dư chỗ cho các tệp cũ của cùng hàng hóa.
 */
const GIOI_HAN_BODY = 80 * 1024 * 1024;

const truongMacDinh: TruongRieng[] = [
  { id: 'viTri', ten: 'Vị trí kệ' },
  { id: 'hanDung', ten: 'Hạn dùng' },
  { id: 'kichThuoc', ten: 'Kích thước' },
];

const mauBanDau: BieuMau = {
  ten: '',
  danhMuc: 'Chưa phân loại',
  giaVon: '',
  tyLeLoiNhuan: String(TY_LE_LOI_NHUAN_MAC_DINH),
  soLuong: '',
  donVi: 'cái',
  nguongCanhBao: '5',
  nhaCungCap: '',
  ghiChu: '',
  thongTinRieng: {},
};

const mauTinhGiaVonBanDau: MauTinhGiaVon = {
  soGam: '',
  soGio: '',
  soSanPham: '1',
  tienMoiGam: '',
  tienMoiGio: '',
};

/** Đọc lại lần nhập trước (đơn giá nhựa/giờ máy ít khi đổi nên không bắt gõ lại mỗi lần mở). */
const docMauTinhGiaVon = (): MauTinhGiaVon => {
  if (typeof window === 'undefined') return mauTinhGiaVonBanDau;
  try {
    const daLuu = window.localStorage.getItem(KEY_TINH_GIA_VON);
    if (!daLuu) return mauTinhGiaVonBanDau;
    const giaTri = JSON.parse(daLuu) as Record<string, unknown>;
    const ketQua = { ...mauTinhGiaVonBanDau };
    (Object.keys(mauTinhGiaVonBanDau) as Array<keyof MauTinhGiaVon>).forEach((khoa) => {
      if (typeof giaTri[khoa] === 'string') ketQua[khoa] = giaTri[khoa];
    });
    return ketQua;
  } catch {
    return mauTinhGiaVonBanDau; // localStorage hỏng/bị chặn → nhập lại từ đầu
  }
};

const luaChonSapXep: Array<{ giaTri: KieuSapXep; nhan: string }> = [
  { giaTri: 'moiNhat', nhan: 'Mới cập nhật' },
  { giaTri: 'tenAZ', nhan: 'Tên A → Z' },
  { giaTri: 'tonItNhat', nhan: 'Tồn kho ít nhất' },
  { giaTri: 'giaTriCao', nhan: 'Giá trị kho cao nhất' },
  { giaTri: 'thieuTepAnh', nhan: 'Thiếu file/ảnh' },
];

/**
 * Thứ hạng khi sắp xếp "Thiếu file/ảnh" (bấm vào tiêu đề cột Ảnh / File) — số nhỏ lên trước:
 * chưa có file in → chưa có ảnh → chưa có cả hai → đủ cả hai (xuống cuối).
 */
const thuTuThieuTepAnh = (item: SanPham) => {
  const coAnh = item.anh.length > 0;
  const coTepIn = item.tepIn.length > 0;
  if (coAnh && !coTepIn) return 0;
  if (!coAnh && coTepIn) return 1;
  if (!coAnh && !coTepIn) return 2;
  return 3;
};

const dinhDangTien = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});

const dinhDangSo = new Intl.NumberFormat('vi-VN');

// Lớp dùng chung để cả tab bám đúng design system của app (thẻ tối #111827, accent indigo).
const LOP_THE = 'rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#111827]';
const LOP_NHAP =
  'h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500';
const LOP_NUT_CHINH =
  'inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60';
const LOP_NUT_PHU =
  'inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800';
const LOP_NEN_PHU = 'rounded-xl bg-slate-100 p-3 dark:bg-slate-900/70';
/** Vùng vẫn cuộn được nhưng ẩn hẳn thanh cuộn — trang khóa cuộn tổng, chỉ cuộn bên trong từng thẻ. */
const LOP_AN_CUON = '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

const taoId = (prefix = 'SP') => {
  const ngay = new Date();
  const phanNgay = ngay.toISOString().slice(2, 10).replaceAll('-', '');
  const phanNgauNhien = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${prefix}-${phanNgay}-${phanNgauNhien}`;
};

/** Dữ liệu cũ (localStorage/JSON xuất trước khi có tính năng file in/thumbnail/giá vốn/combo) có thể thiếu trường mới — chuẩn hóa để tránh crash. */
const chuanHoaSanPham = (danhSach: SanPham[]): SanPham[] =>
  danhSach.map((item) => ({
    ...item,
    tepIn: item.tepIn ?? [],
    anhDaiDien: item.anhDaiDien ?? null,
    giaVon: item.giaVon ?? 0,
    tyLeLoiNhuan: item.tyLeLoiNhuan ?? TY_LE_LOI_NHUAN_MAC_DINH,
    gia: item.gia ?? 0,
    giaBanLe: item.giaBanLe ?? 0,
    giaKhuyenMai: item.giaKhuyenMai ?? 0,
    parentId: item.parentId ?? null,
    soLuongCombo: item.soLuongCombo ?? null,
    heSoCombo: chuanHoaHeSoCombo(item.heSoCombo),
  }));

/**
 * crypto.randomUUID() CHỈ tồn tại ở secure context (HTTPS hoặc localhost) — mở app qua HTTP bằng IP
 * LAN thì không có, gọi thẳng sẽ ném "crypto.randomUUID is not a function" (gặp khi tải ảnh/file lên).
 * Có thì dùng, không thì tự ghép UUID v4 từ getRandomValues, cùng lắm mới hạ xuống Math.random —
 * id này chỉ để phân biệt ảnh/file/dòng lịch sử trong cùng một hàng hóa nên vậy là đủ.
 */
const taoIdNgauNhien = (): string => {
  const boMaHoa = globalThis.crypto as Crypto | undefined;
  if (typeof boMaHoa?.randomUUID === 'function') return boMaHoa.randomUUID();

  if (typeof boMaHoa?.getRandomValues === 'function') {
    const byte = boMaHoa.getRandomValues(new Uint8Array(16));
    byte[6] = (byte[6] & 0x0f) | 0x40; // phiên bản 4
    byte[8] = (byte[8] & 0x3f) | 0x80; // biến thể RFC 4122
    const hex = Array.from(byte, (item) => item.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const taoLichSu = (noiDung: string): LichSuKho => ({
  id: taoIdNgauNhien(),
  thoiGian: new Date().toISOString(),
  noiDung,
});

/** Bộ 4 giá của hàng mẹ dùng làm gốc nhân ra giá combo — tính lại từ giá vốn, không đọc field cũ. */
const giaGocCuaMe = (cha: SanPham) => tinhGiaGocCombo(cha.giaVon, cha.tyLeLoiNhuan);

/**
 * Sinh 3 sản phẩm con combo (gộp 1/2/5 cái) từ 1 sản phẩm mẹ — mã SKU = mã mẹ + "-1"/"-2"/"-5".
 * Cả 4 giá của combo = giá tương ứng của mẹ × hệ số riêng của mẹ (xem tinhGiaCombo) — luôn tự tính
 * lại mỗi khi mẹ đổi giá hoặc đổi hệ số (không sửa tay được, giống soLuong).
 */
const taoSanPhamConCombo = (cha: SanPham): SanPham[] => {
  const ngay = new Date().toISOString();
  const goc = giaGocCuaMe(cha);
  return SO_LUONG_COMBO_MAC_DINH.map((soLuongCombo) => {
    const { giaVon, gia, giaBanLe, giaKhuyenMai } = tinhGiaCombo(goc, soLuongCombo, cha.heSoCombo);
    return {
      id: taoId(),
      maQR: taoMaComboSku(cha.maQR, soLuongCombo),
      ten: `${cha.ten} - Combo ${soLuongCombo}`,
      danhMuc: cha.danhMuc,
      giaVon,
      tyLeLoiNhuan: cha.tyLeLoiNhuan,
      gia,
      giaBanLe,
      giaKhuyenMai,
      soLuong: 0,
      donVi: cha.donVi,
      nguongCanhBao: 0,
      nhaCungCap: cha.nhaCungCap,
      ghiChu: `Combo ${soLuongCombo} "${cha.ten}" — tự sinh từ sản phẩm mẹ ${cha.maQR}.`,
      thongTinRieng: {},
      anhDaiDien: cha.anhDaiDien,
      anh: [],
      tepIn: [],
      lichSu: [taoLichSu(`Tự sinh combo ${soLuongCombo} từ sản phẩm mẹ "${cha.ten}".`)],
      ngayTao: ngay,
      ngayCapNhat: ngay,
      parentId: cha.id,
      soLuongCombo,
      heSoCombo: HE_SO_COMBO_MAC_DINH, // combo con không dùng — hệ số chỉ có ý nghĩa ở hàng mẹ
    };
  });
};

const uocLuongDungLuong = (dataUrl: string) => Math.round(((dataUrl.length - dataUrl.indexOf(',') - 1) * 3) / 4);

const dinhDangDungLuong = (byte: number) => {
  if (byte < 1024) return `${byte} B`;
  if (byte < 1024 * 1024) return `${Math.round(byte / 1024)} KB`;
  return `${(byte / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * Đọc ảnh và thu nhỏ về cạnh dài tối đa CANH_ANH_TOI_DA.
 * Toàn bộ dữ liệu cửa hàng (kèm ảnh base64) được PUT lên server sau mỗi thay đổi,
 * nên ảnh gốc từ điện thoại (5-8MB) sẽ làm treo phần đồng bộ nếu không nén.
 */
const docAnh = (file: File) =>
  new Promise<AnhSanPham>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const duLieuGoc = String(reader.result);
      const dungNguyenBan = (): AnhSanPham => ({
        id: taoIdNgauNhien(),
        ten: file.name,
        duLieu: duLieuGoc,
        loai: file.type || 'application/octet-stream',
        dungLuong: file.size,
      });

      const anh = document.createElement('img');
      anh.onerror = () => resolve(dungNguyenBan());
      anh.onload = () => {
        const tyLe = Math.min(1, CANH_ANH_TOI_DA / Math.max(anh.width, anh.height));
        if (tyLe === 1 && file.size <= 400_000) {
          resolve(dungNguyenBan());
          return;
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(anh.width * tyLe));
        canvas.height = Math.max(1, Math.round(anh.height * tyLe));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dungNguyenBan());
          return;
        }

        ctx.drawImage(anh, 0, 0, canvas.width, canvas.height);
        const duLieuNen = canvas.toDataURL('image/jpeg', 0.82);
        const dungBanNen = duLieuNen.length < duLieuGoc.length;
        resolve({
          id: taoIdNgauNhien(),
          ten: file.name,
          duLieu: dungBanNen ? duLieuNen : duLieuGoc,
          loai: dungBanNen ? 'image/jpeg' : file.type || 'application/octet-stream',
          dungLuong: dungBanNen ? uocLuongDungLuong(duLieuNen) : file.size,
        });
      };
      anh.src = duLieuGoc;
    };
    reader.readAsDataURL(file);
  });

/** Đọc file in nguyên bản (không nén — không áp dụng được cho PDF/STL/3MF/gcode như ảnh). */
const docTepIn = (file: File) =>
  new Promise<TepIn>((resolve, reject) => {
    if (file.size > DUNG_LUONG_TEP_IN_TOI_DA) {
      reject(new Error(`Tệp "${file.name}" vượt quá ${dinhDangDungLuong(DUNG_LUONG_TEP_IN_TOI_DA)} cho phép.`));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      resolve({
        id: taoIdNgauNhien(),
        ten: file.name,
        duLieu: String(reader.result),
        loai: file.type || 'application/octet-stream',
        dungLuong: file.size,
      });
    };
    reader.readAsDataURL(file);
  });

/** PDF và ảnh mở được thẳng trên trình duyệt (có nút in sẵn) — các định dạng in 3D (STL/3MF/gcode...) chỉ tải về. */
const inDuocTrenTrinhDuyet = (loai: string) => loai === 'application/pdf' || loai.startsWith('image/');

const moHoacTaiTepIn = (tep: TepIn) => {
  if (inDuocTrenTrinhDuyet(tep.loai)) {
    window.open(tep.duLieu, '_blank');
  } else {
    taiTep(tep.ten, tep.duLieu);
  }
};

const taiTep = (tenTep: string, duLieu: string) => {
  const link = document.createElement('a');
  link.href = duLieu;
  link.download = tenTep;
  link.click();
};

const taiJson = (tenTep: string, duLieu: unknown) => {
  const blob = new Blob([JSON.stringify(duLieu, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  taiTep(tenTep, url);
  URL.revokeObjectURL(url);
};

const notify = (message: string, type: 'success' | 'error' | 'info' = 'error') => {
  window.dispatchEvent(new CustomEvent('appToast', { detail: { message, type } }));
};

const hoiXacNhan = (title: string, message: string, onConfirm: () => void) => {
  window.dispatchEvent(new CustomEvent('appConfirm', { detail: { title, message, onConfirm } }));
};

const SO_COT_CHI_TIET = 4;
const KEY_DO_RONG_COT = 'quan-ly-cua-hang-do-rong-cot-chi-tiet-v1';
/** Từ breakpoint 2xl trở lên mới xếp các cột chi tiết nằm ngang — và chỉ khi đó mới kéo đổi độ rộng được. */
const MAN_HINH_KEO_DUOC = '(min-width: 1536px)';
/** Không cho kéo một cột hẹp quá mức này (đơn vị flex-grow, mặc định mỗi cột là 1). */
const TY_LE_COT_TOI_THIEU = 0.35;

/** Độ rộng cột người dùng đã kéo lần trước (đọc ngay lúc khởi tạo state để không phải render lại). */
const docTyLeCotDaLuu = (soCot: number): number[] => {
  const macDinh = Array(soCot).fill(1) as number[];
  if (typeof window === 'undefined') return macDinh;
  try {
    const daLuu = window.localStorage.getItem(KEY_DO_RONG_COT);
    if (!daLuu) return macDinh;
    const giaTri = JSON.parse(daLuu) as unknown;
    const hopLe =
      Array.isArray(giaTri) && giaTri.length === soCot && giaTri.every((v) => typeof v === 'number' && Number.isFinite(v) && v > 0);
    return hopLe ? (giaTri as number[]) : macDinh;
  } catch {
    return macDinh; // localStorage hỏng/bị chặn → dùng độ rộng mặc định
  }
};

/**
 * Quản lý độ rộng các cột chi tiết: tỷ lệ flex-grow của từng cột, kéo vạch giữa hai cột để đổi
 * (lấy của cột này bù cho cột kia nên tổng độ rộng không đổi), nhớ lại trong localStorage.
 */
function useDoRongCot(soCot: number) {
  const [tyLeCot, setTyLeCot] = useState<number[]>(() => docTyLeCotDaLuu(soCot));
  const [keoDuoc, setKeoDuoc] = useState(false);
  const khungCotRef = useRef<HTMLDivElement | null>(null);

  // Cần biết ở JS (không chỉ lớp responsive) vì hai bố cục khác hẳn nhau: hàng ngang kéo được / lưới xếp chồng.
  useEffect(() => {
    const mql = window.matchMedia(MAN_HINH_KEO_DUOC);
    const capNhat = () => setKeoDuoc(mql.matches);
    capNhat();
    mql.addEventListener('change', capNhat);
    return () => mql.removeEventListener('change', capNhat);
  }, []);

  const luuTyLe = useCallback((giaTri: number[]) => {
    setTyLeCot(giaTri);
    try {
      window.localStorage.setItem(KEY_DO_RONG_COT, JSON.stringify(giaTri));
    } catch {
      // không lưu được thì thôi, độ rộng vẫn đúng trong phiên này
    }
  }, []);

  const datLaiDoRongCot = useCallback(() => luuTyLe(Array(soCot).fill(1) as number[]), [luuTyLe, soCot]);

  const batDauKeoCot = useCallback(
    (viTri: number, event: React.PointerEvent<HTMLDivElement>) => {
      const khung = khungCotRef.current;
      if (!khung) return;
      event.preventDefault();

      const xBatDau = event.clientX;
      const tyLeBatDau = [...tyLeCot];
      const tongTyLe = tyLeBatDau.reduce((tong, item) => tong + item, 0);
      // Quy đổi quãng chuột kéo (px) sang đơn vị flex-grow.
      const pxMoiDonVi = khung.getBoundingClientRect().width / tongTyLe;
      let ketQua = tyLeBatDau;

      const dangKeo = (e: PointerEvent) => {
        const lech = (e.clientX - xBatDau) / pxMoiDonVi;
        const lechChan = Math.max(
          -(tyLeBatDau[viTri] - TY_LE_COT_TOI_THIEU),
          Math.min(tyLeBatDau[viTri + 1] - TY_LE_COT_TOI_THIEU, lech),
        );
        ketQua = tyLeBatDau.map((giaTri, i) => (i === viTri ? giaTri + lechChan : i === viTri + 1 ? giaTri - lechChan : giaTri));
        setTyLeCot(ketQua);
      };

      const ketThuc = () => {
        window.removeEventListener('pointermove', dangKeo);
        window.removeEventListener('pointerup', ketThuc);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        luuTyLe(ketQua);
      };

      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
      window.addEventListener('pointermove', dangKeo);
      window.addEventListener('pointerup', ketThuc);
    },
    [luuTyLe, tyLeCot],
  );

  return { tyLeCot, batDauKeoCot, datLaiDoRongCot, keoDuoc, khungCotRef };
}

export default function StoreManagementTab() {
  // Trang này là nơi duy nhất nhân viên vào được, nên header phải tự lo chỗ đăng xuất.
  const nguoiDungHienTai = useNguoiDungHienTai();

  const [sanPham, setSanPham] = useState<SanPham[]>([]);
  const [truongRieng, setTruongRieng] = useState<TruongRieng[]>(truongMacDinh);
  const [daTaiDuLieu, setDaTaiDuLieu] = useState(false);

  const [tuKhoa, setTuKhoa] = useState('');
  const [locDanhMuc, setLocDanhMuc] = useState('Tất cả');
  const [chiSapHet, setChiSapHet] = useState(false);
  const [sapXep, setSapXep] = useState<KieuSapXep>('moiNhat');

  // Chỉ lưu id: dữ liệu chi tiết luôn được suy ra từ danh sách nên không bao giờ lệch.
  const [idDangChon, setIdDangChon] = useState<string | null>(null);
  const [qrDaTao, setQrDaTao] = useState<{ ma: string; url: string } | null>(null);
  const [soLuongCapNhat, setSoLuongCapNhat] = useState('');

  const [maQuet, setMaQuet] = useState('');
  const [thongBaoQuet, setThongBaoQuet] = useState('Đang lắng nghe máy quét HID — quét mã để mở nhanh hàng hóa.');
  const [trangThaiQuet, setTrangThaiQuet] = useState<TrangThaiQuet>('cho');

  const [modalDangMo, setModalDangMo] = useState<'tao' | 'sua' | 'cot' | 'tinhGiaVon' | null>(null);
  const [anhPhongTo, setAnhPhongTo] = useState<AnhSanPham | null>(null);
  const [dangTaiAnhChoId, setDangTaiAnhChoId] = useState<string | null>(null);
  const [dangTaiTepInChoId, setDangTaiTepInChoId] = useState<string | null>(null);
  const [dangThemAnhChoId, setDangThemAnhChoId] = useState<string | null>(null);
  const [dangThemTepInChoId, setDangThemTepInChoId] = useState<string | null>(null);

  // Số dòng đang được dựng ra trong bảng — tăng dần theo cuộn (xem hangDaDung / mocTaiThemRef).
  const [soHangHienThi, setSoHangHienThi] = useState(SO_HANG_MOI_LAN);

  const tepNhapRef = useRef<HTMLInputElement | null>(null);
  const khungChiTietRef = useRef<HTMLDivElement | null>(null);
  const khungCuonBangRef = useRef<HTMLDivElement | null>(null);
  const mocTaiThemRef = useRef<HTMLDivElement | null>(null);
  const boDemQuet = useRef('');
  const thoiGianPhim = useRef<number>(0);

  // Cache ảnh gốc đã tải đầy đủ theo id hàng hóa — nguồn xác định "hàng hóa này đã có ảnh thật hay chưa"
  // dùng cả khi hiển thị lẫn khi tạo payload đồng bộ lên server (tránh gửi lại placeholder rỗng đè lên ảnh thật).
  const anhDayDuTheoId = useRef<Map<string, AnhSanPham[]>>(new Map());
  const anhDangTaiTheoId = useRef<Map<string, Promise<AnhSanPham[]>>>(new Map());
  // Y hệt cơ chế trên nhưng cho file in (gcode/3mf... có thể vài chục MB) — không thể gửi kèm mọi lần đồng bộ.
  const tepInDayDuTheoId = useRef<Map<string, TepIn[]>>(new Map());
  const tepInDangTaiTheoId = useRef<Map<string, Promise<TepIn[]>>>(new Map());
  // Id hàng hóa có ảnh/file in vừa THAY ĐỔI (thêm, sửa, đổi ảnh đại diện, nhập dữ liệu) — chỉ những
  // hàng hóa này mới đính kèm dữ liệu gốc trong lần đồng bộ tới; xem thêm ở effect đồng bộ bên dưới.
  const anhCanDongBo = useRef<Set<string>>(new Set());
  const tepInCanDongBo = useRef<Set<string>>(new Set());
  // Lần setSanPham/setTruongRieng đầu tiên là do vừa TẢI XONG từ server, không phải người dùng sửa gì —
  // đồng bộ ngược lại sẽ ghi đè toàn bộ bảng bằng đúng dữ liệu vừa đọc. Bỏ qua đúng lần đó.
  // (Không bỏ qua khi migrate từ localStorage — lúc đó dữ liệu thật sự cần được đẩy lên.)
  const boQuaDongBoDauTien = useRef(false);

  /** Tải đầy đủ ảnh gốc của một hàng hóa (nếu chưa có) — dùng khi mở tab Ảnh, mở form Sửa, hoặc xuất dữ liệu. */
  const taiAnhDayDu = useCallback((id: string): Promise<AnhSanPham[]> => {
    const daCo = anhDayDuTheoId.current.get(id);
    if (daCo) return Promise.resolve(daCo);

    const dangChay = anhDangTaiTheoId.current.get(id);
    if (dangChay) return dangChay;

    const promise = (async () => {
      setDangTaiAnhChoId(id);
      try {
        const res = await fetch(`/api/store-products/${id}/anh`);
        const data = await res.json();
        if (data.status !== 'success') throw new Error(data.message || 'Không tải được ảnh.');
        const anh = (data.data?.anh ?? []) as AnhSanPham[];
        anhDayDuTheoId.current.set(id, anh);
        setSanPham((hienTai) => hienTai.map((item) => (item.id === id ? { ...item, anh } : item)));
        return anh;
      } catch {
        notify('Không tải được ảnh đầy đủ của hàng hóa này.');
        return [];
      } finally {
        anhDangTaiTheoId.current.delete(id);
        setDangTaiAnhChoId((hienTai) => (hienTai === id ? null : hienTai));
      }
    })();
    anhDangTaiTheoId.current.set(id, promise);
    return promise;
  }, []);

  /** Tải đầy đủ file in của một hàng hóa (nếu chưa có) — dùng khi mở tab File in, mở form Sửa, in nhanh, hoặc xuất dữ liệu. */
  const taiTepInDayDu = useCallback((id: string): Promise<TepIn[]> => {
    const daCo = tepInDayDuTheoId.current.get(id);
    if (daCo) return Promise.resolve(daCo);

    const dangChay = tepInDangTaiTheoId.current.get(id);
    if (dangChay) return dangChay;

    const promise = (async () => {
      setDangTaiTepInChoId(id);
      try {
        const res = await fetch(`/api/store-products/${id}/tep-in`);
        const data = await res.json();
        if (data.status !== 'success') throw new Error(data.message || 'Không tải được file in.');
        const tepIn = (data.data?.tepIn ?? []) as TepIn[];
        tepInDayDuTheoId.current.set(id, tepIn);
        setSanPham((hienTai) => hienTai.map((item) => (item.id === id ? { ...item, tepIn } : item)));
        return tepIn;
      } catch {
        notify('Không tải được file in đầy đủ của hàng hóa này.');
        return [];
      } finally {
        tepInDangTaiTheoId.current.delete(id);
        setDangTaiTepInChoId((hienTai) => (hienTai === id ? null : hienTai));
      }
    })();
    tepInDangTaiTheoId.current.set(id, promise);
    return promise;
  }, []);

  /**
   * Bản để HIỂN THỊ — với sản phẩm con combo, `soLuong` tính lại "sống" từ tồn kho sản phẩm mẹ
   * (làm tròn xuống, xem tinhSoLuongCombo) thay vì đọc giá trị lưu trong state, để không bao giờ
   * lệch khi tồn kho mẹ thay đổi. Server cũng tự tính lại y hệt công thức này lúc đồng bộ.
   * CHỈ dùng để đọc/hiển thị — các hàm thay đổi dữ liệu vẫn thao tác trên `sanPham` gốc.
   */
  const sanPhamTinhToan = useMemo(() => {
    const chaTheoId = new Map(sanPham.filter((p) => !p.parentId).map((p) => [p.id, p]));
    return sanPham.map((item) => {
      if (!item.parentId || !item.soLuongCombo) return item;
      const cha = chaTheoId.get(item.parentId);
      if (!cha) return item;
      return { ...item, soLuong: tinhSoLuongCombo(cha.soLuong, item.soLuongCombo) };
    });
  }, [sanPham]);

  const sanPhamDangChon = useMemo(
    () => sanPhamTinhToan.find((item) => item.id === idDangChon) ?? null,
    [idDangChon, sanPhamTinhToan],
  );

  /** Combo con của hàng hóa đang chọn — lấy chính sản phẩm thật để giá hiển thị không lệch với danh sách. */
  const comboConDangChon = useMemo(
    () =>
      sanPhamDangChon && !sanPhamDangChon.parentId
        ? sanPhamTinhToan
            .filter((item) => item.parentId === sanPhamDangChon.id && item.soLuongCombo)
            .sort((a, b) => (a.soLuongCombo ?? 0) - (b.soLuongCombo ?? 0))
        : [],
    [sanPhamDangChon, sanPhamTinhToan],
  );

  // Tải dữ liệu từ server (thay cho localStorage cũ).
  // Nếu server trống mà localStorage còn dữ liệu bản cũ → tự động migrate lên DB.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/store-products');
        const data = await res.json();
        if (cancelled) return;
        if (data.status === 'success' && data.data) {
          let dsSanPham: SanPham[] = data.data.sanPham || [];
          let dsTruong: TruongRieng[] | null = data.data.truongRieng;
          boQuaDongBoDauTien.current = true;

          // Migrate 1 lần từ localStorage nếu server chưa có gì
          if (dsSanPham.length === 0 && dsTruong === null) {
            try {
              const sanPhamCu = window.localStorage.getItem(KEY_SAN_PHAM);
              const truongCu = window.localStorage.getItem(KEY_TRUONG_RIENG);
              if (sanPhamCu) dsSanPham = JSON.parse(sanPhamCu) as SanPham[];
              if (truongCu) dsTruong = JSON.parse(truongCu) as TruongRieng[];
              if (sanPhamCu || truongCu) {
                // Dữ liệu localStorage cũ đã có sẵn ảnh/file in đầy đủ (chưa từng qua cơ chế thumbnail/lazy-load).
                dsSanPham.forEach((item) => {
                  anhDayDuTheoId.current.set(item.id, item.anh ?? []);
                  tepInDayDuTheoId.current.set(item.id, item.tepIn ?? []);
                  anhCanDongBo.current.add(item.id);
                  tepInCanDongBo.current.add(item.id);
                });
                boQuaDongBoDauTien.current = false; // dữ liệu localStorage phải được đẩy lên server
                notify('Đã chuyển dữ liệu cửa hàng từ trình duyệt lên máy chủ.', 'info');
              }
            } catch {
              // localStorage hỏng → bỏ qua, bắt đầu với dữ liệu trống
            }
          }

          setSanPham(chuanHoaSanPham(dsSanPham));
          setTruongRieng(dsTruong !== null ? dsTruong : truongMacDinh);
        } else {
          notify(data.message || 'Không tải được dữ liệu cửa hàng từ server.');
        }
      } catch {
        if (!cancelled) notify('Lỗi kết nối server khi tải dữ liệu cửa hàng.');
      } finally {
        if (!cancelled) setDaTaiDuLieu(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Ghi ảnh HOẶC file in của MỘT hàng hóa qua route riêng của nó. Trả về false nếu chưa ghi được
   * (để nơi gọi đánh dấu lại, thử ở lần đồng bộ sau).
   *
   * Chặn trước theo dung lượng: Cloudflare/nginx trước app từ chối body quá lớn bằng trang 413 HTML
   * (không phải JSON), lúc đó `res.json()` sẽ ném lỗi khó hiểu — thà nói thẳng là tệp quá nặng.
   */
  const guiTepDinhKem = useCallback(async (id: string, loai: 'anh' | 'tep-in', danhSach: (AnhSanPham | TepIn)[]) => {
    const body = JSON.stringify(loai === 'anh' ? { anh: danhSach } : { tepIn: danhSach });
    const ten = loai === 'anh' ? 'ảnh' : 'file in';
    if (body.length > GIOI_HAN_BODY) {
      notify(
        `Tổng ${ten} của hàng hóa này là ${dinhDangDungLuong(body.length)} — vượt giới hạn ${dinhDangDungLuong(GIOI_HAN_BODY)} mỗi lần gửi. Xóa bớt tệp cũ rồi thử lại.`,
      );
      return false;
    }
    try {
      const res = await fetch(`/api/store-products/${id}/${loai}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if (!res.ok) {
        notify(
          res.status === 413
            ? `Máy chủ từ chối vì ${ten} quá nặng (${dinhDangDungLuong(body.length)}). Xóa bớt tệp cũ rồi thử lại.`
            : `Không lưu được ${ten} lên server (lỗi ${res.status}).`,
        );
        return false;
      }
      const data = await res.json();
      if (data.status !== 'success') {
        notify(data.message || `Không lưu được ${ten} lên server.`);
        return false;
      }
      return true;
    } catch {
      notify(`Mất kết nối server khi lưu ${ten}.`);
      return false;
    }
  }, []);

  // Đồng bộ (debounce 800ms) toàn bộ dữ liệu lên server mỗi khi có thay đổi
  const dongBoTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!daTaiDuLieu) return;
    if (boQuaDongBoDauTien.current) {
      boQuaDongBoDauTien.current = false;
      return;
    }
    if (dongBoTimer.current) window.clearTimeout(dongBoTimer.current);
    dongBoTimer.current = window.setTimeout(async () => {
      // KHÔNG BAO GIỜ đính kèm `anh`/`tepIn` vào request này. Body ở đây là CẢ cửa hàng, cõng thêm
      // base64 của một hàng là vượt giới hạn body của Cloudflare/nginx (~100 MB) → 413, client báo
      // lưu lỗi và F5 thì file vừa thêm biến mất. Ảnh/file in đi riêng từng hàng qua
      // PUT /api/store-products/[id]/anh và /tep-in (xem guiTepDinhKem).
      // Thiếu 2 trường này server giữ nguyên dữ liệu cũ (xem PUT /api/store-products).
      const anhDaGui = new Set(anhCanDongBo.current);
      const tepInDaGui = new Set(tepInCanDongBo.current);
      anhCanDongBo.current = new Set();
      tepInCanDongBo.current = new Set();

      const traLaiDanhDauKhiLoi = () => {
        anhDaGui.forEach((id) => anhCanDongBo.current.add(id));
        tepInDaGui.forEach((id) => tepInCanDongBo.current.add(id));
      };

      try {
        const sanPhamDeGui = sanPham.map((item) => {
          const ketQua: Record<string, unknown> = { ...item };
          delete ketQua.anh;
          delete ketQua.tepIn;
          return ketQua;
        });
        const res = await fetch('/api/store-products', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sanPham: sanPhamDeGui, truongRieng }),
        });
        const data = await res.json();
        if (data.status !== 'success') {
          traLaiDanhDauKhiLoi();
          notify(data.message || 'Không lưu được dữ liệu cửa hàng lên server.');
          return;
        }

        // Ghi ảnh/file in SAU khi hàng hóa chắc chắn đã có trong DB — hàng vừa tạo chỉ tồn tại sau
        // request ở trên, gửi tệp trước sẽ dính 404.
        for (const id of anhDaGui) {
          if (!(await guiTepDinhKem(id, 'anh', anhDayDuTheoId.current.get(id) ?? []))) {
            anhCanDongBo.current.add(id);
          }
        }
        for (const id of tepInDaGui) {
          if (!(await guiTepDinhKem(id, 'tep-in', tepInDayDuTheoId.current.get(id) ?? []))) {
            tepInCanDongBo.current.add(id);
          }
        }
      } catch {
        traLaiDanhDauKhiLoi();
        notify('Mất kết nối server — thay đổi cửa hàng chưa được lưu.');
      }
    }, 800);
    return () => {
      if (dongBoTimer.current) window.clearTimeout(dongBoTimer.current);
    };
  }, [daTaiDuLieu, sanPham, truongRieng, guiTepDinhKem]);

  const maQRDangChon = sanPhamDangChon?.maQR ?? '';
  useEffect(() => {
    if (!maQRDangChon) return;

    let cancelled = false;
    QRCode.toDataURL(maQRDangChon, {
      width: 320,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    }).then((url) => {
      if (!cancelled) setQrDaTao({ ma: maQRDangChon, url });
    });
    return () => {
      cancelled = true;
    };
  }, [maQRDangChon]);

  // Chỉ dùng ảnh QR khi nó thuộc đúng mã đang chọn — tránh hiện QR của hàng hóa trước đó.
  const qrDangChon = qrDaTao?.ma === maQRDangChon ? qrDaTao.url : '';

  const danhMuc = useMemo(() => {
    const tapHop = new Set(sanPham.map((item) => item.danhMuc).filter(Boolean));
    return ['Tất cả', ...Array.from(tapHop).sort((a, b) => a.localeCompare(b, 'vi'))];
  }, [sanPham]);

  // Chỉ tính trên sản phẩm mẹ — combo con dùng chung tồn kho vật lý với mẹ (số lượng chỉ là "gộp được
  // bao nhiêu combo"), cộng dồn cả combo vào đây sẽ đếm trùng cùng một lô hàng thật nhiều lần.
  const thongKe = useMemo(() => {
    const chiMe = sanPham.filter((item) => !item.parentId);
    const tongSoLuong = chiMe.reduce((tong, item) => tong + item.soLuong, 0);
    const tongGiaTri = chiMe.reduce((tong, item) => tong + item.soLuong * item.gia, 0);
    const sapHet = chiMe.filter((item) => item.soLuong <= item.nguongCanhBao).sort((a, b) => a.soLuong - b.soLuong);
    return { tongMatHang: chiMe.length, tongSoLuong, tongGiaTri, sapHet };
  }, [sanPham]);

  const sanPhamDaLoc = useMemo(() => {
    const tuKhoaChuan = tuKhoa.trim().toLowerCase();
    const ketQua = sanPhamTinhToan
      .filter((item) => (locDanhMuc === 'Tất cả' ? true : item.danhMuc === locDanhMuc))
      .filter((item) => (chiSapHet ? item.soLuong <= item.nguongCanhBao : true))
      .filter((item) => {
        if (!tuKhoaChuan) return true;
        const noiDung = [item.id, item.ten, item.danhMuc, item.nhaCungCap, item.ghiChu, ...Object.values(item.thongTinRieng)]
          .join(' ')
          .toLowerCase();
        return noiDung.includes(tuKhoaChuan);
      });

    return ketQua.sort((a, b) => {
      switch (sapXep) {
        case 'tenAZ':
          return a.ten.localeCompare(b.ten, 'vi');
        case 'tonItNhat':
          return a.soLuong - b.soLuong;
        case 'giaTriCao':
          return b.soLuong * b.gia - a.soLuong * a.gia;
        case 'thieuTepAnh': {
          const chenhLech = thuTuThieuTepAnh(a) - thuTuThieuTepAnh(b);
          return chenhLech !== 0 ? chenhLech : b.ngayCapNhat.localeCompare(a.ngayCapNhat);
        }
        default:
          return b.ngayCapNhat.localeCompare(a.ngayCapNhat);
      }
    });
  }, [chiSapHet, locDanhMuc, sanPhamTinhToan, sapXep, tuKhoa]);

  // Id sản phẩm mẹ người dùng đã BẤM MỞ để xem combo con. Lưu chiều "đã mở" (không phải "đã thu gọn")
  // để mặc định — kể cả sản phẩm mẹ mới tạo sau này — luôn là thu gọn, danh sách chỉ hiện hàng hóa gốc.
  const [comboDaMoRong, setComboDaMoRong] = useState<Set<string>>(new Set());
  const idChaCoCombo = useMemo(() => new Set(sanPham.filter((p) => p.parentId).map((p) => p.parentId as string)), [sanPham]);

  const daoThuGonCombo = useCallback((chaId: string) => {
    setComboDaMoRong((hienTai) => {
      const moi = new Set(hienTai);
      if (moi.has(chaId)) moi.delete(chaId);
      else moi.add(chaId);
      return moi;
    });
  }, []);

  const dangLoc = tuKhoa.trim() !== '' || locDanhMuc !== 'Tất cả' || chiSapHet;

  /**
   * Chèn sản phẩm con combo ngay dưới sản phẩm mẹ của nó (để hiển thị thụt vào 1 tab) thay vì để
   * lẫn lộn theo thứ tự sắp xếp chung. Con nào mồ côi (mẹ bị lọc mất) vẫn hiện bình thường ở gốc.
   * Mẹ thu gọn (mặc định) thì chỉ hiện dòng mẹ kèm số lượng combo đang ẩn.
   * Ngoại lệ: đang lọc/tìm kiếm thì mở hết — combo con đã lọt qua bộ lọc mà vẫn bị giấu dưới mẹ thì
   * người dùng tìm mã combo sẽ tưởng là không có kết quả.
   */
  const sanPhamHienThi = useMemo(() => {
    const idHienThi = new Set(sanPhamDaLoc.map((item) => item.id));
    const conTheoCha = new Map<string, SanPham[]>();
    for (const item of sanPhamDaLoc) {
      if (item.parentId && idHienThi.has(item.parentId)) {
        const ds = conTheoCha.get(item.parentId) ?? [];
        ds.push(item);
        conTheoCha.set(item.parentId, ds);
      }
    }

    const ketQua: Array<{ item: SanPham; laCombo: boolean; soComboAn: number }> = [];
    for (const item of sanPhamDaLoc) {
      if (item.parentId && idHienThi.has(item.parentId)) continue; // đã/sẽ được chèn ngay dưới mẹ
      const con = conTheoCha.get(item.id);
      const thuGon = con && con.length > 0 && !dangLoc && !comboDaMoRong.has(item.id);
      ketQua.push({ item, laCombo: false, soComboAn: thuGon ? con.length : 0 });
      if (con && !thuGon) {
        [...con]
          .sort((a, b) => (a.soLuongCombo ?? 0) - (b.soLuongCombo ?? 0))
          .forEach((item) => ketQua.push({ item, laCombo: true, soComboAn: 0 }));
      }
    }
    return ketQua;
  }, [sanPhamDaLoc, comboDaMoRong, dangLoc]);

  /**
   * Chỉ DỰNG ra SO_HANG_MOI_LAN dòng đầu tiên, cuộn tới đâu dựng thêm tới đó (xem mocTaiThemRef).
   * Bộ lọc/tìm kiếm/sắp xếp vẫn chạy trên TOÀN BỘ hàng hóa ở trên — phân mảnh chỉ ở khâu hiển thị,
   * nên tìm kiếm luôn ra đúng kết quả dù dòng đó chưa được dựng.
   */
  const hangDaDung = useMemo(() => sanPhamHienThi.slice(0, soHangHienThi), [sanPhamHienThi, soHangHienThi]);
  const conHangDeTai = soHangHienThi < sanPhamHienThi.length;

  // Đổi bộ lọc/sắp xếp → quay lại mẻ đầu tiên (nếu không, đang xem 90 dòng rồi lọc lại vẫn dựng 90 dòng).
  const datLaiPhanTrang = useCallback(() => setSoHangHienThi(SO_HANG_MOI_LAN), []);

  /** Bấm tiêu đề cột "Ảnh / File": bật kiểu sắp xếp "Thiếu file/ảnh", bấm lần nữa trả về kiểu đang dùng trước đó. */
  const sapXepTruocDo = useRef<KieuSapXep>('moiNhat');
  const daoSapXepThieuTepAnh = useCallback(() => {
    setSapXep((hienTai) => {
      if (hienTai === 'thieuTepAnh') return sapXepTruocDo.current;
      sapXepTruocDo.current = hienTai;
      return 'thieuTepAnh';
    });
    datLaiPhanTrang();
  }, [datLaiPhanTrang]);

  // Cuộn gần chạm đáy danh sách thì tự dựng thêm một mẻ nữa.
  useEffect(() => {
    const moc = mocTaiThemRef.current;
    if (!moc || !conHangDeTai) return;
    const theoDoi = new IntersectionObserver(
      (danhSach) => {
        if (danhSach.some((muc) => muc.isIntersecting)) setSoHangHienThi((hienTai) => hienTai + SO_HANG_MOI_LAN);
      },
      { root: khungCuonBangRef.current, rootMargin: '300px' },
    );
    theoDoi.observe(moc);
    return () => theoDoi.disconnect();
  }, [conHangDeTai, soHangHienThi]);

  // Sản phẩm mẹ cũ (từ trước khi có giá vốn) — còn giaVon = 0 nhưng đã có giá bán cũ > 0.
  const soLuongCanChuyenGia = useMemo(
    () => sanPham.filter((item) => !item.parentId && item.giaVon === 0 && item.gia > 0).length,
    [sanPham],
  );

  const chonSanPham = useCallback(
    (id: string, cuonToiChiTiet = false) => {
      setIdDangChon(id);
      setSoLuongCapNhat('');
      // Chi tiết giờ trải ngang (không còn tab) nên cột Ảnh hiện ngay khi chọn — phải nạp ảnh gốc luôn.
      // File in thì vẫn nạp lười lúc bấm mở vì có thể vài chục MB (cột File in chỉ cần metadata).
      void taiAnhDayDu(id);
      if (cuonToiChiTiet) {
        window.requestAnimationFrame(() => {
          khungChiTietRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
      }
    },
    [taiAnhDayDu],
  );

  /**
   * Thêm ảnh thẳng từ cột "Ảnh" (không phải mở modal Sửa).
   * Bắt buộc nạp xong ảnh gốc hiện có trước khi ghép thêm — danh sách chỉ giữ metadata (duLieu rỗng),
   * ghép vào đó rồi đồng bộ sẽ xóa sạch ảnh cũ trên server.
   */
  const themAnhTrucTiep = useCallback(
    async (id: string, tepDaChon: File[]) => {
      if (tepDaChon.length === 0) return;
      setDangThemAnhChoId(id);
      try {
        const anhHienCo = await taiAnhDayDu(id);
        const soAnhTheoDanhSach = sanPham.find((item) => item.id === id)?.anh.length ?? 0;
        if (anhHienCo.length < soAnhTheoDanhSach) {
          notify('Chưa tải xong ảnh gốc của hàng hóa này — thử lại sau ít giây.');
          return;
        }

        const anhMoi = await Promise.all(tepDaChon.map(docAnh));
        const tatCa = [...anhHienCo, ...anhMoi];
        anhDayDuTheoId.current.set(id, tatCa);
        anhCanDongBo.current.add(id);
        const ngay = new Date().toISOString();
        setSanPham((hienTai) =>
          hienTai.map((item) =>
            item.id === id
              ? { ...item, anh: tatCa, ngayCapNhat: ngay, lichSu: [taoLichSu(`Thêm ${anhMoi.length} ảnh.`), ...item.lichSu] }
              : item,
          ),
        );
        notify(`Đã thêm ${anhMoi.length} ảnh.`, 'success');
      } catch {
        notify('Không đọc được ảnh đã chọn.');
      } finally {
        setDangThemAnhChoId(null);
      }
    },
    [sanPham, taiAnhDayDu],
  );

  /** Thêm file in thẳng từ cột "File in" — cùng nguyên tắc nạp đủ dữ liệu gốc trước khi ghép như themAnhTrucTiep. */
  const themTepInTrucTiep = useCallback(
    async (id: string, tepDaChon: File[]) => {
      if (tepDaChon.length === 0) return;
      setDangThemTepInChoId(id);
      try {
        const hienCo = await taiTepInDayDu(id);
        const soTheoDanhSach = sanPham.find((item) => item.id === id)?.tepIn.length ?? 0;
        if (hienCo.length < soTheoDanhSach) {
          notify('Chưa tải xong file in của hàng hóa này — thử lại sau ít giây.');
          return;
        }

        const ketQua = await Promise.allSettled(tepDaChon.map(docTepIn));
        const tepMoi = ketQua.filter((r): r is PromiseFulfilledResult<TepIn> => r.status === 'fulfilled').map((r) => r.value);
        const loi = ketQua.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
        if (loi.length > 0) notify(loi.map((r) => (r.reason instanceof Error ? r.reason.message : 'Không đọc được file.')).join(' '));
        if (tepMoi.length === 0) return;

        const tatCa = [...hienCo, ...tepMoi];
        tepInDayDuTheoId.current.set(id, tatCa);
        tepInCanDongBo.current.add(id);
        const ngay = new Date().toISOString();
        setSanPham((hienTai) =>
          hienTai.map((item) =>
            item.id === id
              ? { ...item, tepIn: tatCa, ngayCapNhat: ngay, lichSu: [taoLichSu(`Thêm ${tepMoi.length} file in.`), ...item.lichSu] }
              : item,
          ),
        );
        notify(`Đã thêm ${tepMoi.length} file in.`, 'success');
      } finally {
        setDangThemTepInChoId(null);
      }
    },
    [sanPham, taiTepInDayDu],
  );

  /** Mở/tải 1 file in từ cột "File in" — danh sách chỉ có metadata nên phải nạp dữ liệu gốc trước. */
  const moTepInTheoId = useCallback(
    async (sanPhamId: string, tepId: string) => {
      const danhSach = await taiTepInDayDu(sanPhamId);
      const tep = danhSach.find((item) => item.id === tepId);
      if (!tep?.duLieu) {
        notify('Không tải được nội dung của file in này.');
        return;
      }
      moHoacTaiTepIn(tep);
    },
    [taiTepInDayDu],
  );

  /** Mở form sửa — phải đợi tải xong ảnh/file in gốc trước, nếu không form sẽ hiện rỗng và lưu đè mất dữ liệu thật. */
  const moModalSua = useCallback(
    async (id: string) => {
      chonSanPham(id);
      await Promise.all([taiAnhDayDu(id), taiTepInDayDu(id)]);
      setModalDangMo('sua');
    },
    [chonSanPham, taiAnhDayDu, taiTepInDayDu],
  );

  const timTheoMa = useCallback(
    (ma: string) => {
      const maChuan = ma.trim();
      if (!maChuan) return;
      const timThay = sanPham.find((item) => item.maQR === maChuan || item.id === maChuan);
      if (timThay) {
        chonSanPham(timThay.id, true);
        setThongBaoQuet(`Đã mở "${timThay.ten}" — tồn kho ${dinhDangSo.format(timThay.soLuong)} ${timThay.donVi}.`);
        setTrangThaiQuet('thanhCong');
        setMaQuet('');
      } else {
        setThongBaoQuet(`Không tìm thấy hàng hóa có mã: ${maChuan}`);
        setTrangThaiQuet('loi');
      }
    },
    [chonSanPham, sanPham],
  );

  // Máy quét HID gõ rất nhanh rồi Enter — gom phím trong 120ms để tách khỏi thao tác gõ tay.
  useEffect(() => {
    if (modalDangMo || anhPhongTo) return;

    const langNgheMayQuet = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const dangNhapLieu =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;

      if (dangNhapLieu && target?.getAttribute('data-scan-input') !== 'true') {
        return;
      }

      const hienTai = Date.now();
      if (hienTai - thoiGianPhim.current > 120) {
        boDemQuet.current = '';
      }
      thoiGianPhim.current = hienTai;

      if (event.key === 'Enter') {
        const ma = boDemQuet.current.trim();
        boDemQuet.current = '';
        if (ma.length >= 3) {
          event.preventDefault();
          timTheoMa(ma);
        }
        return;
      }

      if (event.key.length === 1) {
        boDemQuet.current += event.key;
      }
    };

    window.addEventListener('keydown', langNgheMayQuet);
    return () => window.removeEventListener('keydown', langNgheMayQuet);
  }, [anhPhongTo, modalDangMo, timTheoMa]);

  const xuLyNhapMaThuCong = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      timTheoMa(maQuet);
    }
  };

  const luuHangHoa = (ketQua: KetQuaBieuMau) => {
    const ngay = new Date().toISOString();
    const giaVon = Number(ketQua.giaVon) || 0;
    const tyLeLoiNhuan = chuanHoaTyLeLoiNhuan(ketQua.tyLeLoiNhuan);
    const { gia, giaBanLe, giaKhuyenMai } = tinhToanBoGia(giaVon, tyLeLoiNhuan);
    const soLuong = Math.max(0, Number(ketQua.soLuong) || 0);
    const nguongCanhBao = Math.max(0, Number(ketQua.nguongCanhBao) || 0);

    if (modalDangMo === 'sua' && sanPhamDangChon) {
      const cu = sanPhamDangChon;
      const thayDoi: string[] = [];
      if (cu.ten !== ketQua.ten.trim()) thayDoi.push('tên');
      if (cu.danhMuc !== (ketQua.danhMuc.trim() || 'Chưa phân loại')) thayDoi.push('danh mục');
      if (cu.giaVon !== giaVon) thayDoi.push('giá vốn');
      if (cu.tyLeLoiNhuan !== tyLeLoiNhuan) thayDoi.push(`% lợi nhuận (${cu.tyLeLoiNhuan}% → ${tyLeLoiNhuan}%)`);
      if (cu.donVi !== (ketQua.donVi.trim() || 'cái')) thayDoi.push('đơn vị');
      if (cu.nguongCanhBao !== nguongCanhBao) thayDoi.push('ngưỡng cảnh báo');
      if (cu.nhaCungCap !== ketQua.nhaCungCap.trim()) thayDoi.push('nhà cung cấp');
      if (cu.ghiChu !== ketQua.ghiChu.trim()) thayDoi.push('ghi chú');
      if (JSON.stringify(cu.thongTinRieng) !== JSON.stringify(ketQua.thongTinRieng)) thayDoi.push('thông tin mở rộng');
      // So theo danh sách id chứ không theo số lượng: xóa 1 ảnh rồi thêm 1 ảnh khác vẫn giữ nguyên
      // số lượng, so bằng length sẽ tưởng "không có gì đổi" và bỏ luôn thay đổi ảnh.
      const idNoiLai = (ds: Array<{ id: string }>) => ds.map((item) => item.id).join('|');
      if (idNoiLai(cu.anh) !== idNoiLai(ketQua.anh)) thayDoi.push('ảnh');
      if (idNoiLai(cu.tepIn) !== idNoiLai(ketQua.tepIn)) thayDoi.push('file in');

      const lichSuMoi: LichSuKho[] = [];
      if (cu.soLuong !== soLuong) {
        lichSuMoi.push(taoLichSu(`Sửa tồn kho: ${dinhDangSo.format(cu.soLuong)} → ${dinhDangSo.format(soLuong)}.`));
      }
      if (thayDoi.length > 0) {
        lichSuMoi.push(taoLichSu(`Cập nhật ${thayDoi.join(', ')}.`));
      }

      if (lichSuMoi.length === 0) {
        setModalDangMo(null);
        return;
      }

      setSanPham((hienTai) =>
        hienTai.map((item) => {
          if (item.id === cu.id) {
            return {
              ...item,
              ten: ketQua.ten.trim(),
              danhMuc: ketQua.danhMuc.trim() || 'Chưa phân loại',
              giaVon,
              tyLeLoiNhuan,
              gia,
              giaBanLe,
              giaKhuyenMai,
              soLuong,
              donVi: ketQua.donVi.trim() || 'cái',
              nguongCanhBao,
              nhaCungCap: ketQua.nhaCungCap.trim(),
              ghiChu: ketQua.ghiChu.trim(),
              thongTinRieng: ketQua.thongTinRieng,
              anh: ketQua.anh,
              tepIn: ketQua.tepIn,
              lichSu: [...lichSuMoi, ...item.lichSu],
              ngayCapNhat: ngay,
            };
          }
          // Mẹ vừa đổi giá vốn hoặc % lợi nhuận → tự cập nhật giá của các combo con theo công thức.
          if (
            item.parentId === cu.id &&
            item.soLuongCombo &&
            (cu.giaVon !== giaVon || cu.tyLeLoiNhuan !== tyLeLoiNhuan)
          ) {
            const giaCon = tinhGiaCombo(tinhGiaGocCombo(giaVon, tyLeLoiNhuan), item.soLuongCombo, cu.heSoCombo);
            return {
              ...item,
              ...giaCon,
              tyLeLoiNhuan,
              ngayCapNhat: ngay,
              lichSu: [
                taoLichSu(`Tự cập nhật theo sản phẩm mẹ: giá sàn ${dinhDangTien.format(giaCon.gia)}, giá KM ${dinhDangTien.format(giaCon.giaKhuyenMai)}.`),
                ...item.lichSu,
              ],
            };
          }
          return item;
        }),
      );
      anhDayDuTheoId.current.set(cu.id, ketQua.anh);
      tepInDayDuTheoId.current.set(cu.id, ketQua.tepIn);
      anhCanDongBo.current.add(cu.id);
      tepInCanDongBo.current.add(cu.id);
      setModalDangMo(null);
      notify('Đã cập nhật hàng hóa.', 'success');
      return;
    }

    const id = taoId();
    const sanPhamMoi: SanPham = {
      id,
      maQR: id,
      ten: ketQua.ten.trim(),
      danhMuc: ketQua.danhMuc.trim() || 'Chưa phân loại',
      giaVon,
      tyLeLoiNhuan,
      gia,
      giaBanLe,
      giaKhuyenMai,
      soLuong,
      donVi: ketQua.donVi.trim() || 'cái',
      nguongCanhBao,
      nhaCungCap: ketQua.nhaCungCap.trim(),
      ghiChu: ketQua.ghiChu.trim(),
      thongTinRieng: ketQua.thongTinRieng,
      anhDaiDien: null, // server tự tính lại từ anh[0] ở lần đồng bộ đầu tiên
      anh: ketQua.anh,
      tepIn: ketQua.tepIn,
      lichSu: [taoLichSu(`Tạo hàng hóa với số lượng ${dinhDangSo.format(soLuong)}.`)],
      ngayTao: ngay,
      ngayCapNhat: ngay,
      parentId: null,
      soLuongCombo: null,
      heSoCombo: HE_SO_COMBO_MAC_DINH,
    };

    // Tự sinh luôn 3 sản phẩm con combo (1/2/5 cái) — mã SKU = mã mẹ + "-1"/"-2"/"-5".
    const sanPhamConMoi = taoSanPhamConCombo(sanPhamMoi);

    anhDayDuTheoId.current.set(id, ketQua.anh);
    tepInDayDuTheoId.current.set(id, ketQua.tepIn);
    anhCanDongBo.current.add(id);
    tepInCanDongBo.current.add(id);
    setSanPham((hienTai) => [sanPhamMoi, ...sanPhamConMoi, ...hienTai]);
    setModalDangMo(null);
    chonSanPham(sanPhamMoi.id, true);
    setThongBaoQuet(`Đã tạo "${sanPhamMoi.ten}". Mã QR: ${sanPhamMoi.maQR}`);
    setTrangThaiQuet('thanhCong');
    notify(`Đã tạo hàng hóa, sinh mã QR và 3 sản phẩm combo (${sanPhamConMoi.map((c) => c.maQR).join(', ')}).`, 'success');
  };

  /** Sinh lại 3 sản phẩm con combo cho một sản phẩm mẹ đã tồn tại từ trước (chưa có combo). */
  const sinhSanPhamConCombo = useCallback(
    (cha: SanPham) => {
      const daCoCombo = sanPham.some((item) => item.parentId === cha.id);
      if (daCoCombo) {
        notify('Sản phẩm này đã có sản phẩm con combo rồi.', 'info');
        return;
      }
      const conMoi = taoSanPhamConCombo(cha);
      setSanPham((hienTai) => [...conMoi, ...hienTai]);
      notify(`Đã sinh 3 sản phẩm combo (${conMoi.map((c) => c.maQR).join(', ')}) cho "${cha.ten}".`, 'success');
    },
    [sanPham],
  );

  /**
   * Sửa MỘT trường của hàng hóa ngay trên panel chi tiết (không phải mở modal Sửa).
   * Gọi khi ô nhập rời focus / bấm Enter — mỗi lần sửa xong ghi đúng 1 dòng lịch sử, không phải mỗi
   * lần gõ phím. Đổi giá vốn / % lợi nhuận của hàng mẹ thì giá của chính nó và của 3 combo con đều
   * được tính lại luôn, giống hệt khi lưu từ modal.
   */
  const suaTruongHangHoa = useCallback((id: string, thayDoi: Partial<SanPham>, moTaLichSu: string) => {
    setSanPham((hienTai) => {
      const cu = hienTai.find((item) => item.id === id);
      if (!cu) return hienTai;

      const ngay = new Date().toISOString();
      const giaVon = thayDoi.giaVon ?? cu.giaVon;
      const tyLeLoiNhuan = thayDoi.tyLeLoiNhuan ?? cu.tyLeLoiNhuan;
      const doiGia = giaVon !== cu.giaVon || tyLeLoiNhuan !== cu.tyLeLoiNhuan;
      // Combo con lấy giá từ mẹ nên không bao giờ tự tính lại giá của chính nó ở đây.
      const giaMoi = doiGia && !cu.parentId ? tinhToanBoGia(giaVon, tyLeLoiNhuan) : null;

      return hienTai.map((item) => {
        if (item.id === id) {
          return {
            ...item,
            ...thayDoi,
            ...(giaMoi ?? {}),
            lichSu: [taoLichSu(moTaLichSu), ...item.lichSu],
            ngayCapNhat: ngay,
          };
        }
        if (!doiGia || cu.parentId || item.parentId !== id || !item.soLuongCombo) return item;
        const giaCon = tinhGiaCombo(tinhGiaGocCombo(giaVon, tyLeLoiNhuan), item.soLuongCombo, cu.heSoCombo);
        return {
          ...item,
          ...giaCon,
          tyLeLoiNhuan,
          ngayCapNhat: ngay,
          lichSu: [
            taoLichSu(`Tự cập nhật theo sản phẩm mẹ: giá sàn ${dinhDangTien.format(giaCon.gia)}, giá KM ${dinhDangTien.format(giaCon.giaKhuyenMai)}.`),
            ...item.lichSu,
          ],
        };
      });
    });
  }, []);

  /**
   * Đổi hệ số combo của MỘT sản phẩm mẹ (sửa ngay trên panel chi tiết) và tính lại giá 3 combo con
   * của chính nó. Chỉ đụng tới hàng mẹ đó — các hàng khác giữ nguyên hệ số riêng.
   */
  const doiHeSoCombo = useCallback((chaId: string, soLuongCombo: number, heSoMoi: number) => {
    setSanPham((hienTai) => {
      const cha = hienTai.find((item) => item.id === chaId);
      if (!cha || cha.parentId) return hienTai;
      const heSoCombo = chuanHoaHeSoCombo({ ...cha.heSoCombo, [soLuongCombo]: heSoMoi });
      const goc = tinhGiaGocCombo(cha.giaVon, cha.tyLeLoiNhuan);
      const ngay = new Date().toISOString();
      return hienTai.map((item) => {
        if (item.id === chaId) return { ...item, heSoCombo, ngayCapNhat: ngay };
        if (item.parentId !== chaId || !item.soLuongCombo) return item;
        const giaCon = tinhGiaCombo(goc, item.soLuongCombo, heSoCombo);
        // Chỉ combo vừa đổi hệ số mới cần ghi lịch sử — 2 combo kia giá không đổi.
        if (giaCon.gia === item.gia && giaCon.giaKhuyenMai === item.giaKhuyenMai && giaCon.giaVon === item.giaVon) {
          return item;
        }
        return {
          ...item,
          ...giaCon,
          ngayCapNhat: ngay,
          lichSu: [
            taoLichSu(
              `Đổi hệ số combo thành ${heSoCombo[item.soLuongCombo]}×: giá sàn ${dinhDangTien.format(giaCon.gia)}, giá KM ${dinhDangTien.format(giaCon.giaKhuyenMai)}.`,
            ),
            ...item.lichSu,
          ],
        };
      });
    });
  }, []);

  /**
   * Chuyển 1 LẦN cho dữ liệu cũ: giá bán hiện tại (từ trước khi có công thức giá vốn) → giá vốn = giá cũ / 2,
   * rồi tính lại gia/giaBanLe/giaKhuyenMai theo công thức mới. Chỉ áp dụng cho sản phẩm mẹ chưa có giá vốn.
   */
  const chuyenGiaCuThanhGiaVon = useCallback(() => {
    const canChuyen = sanPham.filter((item) => !item.parentId && item.giaVon === 0 && item.gia > 0);
    if (canChuyen.length === 0) {
      notify('Không có sản phẩm nào cần chuyển (đã có giá vốn hoặc chưa có giá bán).', 'info');
      return;
    }
    hoiXacNhan(
      'Chuyển giá cũ sang giá vốn',
      `Sẽ lấy giá bán hiện tại của ${canChuyen.length} sản phẩm, chia đôi làm giá vốn, rồi tính lại giá bán sàn/giá bán lẻ/giá khuyến mãi theo công thức mới. Chỉ chạy 1 lần cho các sản phẩm chưa có giá vốn.`,
      () => {
        const idCanChuyen = new Set(canChuyen.map((item) => item.id));
        const ngay = new Date().toISOString();
        setSanPham((hienTai) =>
          hienTai.map((item) => {
            if (!idCanChuyen.has(item.id)) return item;
            const giaVonMoi = Math.round(item.gia / 2);
            const { gia, giaBanLe, giaKhuyenMai } = tinhToanBoGia(giaVonMoi, item.tyLeLoiNhuan);
            return {
              ...item,
              giaVon: giaVonMoi,
              gia,
              giaBanLe,
              giaKhuyenMai,
              lichSu: [taoLichSu(`Chuyển giá cũ (${dinhDangTien.format(item.gia)}) → giá vốn ${dinhDangTien.format(giaVonMoi)}.`), ...item.lichSu],
              ngayCapNhat: ngay,
            };
          }),
        );
        notify(`Đã chuyển giá vốn cho ${canChuyen.length} sản phẩm.`, 'success');
      },
    );
  }, [sanPham]);

  const capNhatSoLuong = (kieu: 'cong' | 'tru' | 'dat') => {
    if (!sanPhamDangChon) return;
    if (sanPhamDangChon.parentId) {
      notify('Tồn kho combo tự tính từ sản phẩm mẹ — vào sản phẩm mẹ để nhập/xuất kho.', 'info');
      return;
    }

    const giaTri = Number(soLuongCapNhat);
    if (!soLuongCapNhat.trim() || !Number.isFinite(giaTri) || giaTri < 0) {
      notify('Nhập số lượng hợp lệ (số không âm).');
      return;
    }
    if (kieu !== 'dat' && giaTri === 0) {
      notify('Số lượng cần cập nhật phải lớn hơn 0.');
      return;
    }

    const cu = sanPhamDangChon;
    const soLuongMoi =
      kieu === 'cong' ? cu.soLuong + giaTri : kieu === 'tru' ? Math.max(0, cu.soLuong - giaTri) : Math.max(0, giaTri);

    if (kieu === 'tru' && giaTri > cu.soLuong) {
      notify(`Chỉ còn ${dinhDangSo.format(cu.soLuong)} ${cu.donVi} — đã trừ về 0.`, 'info');
    }

    const noiDung =
      kieu === 'cong'
        ? `Nhập thêm ${dinhDangSo.format(giaTri)}, tồn kho mới ${dinhDangSo.format(soLuongMoi)}.`
        : kieu === 'tru'
          ? `Xuất/bán ${dinhDangSo.format(giaTri)}, tồn kho mới ${dinhDangSo.format(soLuongMoi)}.`
          : `Đặt lại tồn kho thành ${dinhDangSo.format(soLuongMoi)}.`;

    setSanPham((hienTai) =>
      hienTai.map((item) =>
        item.id === cu.id
          ? { ...item, soLuong: soLuongMoi, ngayCapNhat: new Date().toISOString(), lichSu: [taoLichSu(noiDung), ...item.lichSu] }
          : item,
      ),
    );
    setSoLuongCapNhat('');
  };

  /** Đưa ảnh được chọn lên đầu mảng — cả bảng danh sách lẫn chi tiết đều dùng anh[0] làm ảnh đại diện. */
  const datAnhDaiDien = (anhId: string) => {
    if (!sanPhamDangChon) return;
    const cu = sanPhamDangChon;
    if (cu.anh[0]?.id === anhId) return;
    const anhChon = cu.anh.find((item) => item.id === anhId);
    if (!anhChon) return;

    const anhMoi = [anhChon, ...cu.anh.filter((a) => a.id !== anhId)];
    anhDayDuTheoId.current.set(cu.id, anhMoi);
    anhCanDongBo.current.add(cu.id);
    setSanPham((hienTai) =>
      hienTai.map((item) =>
        item.id === cu.id
          ? {
              ...item,
              anh: anhMoi,
              ngayCapNhat: new Date().toISOString(),
              lichSu: [taoLichSu(`Đặt "${anhChon.ten}" làm ảnh đại diện.`), ...item.lichSu],
            }
          : item,
      ),
    );
  };

  const xoaSanPham = (id: string) => {
    const item = sanPham.find((sp) => sp.id === id);
    if (!item) return;
    hoiXacNhan('Xóa hàng hóa', `Xóa hàng hóa "${item.ten}"? Toàn bộ ảnh và lịch sử kho của mặt hàng này sẽ mất.`, () => {
      anhDayDuTheoId.current.delete(id);
      setSanPham((hienTai) => hienTai.filter((sp) => sp.id !== id));
      setIdDangChon((hienTai) => (hienTai === id ? null : hienTai));
    });
  };

  const themTruongRieng = (ten: string) => {
    const tenChuan = ten.trim();
    if (!tenChuan) return;
    const id =
      tenChuan
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase() || taoIdNgauNhien();

    if (truongRieng.some((truong) => truong.id === id || truong.ten.toLowerCase() === tenChuan.toLowerCase())) {
      notify('Cột thông tin này đã tồn tại.');
      return;
    }
    setTruongRieng((hienTai) => [...hienTai, { id, ten: tenChuan }]);
  };

  const xoaTruongRieng = (id: string) => {
    const truong = truongRieng.find((item) => item.id === id);
    if (!truong) return;
    const soHangDung = sanPham.filter((item) => (item.thongTinRieng[id] || '').trim() !== '').length;
    const canhBao =
      soHangDung > 0
        ? `Xóa cột "${truong.ten}"? ${soHangDung} hàng hóa đang có dữ liệu ở cột này và sẽ bị xóa theo.`
        : `Xóa cột "${truong.ten}"?`;

    hoiXacNhan('Xóa cột thông tin', canhBao, () => {
      setTruongRieng((hienTai) => hienTai.filter((item) => item.id !== id));
      setSanPham((hienTai) =>
        hienTai.map((item) => {
          const thongTinRieng = { ...item.thongTinRieng };
          delete thongTinRieng[id];
          return { ...item, thongTinRieng };
        }),
      );
    });
  };

  const [dangXuatDuLieu, setDangXuatDuLieu] = useState(false);

  const [dangKiemTraMisa, setDangKiemTraMisa] = useState(false);
  const [ketQuaMisa, setKetQuaMisa] = useState<{ ok: boolean; message: string } | null>(null);

  /** Ping thử API MISA (chỉ đọc, dùng credential đã lưu ở tab Cài đặt) để biết Bearer token còn dùng được không. */
  const kiemTraKetNoiMisa = async () => {
    setDangKiemTraMisa(true);
    setKetQuaMisa(null);
    try {
      const res = await fetch('/api/misa/check-token', { method: 'POST' });
      const data = (await res.json()) as { status?: string; data?: { ok: boolean; message: string }; message?: string };
      if (data.status === 'success' && data.data) {
        setKetQuaMisa({ ok: data.data.ok, message: data.data.message });
        window.dispatchEvent(new CustomEvent('appToast', { detail: { message: data.data.message, type: data.data.ok ? 'success' : 'error' } }));
      } else {
        const message = data.message || 'Không kiểm tra được token.';
        setKetQuaMisa({ ok: false, message });
        window.dispatchEvent(new CustomEvent('appToast', { detail: { message, type: 'error' } }));
      }
    } catch {
      setKetQuaMisa({ ok: false, message: 'Lỗi kết nối máy chủ.' });
      window.dispatchEvent(new CustomEvent('appToast', { detail: { message: 'Lỗi kết nối máy chủ.', type: 'error' } }));
    } finally {
      setDangKiemTraMisa(false);
    }
  };

  const xuatDuLieu = async () => {
    setDangXuatDuLieu(true);
    try {
      // Đảm bảo tải đủ ảnh/file in gốc của MỌI hàng hóa trước khi xuất — export là bản sao lưu đầy đủ,
      // không thể chỉ chứa thumbnail/metadata như lúc hiển thị danh sách.
      const anhTheoId = new Map<string, AnhSanPham[]>();
      const tepInTheoId = new Map<string, TepIn[]>();
      await Promise.all(
        sanPham.map(async (item) => {
          const [anh, tepIn] = await Promise.all([taiAnhDayDu(item.id), taiTepInDayDu(item.id)]);
          anhTheoId.set(item.id, anh);
          tepInTheoId.set(item.id, tepIn);
        }),
      );
      const duLieuXuat = sanPham.map((item) => ({
        ...item,
        anh: anhTheoId.get(item.id) ?? item.anh,
        tepIn: tepInTheoId.get(item.id) ?? item.tepIn,
      }));

      taiJson(`du-lieu-cua-hang-${new Date().toISOString().slice(0, 10)}.json`, {
        sanPham: duLieuXuat,
        truongRieng,
        ngayXuat: new Date().toISOString(),
      });
      notify('Đã xuất dữ liệu cửa hàng.', 'success');
    } finally {
      setDangXuatDuLieu(false);
    }
  };

  const nhapDuLieu = async (event: ChangeEvent<HTMLInputElement>) => {
    const tep = event.target.files?.[0];
    event.target.value = '';
    if (!tep) return;

    let duLieu: { sanPham?: unknown; truongRieng?: unknown };
    try {
      duLieu = JSON.parse(await tep.text());
    } catch {
      notify('Không đọc được tệp — nội dung không phải JSON hợp lệ.');
      return;
    }

    if (!Array.isArray(duLieu.sanPham) || !Array.isArray(duLieu.truongRieng)) {
      notify('Tệp dữ liệu không đúng định dạng (cần sanPham[] và truongRieng[]).');
      return;
    }

    const dsSanPham = duLieu.sanPham as SanPham[];
    hoiXacNhan(
      'Nhập dữ liệu cửa hàng',
      `Thay thế toàn bộ ${dinhDangSo.format(sanPham.length)} hàng hóa hiện tại bằng ${dinhDangSo.format(dsSanPham.length)} hàng hóa trong tệp?`,
      () => {
        // File xuất luôn chứa ảnh/file in gốc đầy đủ — đánh dấu ngay để lần đồng bộ tiếp theo ghi lại đúng dữ liệu này.
        anhDayDuTheoId.current.clear();
        tepInDayDuTheoId.current.clear();
        dsSanPham.forEach((item) => {
          anhDayDuTheoId.current.set(item.id, item.anh ?? []);
          tepInDayDuTheoId.current.set(item.id, item.tepIn ?? []);
          anhCanDongBo.current.add(item.id);
          tepInCanDongBo.current.add(item.id);
        });
        setSanPham(chuanHoaSanPham(dsSanPham));
        setTruongRieng(duLieu.truongRieng as TruongRieng[]);
        setIdDangChon(null);
        notify('Đã nhập dữ liệu cửa hàng.', 'success');
      },
    );
  };

  // Đang chọn hàng hóa → thu gọn bảng chỉ còn cột tên, nhường toàn bộ phần còn lại cho khung chi tiết.
  const thuGonBang = sanPhamDangChon !== null;
  const soCotBang = thuGonBang ? 1 : 8 + Math.min(truongRieng.length, 2);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Thanh tiêu đề trang kiêm luôn 4 chỉ số tổng — gộp vào một hàng để chừa tối đa chiều cao cho
          danh sách và khung chi tiết (trang không cuộn được, mọi thứ phải nằm gọn trong 1 màn hình). */}
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-200 bg-white px-4 py-2.5 dark:border-slate-800 dark:bg-[#090d16]">
        {/* Nhân viên không có trang nào khác để quay về (middleware đẩy ngược lại đây), nên giấu nút. */}
        {nguoiDungHienTai?.vaiTro !== 'nhanVien' && (
          <Link
            href="/"
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            &larr; Quay lại
          </Link>
        )}
        <span className="flex size-8 items-center justify-center rounded-lg bg-indigo-600/10 text-indigo-500 dark:bg-indigo-500/15 dark:text-indigo-300">
          <Store className="size-4" />
        </span>
        <h1 className="text-base font-bold">Hàng hóa cửa hàng</h1>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <ThongKeNgan icon={<Package className="size-4" />} ten="Mặt hàng" giaTri={dinhDangSo.format(thongKe.tongMatHang)} />
          <ThongKeNgan icon={<Boxes className="size-4" />} ten="Tổng tồn kho" giaTri={dinhDangSo.format(thongKe.tongSoLuong)} />
          <ThongKeNgan icon={<ShoppingCart className="size-4" />} ten="Giá trị kho" giaTri={dinhDangTien.format(thongKe.tongGiaTri)} />
          <ThongKeNgan
            icon={<AlertTriangle className="size-4" />}
            ten="Sắp hết hàng"
            giaTri={dinhDangSo.format(thongKe.sapHet.length)}
            canhBao
            dangBat={chiSapHet}
            onClick={() => {
              setChiSapHet((value) => !value);
              datLaiPhanTrang();
            }}
            moTa={chiSapHet ? 'Đang lọc — bấm để bỏ lọc' : 'Bấm để chỉ xem hàng sắp hết'}
          />
          <TheNguoiDung thuGon huong="xuong" />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
      <section className={`${LOP_THE} shrink-0 p-4`}>
        <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600/10 text-indigo-500 dark:bg-indigo-500/15 dark:text-indigo-300">
              <ScanLine className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold">Quét mã hàng hóa</p>
              <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <span
                  className={`size-1.5 shrink-0 rounded-full ${
                    trangThaiQuet === 'thanhCong' ? 'bg-emerald-500' : trangThaiQuet === 'loi' ? 'bg-red-500' : 'bg-indigo-500 animate-pulse'
                  }`}
                />
                <span className="truncate">{thongBaoQuet}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 sm:flex-none">
              <QrCode className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                data-scan-input="true"
                value={maQuet}
                onChange={(event) => setMaQuet(event.target.value)}
                onKeyDown={xuLyNhapMaThuCong}
                className={`${LOP_NHAP} pl-9 sm:w-60`}
                placeholder="Quét hoặc nhập mã hàng"
              />
            </div>
            <button type="button" onClick={() => timTheoMa(maQuet)} className={LOP_NUT_PHU}>
              <Search className="size-4" />
              Tìm mã
            </button>

            <span className="mx-1 hidden h-6 w-px bg-slate-200 dark:bg-slate-800 sm:block" />

            <button
              type="button"
              onClick={kiemTraKetNoiMisa}
              disabled={dangKiemTraMisa}
              className={`${LOP_NUT_PHU} ${
                ketQuaMisa
                  ? ketQuaMisa.ok
                    ? 'border-emerald-300 text-emerald-600 dark:border-emerald-800 dark:text-emerald-400'
                    : 'border-red-300 text-red-600 dark:border-red-800 dark:text-red-400'
                  : ''
              }`}
              title={ketQuaMisa ? ketQuaMisa.message : 'Kiểm tra kết nối MISA eShop (ping thử API, không tạo dữ liệu)'}
            >
              {dangKiemTraMisa ? (
                <Loader2 className="size-4 animate-spin" />
              ) : ketQuaMisa ? (
                ketQuaMisa.ok ? <ShieldCheck className="size-4" /> : <XCircle className="size-4" />
              ) : (
                <ShieldCheck className="size-4" />
              )}
              Kiểm tra MISA
            </button>

            <span className="mx-1 hidden h-6 w-px bg-slate-200 dark:bg-slate-800 sm:block" />

            <button type="button" onClick={() => setModalDangMo('tao')} className={LOP_NUT_CHINH}>
              <PackagePlus className="size-4" />
              Thêm hàng hóa
            </button>
            <button type="button" onClick={() => setModalDangMo('cot')} className={LOP_NUT_PHU}>
              <Settings2 className="size-4" />
              Cột riêng
            </button>
            <button
              type="button"
              onClick={() => setModalDangMo('tinhGiaVon')}
              title="Bảng tính giá vốn tham khảo: tiền nhựa + tiền giờ máy chia cho số sản phẩm (không ghi vào hàng hóa)"
              className={LOP_NUT_PHU}
            >
              <Calculator className="size-4" />
              Tính giá vốn
            </button>
            {soLuongCanChuyenGia > 0 && (
              <button
                type="button"
                onClick={chuyenGiaCuThanhGiaVon}
                title="Chia đôi giá bán cũ thành giá vốn, rồi tính lại giá bán sàn/lẻ/khuyến mãi theo công thức mới"
                className={`${LOP_NUT_PHU} border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400`}
              >
                <RefreshCw className="size-4" />
                Chuyển {soLuongCanChuyenGia} giá cũ → giá vốn
              </button>
            )}
            {idChaCoCombo.size > 0 && !dangLoc && (
              <button
                type="button"
                onClick={() => setComboDaMoRong((hienTai) => (hienTai.size > 0 ? new Set() : new Set(idChaCoCombo)))}
                title={comboDaMoRong.size > 0 ? 'Thu gọn hết sản phẩm combo con' : 'Hiện đầy đủ sản phẩm combo con'}
                className={LOP_NUT_PHU}
              >
                {comboDaMoRong.size > 0 ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
                {comboDaMoRong.size > 0 ? 'Thu gọn combo' : 'Hiện đầy đủ combo'}
              </button>
            )}
            <button
              type="button"
              onClick={xuatDuLieu}
              disabled={dangXuatDuLieu}
              className={`${LOP_NUT_PHU} w-10 px-0`}
              title="Xuất dữ liệu ra tệp JSON (kèm tải lại toàn bộ ảnh gốc)"
              aria-label="Xuất dữ liệu"
            >
              {dangXuatDuLieu ? <RefreshCw className="size-4 animate-spin" /> : <FileDown className="size-4" />}
            </button>
            <button
              type="button"
              onClick={() => tepNhapRef.current?.click()}
              className={`${LOP_NUT_PHU} w-10 px-0`}
              title="Nhập dữ liệu từ tệp JSON"
              aria-label="Nhập dữ liệu"
            >
              <FileUp className="size-4" />
            </button>
            <input ref={tepNhapRef} type="file" accept="application/json" onChange={nhapDuLieu} className="hidden" />
          </div>
        </div>
      </section>

      <section
        className={`${LOP_AN_CUON} grid min-h-0 flex-1 gap-4 overflow-y-auto xl:overflow-hidden ${
          thuGonBang ? 'xl:grid-cols-[minmax(0,300px)_minmax(0,1fr)]' : 'xl:grid-cols-[minmax(0,1fr)_minmax(380px,420px)]'
        }`}
      >
        <div className={`${LOP_THE} flex min-h-[320px] flex-col overflow-hidden xl:h-full xl:min-h-0`}>
          <div
            className={`flex shrink-0 flex-col gap-3 border-b border-slate-200 p-4 dark:border-slate-800 ${
              thuGonBang ? '' : '2xl:flex-row 2xl:items-center 2xl:justify-between'
            }`}
          >
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold">Danh sách hàng hóa</h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {dinhDangSo.format(sanPhamDaLoc.length)}
                {dangLoc ? `/${dinhDangSo.format(sanPham.length)}` : ''}
              </span>
              {chiSapHet && (
                <button
                  type="button"
                  onClick={() => {
                    setChiSapHet(false);
                    datLaiPhanTrang();
                  }}
                  className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                >
                  Sắp hết hàng
                  <X className="size-3" />
                </button>
              )}
            </div>

            <div className={`flex flex-col gap-2 ${thuGonBang ? '' : 'sm:flex-row'}`}>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={tuKhoa}
                  onChange={(event) => {
                    setTuKhoa(event.target.value);
                    datLaiPhanTrang();
                  }}
                  className={`${LOP_NHAP} pl-9 ${thuGonBang ? '' : 'sm:w-56'}`}
                  placeholder="Tìm tên, mã, ghi chú..."
                />
              </div>
              {/* Bảng thu gọn chỉ còn ~300px — hai select bộ lọc sẽ chật nên ẩn đi, ô tìm kiếm là đủ. */}
              {!thuGonBang && (
                <>
                  <select
                    value={locDanhMuc}
                    onChange={(event) => {
                      setLocDanhMuc(event.target.value);
                      datLaiPhanTrang();
                    }}
                    className={`${LOP_NHAP} sm:w-40`}
                  >
                    {danhMuc.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                  <select
                    value={sapXep}
                    onChange={(event) => {
                      setSapXep(event.target.value as KieuSapXep);
                      datLaiPhanTrang();
                    }}
                    className={`${LOP_NHAP} sm:w-44`}
                  >
                    {luaChonSapXep.map((item) => (
                      <option key={item.giaTri} value={item.giaTri}>
                        {item.nhan}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>
          </div>

          <div ref={khungCuonBangRef} className={`${LOP_AN_CUON} min-h-0 flex-1 overflow-auto`}>
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 bg-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Hàng hóa</th>
                  {!thuGonBang && (
                    <>
                      <th className="px-4 py-3">Danh mục</th>
                      <th className="hidden px-4 py-3 text-right md:table-cell">Giá vốn</th>
                      <th className="px-4 py-3 text-right">Giá bán</th>
                      <th className="hidden px-4 py-3 text-right md:table-cell">Giá sau KM</th>
                      <th className="px-4 py-3 text-right">Tồn kho</th>
                      <th className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={daoSapXepThieuTepAnh}
                          title="Sắp xếp hàng hóa còn thiếu: chưa có file in → chưa có ảnh → chưa có cả hai"
                          className={`mx-auto inline-flex items-center gap-1 rounded px-1 py-0.5 text-xs font-semibold uppercase tracking-wide transition-colors hover:text-indigo-500 ${
                            sapXep === 'thieuTepAnh' ? 'text-indigo-500' : ''
                          }`}
                        >
                          Ảnh / File
                          <ArrowDownUp className={`size-3 ${sapXep === 'thieuTepAnh' ? '' : 'opacity-40'}`} />
                        </button>
                      </th>
                      {truongRieng.slice(0, 2).map((truong) => (
                        <th key={truong.id} className="hidden px-4 py-3 2xl:table-cell">
                          {truong.ten}
                        </th>
                      ))}
                      <th className="px-4 py-3 text-right">Thao tác</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {hangDaDung.map(({ item, laCombo, soComboAn }) => {
                  const dangChon = idDangChon === item.id;
                  const sapHet = item.soLuong <= item.nguongCanhBao;
                  const coComboRoi = !laCombo && sanPham.some((p) => p.parentId === item.id);
                  return (
                    <tr
                      key={item.id}
                      onClick={() => chonSanPham(item.id, true)}
                      className={`cursor-pointer transition-colors ${
                        dangChon
                          ? 'bg-indigo-50 dark:bg-indigo-500/10'
                          : sapHet
                            ? 'bg-amber-50/70 hover:bg-amber-100/70 dark:bg-amber-500/5 dark:hover:bg-amber-500/10'
                            : laCombo
                              ? 'bg-slate-50/60 dark:bg-slate-900/30'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-900/60'
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className={`flex items-center gap-3 ${laCombo ? 'pl-6' : ''}`}>
                          {laCombo && <CornerDownRight className="size-3.5 shrink-0 text-slate-400" />}
                          {/* Đang lọc thì combo con luôn hiện (xem sanPhamHienThi) — ẩn nút đi thay vì
                              để một nút bấm vào không thấy đổi gì. */}
                          {coComboRoi && !dangLoc && (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                daoThuGonCombo(item.id);
                              }}
                              title={soComboAn > 0 ? `Hiện ${soComboAn} combo con` : 'Thu gọn combo con'}
                              className="flex size-5 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                            >
                              {soComboAn > 0 ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                            </button>
                          )}
                          <span
                            className={`flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border ${
                              dangChon ? 'border-indigo-300 dark:border-indigo-500/40' : 'border-slate-200 dark:border-slate-700'
                            } bg-slate-100 dark:bg-slate-900`}
                          >
                            {item.anhDaiDien ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={item.anhDaiDien} alt={item.ten} className="size-full object-cover" />
                            ) : (
                              <Package className="size-4 text-slate-400" />
                            )}
                          </span>
                          <span className="min-w-0">
                            <span className="flex items-center gap-1.5">
                              <span
                                className={`block truncate font-semibold text-slate-900 dark:text-white ${
                                  thuGonBang ? 'max-w-[110px]' : 'max-w-[220px]'
                                }`}
                                title={item.ten}
                              >
                                {item.ten}
                              </span>
                              {laCombo && (
                                <span className="shrink-0 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
                                  Combo x{item.soLuongCombo}
                                </span>
                              )}
                              {soComboAn > 0 && (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    daoThuGonCombo(item.id);
                                  }}
                                  className="shrink-0 rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                                >
                                  +{soComboAn} combo ẩn
                                </button>
                              )}
                            </span>
                            <span className="block font-mono text-xs text-slate-500">{item.maQR}</span>
                          </span>
                        </div>
                      </td>
                      {!thuGonBang && (
                        <>
                      <td className="px-4 py-3">
                        <span className="inline-flex max-w-[150px] items-center gap-1.5 truncate rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          <Tag className="size-3 shrink-0" />
                          {item.danhMuc}
                        </span>
                      </td>
                      <td className="hidden px-4 py-3 text-right tabular-nums text-slate-500 dark:text-slate-400 md:table-cell">
                        {dinhDangTien.format(item.giaVon)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">{dinhDangTien.format(item.gia)}</td>
                      <td className="hidden px-4 py-3 text-right tabular-nums text-slate-500 dark:text-slate-400 md:table-cell">
                        {dinhDangTien.format(item.giaKhuyenMai)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={`inline-flex rounded-lg px-2 py-1 text-xs font-bold tabular-nums ${
                            item.soLuong === 0
                              ? 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300'
                              : sapHet
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
                                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                          }`}
                        >
                          {dinhDangSo.format(item.soLuong)} {item.donVi}
                        </span>
                      </td>
                      {/* Số ảnh / số file in — danh sách luôn có sẵn metadata (duLieu rỗng) nên đếm được
                          mà không cần tải dữ liệu gốc. */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1.5">
                          <DemTepDinhKem icon={<ImageIcon className="size-3" />} soLuong={item.anh.length} nhan="ảnh" />
                          <DemTepDinhKem icon={<FileText className="size-3" />} soLuong={item.tepIn.length} nhan="file" />
                        </div>
                      </td>
                      {truongRieng.slice(0, 2).map((truong) => (
                        <td key={truong.id} className="hidden max-w-40 truncate px-4 py-3 text-slate-500 dark:text-slate-400 2xl:table-cell">
                          {item.thongTinRieng[truong.id] || '—'}
                        </td>
                      ))}
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          {!laCombo && !coComboRoi && (
                            <NutBieuTuong
                              nhan="Sinh 3 sản phẩm combo (x1/x2/x5)"
                              icon={<Boxes className="size-4" />}
                              onClick={(event) => {
                                event.stopPropagation();
                                sinhSanPhamConCombo(item);
                              }}
                            />
                          )}
                          <NutBieuTuong
                            nhan="Sửa hàng hóa"
                            icon={<Pencil className="size-4" />}
                            onClick={(event) => {
                              event.stopPropagation();
                              void moModalSua(item.id);
                            }}
                          />
                          <NutBieuTuong
                            nhan="Xóa hàng hóa"
                            nguyHiem
                            icon={<Trash2 className="size-4" />}
                            onClick={(event) => {
                              event.stopPropagation();
                              xoaSanPham(item.id);
                            }}
                          />
                        </div>
                      </td>
                        </>
                      )}
                    </tr>
                  );
                })}

                {sanPhamHienThi.length === 0 && (
                  <tr>
                    <td colSpan={soCotBang}>
                      <div className="flex min-h-64 flex-col items-center justify-center gap-3 p-8 text-center">
                        <span className="flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
                          <Package className="size-6" />
                        </span>
                        <p className="text-sm font-semibold text-slate-500">
                          {sanPham.length === 0 ? 'Chưa có hàng hóa nào trong cửa hàng.' : 'Không có hàng hóa khớp bộ lọc hiện tại.'}
                        </p>
                        {sanPham.length === 0 ? (
                          <button type="button" onClick={() => setModalDangMo('tao')} className={LOP_NUT_CHINH}>
                            <PackagePlus className="size-4" />
                            Thêm hàng hóa đầu tiên
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setTuKhoa('');
                              setLocDanhMuc('Tất cả');
                              setChiSapHet(false);
                              datLaiPhanTrang();
                            }}
                            className={LOP_NUT_PHU}
                          >
                            <RefreshCw className="size-4" />
                            Xóa bộ lọc
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}

                {conHangDeTai && (
                  <tr>
                    <td colSpan={soCotBang}>
                      {/* Mốc tự tải thêm: cuộn tới gần đây (rootMargin 300px) là dựng thêm một mẻ.
                          Vẫn để bấm được, phòng trường hợp trình duyệt không chạy IntersectionObserver. */}
                      <div ref={mocTaiThemRef} className="p-3">
                        <button
                          type="button"
                          onClick={() => setSoHangHienThi((hienTai) => hienTai + SO_HANG_MOI_LAN)}
                          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 py-3 text-xs font-semibold text-slate-500 transition-colors hover:border-indigo-400 hover:text-indigo-500 dark:border-slate-700"
                        >
                          <Loader2 className="size-4 animate-spin" />
                          Đang tải thêm — {dinhDangSo.format(hangDaDung.length)}/{dinhDangSo.format(sanPhamHienThi.length)} dòng
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div ref={khungChiTietRef} className="flex min-h-0 flex-col gap-4 xl:h-full">
          {sanPhamDangChon ? (
            <ChiTietHangHoa
              sanPham={sanPhamDangChon}
              comboCon={comboConDangChon}
              truongRieng={truongRieng}
              qr={qrDangChon}
              dangTaiAnh={dangTaiAnhChoId === sanPhamDangChon.id}
              dangTaiTepIn={dangTaiTepInChoId === sanPhamDangChon.id}
              dangThemAnh={dangThemAnhChoId === sanPhamDangChon.id}
              dangThemTepIn={dangThemTepInChoId === sanPhamDangChon.id}
              onThemAnh={(tep) => void themAnhTrucTiep(sanPhamDangChon.id, tep)}
              onThemTepIn={(tep) => void themTepInTrucTiep(sanPhamDangChon.id, tep)}
              soLuongCapNhat={soLuongCapNhat}
              onDoiSoLuong={setSoLuongCapNhat}
              onCapNhatSoLuong={capNhatSoLuong}
              onSua={() => void moModalSua(sanPhamDangChon.id)}
              onXoa={() => xoaSanPham(sanPhamDangChon.id)}
              onDong={() => setIdDangChon(null)}
              onPhongToAnh={setAnhPhongTo}
              onDatAnhDaiDien={datAnhDaiDien}
              onMoTepIn={(tepId) => void moTepInTheoId(sanPhamDangChon.id, tepId)}
              onDoiHeSoCombo={(soLuongCombo, heSoMoi) => doiHeSoCombo(sanPhamDangChon.id, soLuongCombo, heSoMoi)}
              onSuaTruong={(thayDoi, tenTruong) =>
                suaTruongHangHoa(sanPhamDangChon.id, thayDoi, `Sửa ${tenTruong} tại chỗ.`)
              }
            />
          ) : (
            <>
              <div className={`${LOP_THE} flex min-h-64 shrink-0 flex-col items-center justify-center gap-3 p-8 text-center`}>
                <span className="flex size-12 items-center justify-center rounded-2xl bg-indigo-600/10 text-indigo-500 dark:bg-indigo-500/15 dark:text-indigo-300">
                  <QrCode className="size-6" />
                </span>
                <div>
                  <p className="text-sm font-bold">Chưa chọn hàng hóa</p>
                  <p className="mt-1 text-sm text-slate-500">Quét mã QR hoặc bấm một dòng trong danh sách để xem chi tiết, ảnh và cập nhật tồn kho.</p>
                </div>
              </div>

              <section className={`${LOP_THE} flex min-h-0 flex-col p-4`}>
                <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-4 text-amber-500" />
                <h2 className="text-sm font-bold">Cần nhập thêm</h2>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                  {dinhDangSo.format(thongKe.sapHet.length)}
                </span>
              </div>
              {thongKe.sapHet.length > 5 && (
                <button
                  type="button"
                  onClick={() => {
                    setChiSapHet(true);
                    datLaiPhanTrang();
                  }}
                  className="text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  Xem tất cả
                </button>
              )}
            </div>

                <div className={`${LOP_AN_CUON} min-h-0 flex-1 space-y-2 overflow-y-auto`}>
              {thongKe.sapHet.slice(0, 5).map((item) => (
                <div
                  key={item.id}
                  className="flex w-full items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 transition-colors hover:bg-amber-100 dark:border-amber-500/20 dark:bg-amber-500/10 dark:hover:bg-amber-500/15"
                >
                  <button type="button" onClick={() => chonSanPham(item.id)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">{item.ten}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">{item.danhMuc}</span>
                  </button>
                  <span className="shrink-0 rounded-lg bg-white px-2 py-1 text-xs font-bold tabular-nums text-amber-700 dark:bg-slate-900 dark:text-amber-300">
                    {dinhDangSo.format(item.soLuong)}/{dinhDangSo.format(item.nguongCanhBao)} {item.donVi}
                  </span>
                  <button
                    type="button"
                    title={item.tepIn.length > 0 ? `In ngay: ${item.tepIn[0].ten}` : 'Chưa có file in cho hàng hóa này'}
                    aria-label={item.tepIn.length > 0 ? `In ngay file của ${item.ten}` : 'Chưa có file in'}
                    disabled={item.tepIn.length === 0}
                    onClick={async () => {
                      // Danh sách chỉ có metadata (không có dữ liệu base64) — tải đầy đủ file trước khi mở/in.
                      const tepIn = await taiTepInDayDu(item.id);
                      if (!tepIn[0]) return;
                      moHoacTaiTepIn(tepIn[0]);
                      notify(`Đang mở file "${tepIn[0].ten}" của "${item.ten}" để in.`, 'info');
                    }}
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-amber-300 bg-white text-amber-700 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300 disabled:hover:bg-white dark:border-amber-500/30 dark:bg-slate-900 dark:text-amber-300 dark:disabled:border-slate-800 dark:disabled:text-slate-700"
                  >
                    <Printer className="size-4" />
                  </button>
                </div>
              ))}

              {thongKe.sapHet.length === 0 && (
                <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                  <CheckCircle2 className="size-4 shrink-0" />
                  Không có mặt hàng dưới ngưỡng cảnh báo.
                </div>
              )}
                </div>
              </section>
            </>
          )}
        </div>
      </section>
      </div>

      {(modalDangMo === 'tao' || modalDangMo === 'sua') && (
        <ModalHangHoa
          sanPhamGoc={modalDangMo === 'sua' ? sanPhamDangChon : null}
          chaCuaSanPhamGoc={sanPhamDangChon?.parentId ? (sanPham.find((p) => p.id === sanPhamDangChon.parentId) ?? null) : null}
          truongRieng={truongRieng}
          onDong={() => setModalDangMo(null)}
          onLuu={luuHangHoa}
        />
      )}

      {modalDangMo === 'cot' && (
        <ModalCotRieng
          truongRieng={truongRieng}
          sanPham={sanPham}
          onThem={themTruongRieng}
          onXoa={xoaTruongRieng}
          onDong={() => setModalDangMo(null)}
        />
      )}

      {modalDangMo === 'tinhGiaVon' && <ModalTinhGiaVon onDong={() => setModalDangMo(null)} />}

      {anhPhongTo && <XemAnh anh={anhPhongTo} onDong={() => setAnhPhongTo(null)} />}
    </div>
  );
}

/**
 * Khung chi tiết hàng hóa — không còn chia tab: 4 cột (Thông tin / Ảnh / File in / Mở rộng & Lịch sử)
 * trải ngang cạnh nhau, mỗi cột tự cuộn bên trong (thanh cuộn ẩn) để trang tổng không bao giờ phải cuộn.
 * Từ 2xl trở lên có thể kéo vạch giữa hai cột để đổi độ rộng (bấm đúp vạch = về mặc định).
 */
function ChiTietHangHoa({
  sanPham,
  comboCon,
  truongRieng,
  qr,
  dangTaiAnh,
  dangTaiTepIn,
  dangThemAnh,
  dangThemTepIn,
  onThemAnh,
  onThemTepIn,
  soLuongCapNhat,
  onDoiSoLuong,
  onCapNhatSoLuong,
  onSua,
  onXoa,
  onDong,
  onPhongToAnh,
  onDatAnhDaiDien,
  onMoTepIn,
  onDoiHeSoCombo,
  onSuaTruong,
}: {
  sanPham: SanPham;
  /** Combo con của hàng hóa này (rỗng nếu bản thân nó là combo, hoặc chưa sinh combo). */
  comboCon: SanPham[];
  /** Đổi hệ số của 1 combo (1/2/5) — giá 2 dòng của combo đó tính lại ngay. */
  onDoiHeSoCombo: (soLuongCombo: number, heSoMoi: number) => void;
  truongRieng: TruongRieng[];
  qr: string;
  /** true khi đang tải ảnh gốc đầy đủ của hàng hóa này (chưa có sẵn để hiển thị ở cột Ảnh). */
  dangTaiAnh: boolean;
  /** true khi đang tải file in đầy đủ của hàng hóa này (bấm mở file ở cột File in). */
  dangTaiTepIn: boolean;
  /** true khi đang nén/đọc ảnh vừa chọn thêm ngay tại cột Ảnh. */
  dangThemAnh: boolean;
  /** true khi đang đọc file in vừa chọn thêm ngay tại cột File in. */
  dangThemTepIn: boolean;
  onThemAnh: (tep: File[]) => void;
  onThemTepIn: (tep: File[]) => void;
  soLuongCapNhat: string;
  onDoiSoLuong: (value: string) => void;
  onCapNhatSoLuong: (kieu: 'cong' | 'tru' | 'dat') => void;
  onSua: () => void;
  onXoa: () => void;
  onDong: () => void;
  onPhongToAnh: (anh: AnhSanPham) => void;
  onDatAnhDaiDien: (anhId: string) => void;
  onMoTepIn: (tepId: string) => void;
  /** Sửa trực tiếp 1 trường trên panel (không mở modal) — xem suaTruongHangHoa. */
  onSuaTruong: (thayDoi: Partial<SanPham>, tenTruong: string) => void;
}) {
  const hetHang = sanPham.soLuong === 0;
  const sapHet = !hetHang && sanPham.soLuong <= sanPham.nguongCanhBao;
  const laCombo = !!sanPham.parentId;
  const { tyLeCot, batDauKeoCot, datLaiDoRongCot, keoDuoc, khungCotRef } = useDoRongCot(SO_COT_CHI_TIET);

  // Mỗi phần tử là MỘT CỘT, mỗi cột là danh sách thẻ. Cột nhiều hơn 1 thẻ thì tiêu đề thành tab
  // bấm qua lại (Ảnh / File in dùng chung một cột cho đỡ chật).
  const cotChiTiet: TheCot[][] = [
    [{
      ten: 'Thông tin',
      icon: <Package className="size-3.5" />,
      noiDung: (
        <div className="space-y-3">
          <div className={`flex items-center justify-between gap-3 ${LOP_NEN_PHU}`}>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tồn kho</p>
              <p className="text-2xl font-bold tabular-nums">
                {dinhDangSo.format(sanPham.soLuong)} <span className="text-base font-semibold text-slate-500">{sanPham.donVi}</span>
              </p>
            </div>
          </div>

          {laCombo ? (
            <div className="flex items-start gap-2 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300">
              <Boxes className="mt-0.5 size-3.5 shrink-0" />
              Tồn kho combo = tồn kho sản phẩm mẹ chia {sanPham.soLuongCombo} (làm tròn xuống) — luôn tự cập nhật. Vào sản phẩm mẹ để nhập/xuất kho.
            </div>
          ) : (
            <div className="space-y-2">
              <input
                value={soLuongCapNhat}
                onChange={(event) => onDoiSoLuong(event.target.value)}
                type="number"
                min={0}
                className={LOP_NHAP}
                placeholder={`Số lượng cần cập nhật (${sanPham.donVi})`}
              />
              <div className="grid grid-cols-3 gap-2">
                <button type="button" onClick={() => onCapNhatSoLuong('cong')} className={`${LOP_NUT_CHINH} px-2`}>
                  <Plus className="size-4" />
                  Nhập
                </button>
                <button
                  type="button"
                  onClick={() => onCapNhatSoLuong('tru')}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-amber-600 px-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700"
                >
                  <Minus className="size-4" />
                  Xuất
                </button>
                <button type="button" onClick={() => onCapNhatSoLuong('dat')} className={`${LOP_NUT_PHU} px-2`}>
                  <RefreshCw className="size-4" />
                  Đặt lại
                </button>
              </div>
            </div>
          )}

          {sanPham.soLuongCombo && (
            <div className="flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
              <Boxes className="size-3.5" />
              Sản phẩm combo — gộp {sanPham.soLuongCombo} cái
            </div>
          )}

          {/* Sửa TRỰC TIẾP tại đây — không cần mở modal. 3 giá bán là số tự tính từ giá vốn + % lợi
              nhuận nên để nguyên dạng chỉ đọc; combo con thì cả giá vốn/% lợi nhuận cũng khóa vì
              chúng lấy theo sản phẩm mẹ. */}
          <div className="grid grid-cols-2 gap-2">
            <OSua
              ten="Giá vốn"
              giaTri={String(sanPham.giaVon)}
              kieu="number"
              khoa={laCombo}
              moTa={laCombo ? 'Tự tính theo giá vốn của sản phẩm mẹ.' : '3 giá bán bên dưới tự tính từ đây.'}
              onLuu={(v) => onSuaTruong({ giaVon: Math.max(0, Number(v) || 0) }, 'giá vốn')}
            />
            <ThongTin ten="Giá bán sàn" giaTri={dinhDangTien.format(sanPham.gia)} moTa="Tự tính — không sửa tay." />
            <OSua
              ten="% lợi nhuận"
              giaTri={String(sanPham.tyLeLoiNhuan ?? TY_LE_LOI_NHUAN_MAC_DINH)}
              kieu="number"
              khoa={laCombo}
              moTa={laCombo ? 'Dùng chung % lợi nhuận với sản phẩm mẹ.' : `Giá bán lẻ = giá vốn + % này. Bỏ trống = ${TY_LE_LOI_NHUAN_MAC_DINH}%.`}
              onLuu={(v) => onSuaTruong({ tyLeLoiNhuan: chuanHoaTyLeLoiNhuan(v) }, '% lợi nhuận')}
            />
            <ThongTin ten="Giá bán lẻ" giaTri={dinhDangTien.format(sanPham.giaBanLe)} moTa="Tự tính — không sửa tay." />
            <ThongTin ten="Giá niêm yết KM 25%" giaTri={dinhDangTien.format(sanPham.giaKhuyenMai)} moTa="Tự tính — không sửa tay." />
            <ThongTin ten="Giá trị tồn" giaTri={dinhDangTien.format(sanPham.gia * sanPham.soLuong)} />
            <OSua
              ten="Danh mục"
              giaTri={sanPham.danhMuc}
              placeholder="Chưa phân loại"
              onLuu={(v) => onSuaTruong({ danhMuc: v.trim() || 'Chưa phân loại' }, 'danh mục')}
            />
            <OSua
              ten="Đơn vị"
              giaTri={sanPham.donVi}
              placeholder="cái"
              onLuu={(v) => onSuaTruong({ donVi: v.trim() || 'cái' }, 'đơn vị')}
            />
            <OSua
              ten="Ngưỡng cảnh báo"
              giaTri={String(sanPham.nguongCanhBao)}
              kieu="number"
              moTa="Tồn kho ≤ ngưỡng này sẽ vào danh sách cần nhập thêm."
              onLuu={(v) => onSuaTruong({ nguongCanhBao: Math.max(0, Number(v) || 0) }, 'ngưỡng cảnh báo')}
            />
            <OSua
              ten="Nhà cung cấp"
              giaTri={sanPham.nhaCungCap}
              placeholder="—"
              onLuu={(v) => onSuaTruong({ nhaCungCap: v.trim() }, 'nhà cung cấp')}
            />
          </div>

          <OSua
            ten="Ghi chú"
            giaTri={sanPham.ghiChu}
            nhieuDong
            placeholder="Thông tin nội bộ, quy cách đóng gói, lưu ý bán hàng..."
            onLuu={(v) => onSuaTruong({ ghiChu: v.trim() }, 'ghi chú')}
          />

        </div>
      ),
    }],
    [{
      ten: 'Ảnh',
      icon: <ImageIcon className="size-3.5" />,
      soLuong: sanPham.anh.length,
      noiDung: (
        <div className="space-y-3">
          {/* Thêm ảnh ngay tại đây, không phải mở modal Sửa. */}
          <NutChonTep
            nhan="Thêm ảnh"
            icon={<ImagePlus className="size-4" />}
            accept="image/*"
            dangXuLy={dangThemAnh}
            onChon={onThemAnh}
          />
          {dangTaiAnh ? (
        <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
          <RefreshCw className="size-6 animate-spin" />
          Đang tải ảnh gốc...
        </div>
      ) : sanPham.anh.length > 0 ? (
        <div className="grid grid-cols-2 gap-3">
          {sanPham.anh.map((anh, index) => (
            <div key={anh.id} className="group overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => anh.duLieu && onPhongToAnh(anh)}
                  className="relative block aspect-square w-full bg-slate-100 dark:bg-slate-900"
                >
                  {anh.duLieu ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={anh.duLieu} alt={anh.ten} className="size-full object-cover" />
                  ) : (
                    <span className="flex size-full items-center justify-center text-slate-400">
                      <ImageIcon className="size-6" />
                    </span>
                  )}
                  <span className="absolute inset-0 flex items-center justify-center bg-slate-950/50 text-white opacity-0 transition-opacity group-hover:opacity-100">
                    <ZoomIn className="size-6" />
                  </span>
                </button>
                {index === 0 ? (
                  <span className="pointer-events-none absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white shadow">
                    <Star className="size-3 fill-current" />
                    Đại diện
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onDatAnhDaiDien(anh.id)}
                    title="Đặt làm ảnh đại diện"
                    aria-label={`Đặt ${anh.ten} làm ảnh đại diện`}
                    className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-slate-950/70 px-2 py-0.5 text-[10px] font-semibold text-white opacity-0 transition-opacity hover:bg-indigo-600 group-hover:opacity-100"
                  >
                    <Star className="size-3" />
                    Đặt đại diện
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 p-2">
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold" title={anh.ten}>
                    {anh.ten}
                  </span>
                  <span className="text-xs text-slate-500">{dinhDangDungLuong(anh.dungLuong)}</span>
                </span>
                <NutBieuTuong nhan="Tải ảnh" icon={<Download className="size-4" />} onClick={() => taiTep(anh.ten, anh.duLieu)} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
          <ImageIcon className="size-6" />
          Hàng hóa này chưa có ảnh.
        </div>
      )}
        </div>
      ),
    },
    {
      ten: 'File in',
      icon: <Paperclip className="size-3.5" />,
      soLuong: sanPham.tepIn.length,
      noiDung: (
        <div className="space-y-3">
          <NutChonTep
            nhan="Thêm file in"
            icon={<Paperclip className="size-4" />}
            dangXuLy={dangThemTepIn}
            onChon={onThemTepIn}
          />
          {sanPham.tepIn.length > 0 ? (
          <div className="space-y-2">
            {sanPham.tepIn.map((tep) => (
              <div key={tep.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                    <FileText className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold" title={tep.ten}>
                      {tep.ten}
                    </span>
                    <span className="text-xs text-slate-500">{dinhDangDungLuong(tep.dungLuong)}</span>
                  </span>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  {/* File in nạp lười (có thể vài chục MB) — chỉ tải dữ liệu gốc khi thực sự bấm mở. */}
                  <NutBieuTuong
                    nhan={dangTaiTepIn ? 'Đang tải file...' : inDuocTrenTrinhDuyet(tep.loai) ? 'Mở để in' : 'Tải file'}
                    icon={
                      dangTaiTepIn ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : inDuocTrenTrinhDuyet(tep.loai) ? (
                        <Printer className="size-4" />
                      ) : (
                        <Download className="size-4" />
                      )
                    }
                    onClick={() => onMoTepIn(tep.id)}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
            <Paperclip className="size-6" />
            Hàng hóa này chưa có file in.
          </div>
          )}
        </div>
      ),
    }],
    [{
      // Tách hẳn ra một cột thay vì nhét cuối cột Thông tin: 3 dòng combo là bảng giá bán thật, cần
      // nhìn thấy ngay chứ không phải cuộn xuống mới thấy.
      ten: 'Giá set combo',
      icon: <Boxes className="size-3.5" />,
      soLuong: comboCon.length || undefined,
      noiDung:
        comboCon.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-xs text-slate-500 dark:text-slate-400">Hệ số nhân từ giá của hàng này</p>
              <button
                type="button"
                onClick={() => SO_LUONG_COMBO_MAC_DINH.forEach((n) => onDoiHeSoCombo(n, HE_SO_COMBO_MAC_DINH[n]))}
                className="shrink-0 text-[11px] font-semibold text-indigo-600 hover:underline dark:text-indigo-300"
              >
                Về mặc định
              </button>
            </div>
            <div className={`space-y-3 ${LOP_NEN_PHU}`}>
              {comboCon.map((combo) => (
                <ChinhHeSoCombo
                  key={combo.id}
                  maQR={combo.maQR}
                  soLuongCombo={combo.soLuongCombo ?? 1}
                  soLuong={combo.soLuong}
                  heSo={sanPham.heSoCombo[combo.soLuongCombo ?? 1] ?? 1}
                  gia={combo.gia}
                  giaKhuyenMai={combo.giaKhuyenMai}
                  onDoi={(heSoMoi) => onDoiHeSoCombo(combo.soLuongCombo ?? 1, heSoMoi)}
                />
              ))}
            </div>
            <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              Giá sàn combo = giá bán sàn của hàng này ({dinhDangTien.format(sanPham.gia)}) × hệ số. Giá KM combo = giá niêm yết KM
              ({dinhDangTien.format(sanPham.giaKhuyenMai)}) × hệ số. Sửa hệ số là 2 giá đổi ngay.
            </p>
          </div>
        ) : (
          <div className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
            <Boxes className="size-6" />
            {laCombo
              ? `Đây là combo gộp ${sanPham.soLuongCombo} cái — giá lấy theo sản phẩm mẹ. Mở sản phẩm mẹ để chỉnh hệ số.`
              : 'Hàng hóa này chưa có combo. Bấm nút sinh combo ở dòng của nó trong danh sách.'}
          </div>
        ),
    }],
    [{
      // Thông tin mở rộng (cột riêng của cửa hàng), mã QR và lịch sử kho gộp chung một cột — đều là
      // phần tra cứu/phụ trợ, để chung một chỗ cho cột Thông tin đỡ dài.
      ten: 'Mở rộng & Lịch sử',
      icon: <History className="size-3.5" />,
      soLuong: sanPham.lichSu.length,
      noiDung: (
        <div className="space-y-3">
          <div className={`flex items-center gap-3 ${LOP_NEN_PHU}`}>
            <div className="shrink-0 rounded-lg bg-white p-1.5">
              {qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt={`QR ${sanPham.ten}`} className="size-24" />
              ) : (
                <div className="flex size-24 items-center justify-center text-xs text-slate-400">Đang tạo QR</div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Mã QR</p>
              <p className="mt-1 break-all font-mono text-xs text-slate-500 dark:text-slate-400">{sanPham.maQR}</p>
              <button
                type="button"
                disabled={!qr}
                onClick={() => taiTep(`${sanPham.id}-qr.png`, qr)}
                className={`${LOP_NUT_PHU} mt-2 w-full`}
              >
                <Download className="size-4" />
                Tải mã QR
              </button>
            </div>
          </div>

          <p className="text-center text-xs text-slate-500">
            Tạo {new Date(sanPham.ngayTao).toLocaleString('vi-VN')} · Cập nhật {new Date(sanPham.ngayCapNhat).toLocaleString('vi-VN')}
          </p>

          {truongRieng.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Thông tin mở rộng</p>
              {truongRieng.map((truong) => (
                <OSua
                  key={truong.id}
                  ten={truong.ten}
                  giaTri={sanPham.thongTinRieng[truong.id] || ''}
                  placeholder={`Nhập ${truong.ten.toLowerCase()}`}
                  onLuu={(v) =>
                    onSuaTruong(
                      { thongTinRieng: { ...sanPham.thongTinRieng, [truong.id]: v.trim() } },
                      truong.ten.toLowerCase(),
                    )
                  }
                />
              ))}
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Lịch sử kho</p>
            {sanPham.lichSu.map((lichSu) => (
              <div key={lichSu.id} className="rounded-xl bg-slate-100 p-3 dark:bg-slate-900/70">
                <p className="text-sm">{lichSu.noiDung}</p>
                <p className="mt-1 text-xs text-slate-500">{new Date(lichSu.thoiGian).toLocaleString('vi-VN')}</p>
              </div>
            ))}
            {sanPham.lichSu.length === 0 && (
              <div className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 text-sm text-slate-500 dark:border-slate-700">
                <History className="size-5" />
                Chưa có biến động kho.
              </div>
            )}
          </div>
        </div>
      ),
    }],
  ];

  return (
    <section className={`${LOP_THE} flex min-h-0 flex-1 flex-col p-4`}>
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-900">
            {sanPham.anhDaiDien ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={sanPham.anhDaiDien} alt={sanPham.ten} className="size-full object-cover" />
            ) : (
              <Package className="size-5 text-slate-400" />
            )}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-500">Hàng hóa đang chọn</p>
            {/* Tên sửa được ngay tại tiêu đề — bỏ trống thì giữ tên cũ (tên là trường bắt buộc). */}
            <TenSuaTaiCho ten={sanPham.ten} onLuu={(v) => onSuaTruong({ ten: v }, 'tên')} />
            <p className="truncate font-mono text-xs text-slate-500">{sanPham.maQR}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <span
            className={`rounded-lg px-2.5 py-1 text-xs font-bold ${
              hetHang
                ? 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300'
                : sapHet
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
            }`}
          >
            {hetHang ? 'Hết hàng' : sapHet ? `Sắp hết (ngưỡng ${dinhDangSo.format(sanPham.nguongCanhBao)})` : 'Còn hàng'}
          </span>
          <div className="flex gap-1.5">
            {keoDuoc && (
              <NutBieuTuong nhan="Đặt lại độ rộng các cột" icon={<Columns3 className="size-4" />} onClick={datLaiDoRongCot} />
            )}
            <NutBieuTuong nhan="Sửa hàng hóa" icon={<Pencil className="size-4" />} onClick={onSua} />
            <NutBieuTuong nhan="Xóa hàng hóa" nguyHiem icon={<Trash2 className="size-4" />} onClick={onXoa} />
            <NutBieuTuong nhan="Bỏ chọn (mở lại bảng đầy đủ)" icon={<X className="size-4" />} onClick={onDong} />
          </div>
        </div>
      </div>

      {keoDuoc ? (
        // Màn rộng: hàng ngang co giãn được — mỗi cột là 1 phần tử flex, xen giữa là vạch kéo.
        <div ref={khungCotRef} className="mt-4 flex min-h-0 flex-1">
          {cotChiTiet.map((cot, index) => (
            <React.Fragment key={cot[0].ten}>
              <CotChiTiet the={cot} style={{ flexGrow: tyLeCot[index], flexBasis: 0, minWidth: 0 }} />
              {index < cotChiTiet.length - 1 && (
                <VachKeoCot onBatDau={(event) => batDauKeoCot(index, event)} onDatLai={datLaiDoRongCot} />
              )}
            </React.Fragment>
          ))}
        </div>
      ) : (
        <div className={`${LOP_AN_CUON} mt-4 grid min-h-0 flex-1 auto-rows-[minmax(260px,1fr)] gap-3 overflow-y-auto lg:grid-cols-2`}>
          {cotChiTiet.map((cot) => (
            <CotChiTiet key={cot[0].ten} the={cot} />
          ))}
        </div>
      )}
    </section>
  );
}

/** Nút chọn tệp dạng label bọc input file — dùng để thêm ảnh/file in ngay trong cột chi tiết. */
function NutChonTep({
  nhan,
  icon,
  accept,
  dangXuLy,
  onChon,
}: {
  nhan: string;
  icon: React.ReactNode;
  accept?: string;
  dangXuLy: boolean;
  onChon: (tep: File[]) => void;
}) {
  return (
    <label className={`${LOP_NUT_PHU} w-full cursor-pointer ${dangXuLy ? 'pointer-events-none opacity-60' : ''}`}>
      {dangXuLy ? <Loader2 className="size-4 animate-spin" /> : icon}
      {dangXuLy ? 'Đang xử lý...' : nhan}
      <input
        type="file"
        accept={accept}
        multiple
        disabled={dangXuLy}
        className="hidden"
        onChange={(event) => {
          const tep = Array.from(event.target.files || []);
          event.target.value = '';
          onChon(tep);
        }}
      />
    </label>
  );
}

/** Vạch kéo giữa hai cột chi tiết — kéo để đổi độ rộng, bấm đúp để trả về mặc định. */
function VachKeoCot({ onBatDau, onDatLai }: { onBatDau: (event: React.PointerEvent<HTMLDivElement>) => void; onDatLai: () => void }) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Kéo để đổi độ rộng cột"
      onPointerDown={onBatDau}
      onDoubleClick={onDatLai}
      title="Kéo để đổi độ rộng · Bấm đúp để về mặc định"
      className="group flex w-3 shrink-0 cursor-col-resize touch-none items-center justify-center"
    >
      <span className="h-12 w-1 rounded-full bg-slate-200 transition-colors group-hover:bg-indigo-500 dark:bg-slate-700 dark:group-hover:bg-indigo-500" />
    </div>
  );
}

/** Một cột của khung chi tiết (thay cho tab cũ) — tiêu đề cố định, phần nội dung tự cuộn, ẩn thanh cuộn. */
/** Một thẻ nội dung trong cột chi tiết. Cột có nhiều thẻ thì tiêu đề biến thành tab bấm qua lại. */
type TheCot = { ten: string; icon: React.ReactNode; soLuong?: number; noiDung: React.ReactNode };

function CotChiTiet({
  the,
  style,
}: {
  the: TheCot[];
  /** Chỉ dùng ở bố cục hàng ngang: flex-grow do người dùng kéo (xem useDoRongCot). */
  style?: React.CSSProperties;
}) {
  const [theDangMo, setTheDangMo] = useState(0);
  // Số thẻ có thể đổi giữa các lần render (cột Ảnh/File in luôn 2, cột khác 1) — kẹp lại cho chắc.
  const dangMo = Math.min(theDangMo, the.length - 1);
  const nhieuThe = the.length > 1;

  return (
    <div style={style} className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
      <div
        className={`flex shrink-0 items-center gap-1 border-b border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900/70 ${
          nhieuThe ? 'px-1.5 py-1.5' : 'px-3 py-2'
        }`}
      >
        {the.map((item, index) =>
          nhieuThe ? (
            <button
              key={item.ten}
              type="button"
              onClick={() => setTheDangMo(index)}
              aria-pressed={index === dangMo}
              className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold uppercase tracking-wide transition-colors ${
                index === dangMo
                  ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-800 dark:text-white'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {item.icon}
              {item.ten}
              {item.soLuong !== undefined && (
                <span className="rounded-full bg-slate-200 px-1.5 text-[11px] tabular-nums dark:bg-slate-700">{item.soLuong}</span>
              )}
            </button>
          ) : (
            <React.Fragment key={item.ten}>
              <span className="text-slate-500 dark:text-slate-400">{item.icon}</span>
              <p className="ml-1 text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">{item.ten}</p>
              {item.soLuong !== undefined && (
                <span className="ml-1 rounded-full bg-slate-200 px-1.5 text-xs font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-200">
                  {item.soLuong}
                </span>
              )}
            </React.Fragment>
          ),
        )}
      </div>
      <div className={`${LOP_AN_CUON} min-h-0 flex-1 overflow-y-auto p-3`}>{the[dangMo].noiDung}</div>
    </div>
  );
}

/** Huy hiệu đếm ảnh/file in ở cột "Ảnh / File" của bảng danh sách. */
function DemTepDinhKem({ icon, soLuong, nhan }: { icon: React.ReactNode; soLuong: number; nhan: string }) {
  return (
    <span
      title={`${dinhDangSo.format(soLuong)} ${nhan}`}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold tabular-nums ${
        soLuong > 0
          ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
          : 'bg-transparent text-slate-300 dark:text-slate-600'
      }`}
    >
      {icon}
      {dinhDangSo.format(soLuong)}
    </span>
  );
}

function ModalHangHoa({
  sanPhamGoc,
  chaCuaSanPhamGoc,
  truongRieng,
  onDong,
  onLuu,
}: {
  sanPhamGoc: SanPham | null;
  /** Sản phẩm mẹ — chỉ có giá trị khi sanPhamGoc là 1 combo con, dùng hiện chú thích/khóa công thức giá vốn + tồn kho. */
  chaCuaSanPhamGoc: SanPham | null;
  truongRieng: TruongRieng[];
  onDong: () => void;
  onLuu: (ketQua: KetQuaBieuMau) => void;
}) {
  const dangSua = sanPhamGoc !== null;
  const [bieuMau, setBieuMau] = useState<BieuMau>(() =>
    sanPhamGoc
      ? {
          ten: sanPhamGoc.ten,
          danhMuc: sanPhamGoc.danhMuc,
          giaVon: String(sanPhamGoc.giaVon),
          tyLeLoiNhuan: String(sanPhamGoc.tyLeLoiNhuan ?? TY_LE_LOI_NHUAN_MAC_DINH),
          soLuong: String(sanPhamGoc.soLuong),
          donVi: sanPhamGoc.donVi,
          nguongCanhBao: String(sanPhamGoc.nguongCanhBao),
          nhaCungCap: sanPhamGoc.nhaCungCap,
          ghiChu: sanPhamGoc.ghiChu,
          thongTinRieng: { ...sanPhamGoc.thongTinRieng },
        }
      : mauBanDau,
  );
  const [anh, setAnh] = useState<AnhSanPham[]>(sanPhamGoc?.anh ?? []);
  const [dangXuLyAnh, setDangXuLyAnh] = useState(false);
  const [tepIn, setTepIn] = useState<TepIn[]>(sanPhamGoc?.tepIn ?? []);
  const [dangXuLyTepIn, setDangXuLyTepIn] = useState(false);

  useEffect(() => {
    const dongBangEsc = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onDong();
    };
    window.addEventListener('keydown', dongBangEsc);
    return () => window.removeEventListener('keydown', dongBangEsc);
  }, [onDong]);

  const capNhat = (ten: keyof BieuMau, giaTri: string) => setBieuMau((hienTai) => ({ ...hienTai, [ten]: giaTri }));

  // Preview trực tiếp — không lưu vào state, chỉ để hiển thị khi gõ giá vốn / % lợi nhuận
  // (nguồn sự thật vẫn là server tính lại lúc lưu).
  const tyLeLoiNhuanPreview = chuanHoaTyLeLoiNhuan(bieuMau.tyLeLoiNhuan);
  const giaTinhToan = tinhToanBoGia(Number(bieuMau.giaVon) || 0, tyLeLoiNhuanPreview);

  const capNhatThongTinRieng = (id: string, giaTri: string) =>
    setBieuMau((hienTai) => ({ ...hienTai, thongTinRieng: { ...hienTai.thongTinRieng, [id]: giaTri } }));

  const themAnh = async (event: ChangeEvent<HTMLInputElement>) => {
    const tep = Array.from(event.target.files || []);
    event.target.value = '';
    if (!tep.length) return;

    setDangXuLyAnh(true);
    try {
      const anhMoi = await Promise.all(tep.map(docAnh));
      setAnh((hienTai) => [...hienTai, ...anhMoi]);
    } catch {
      notify('Không đọc được ảnh đã chọn.');
    } finally {
      setDangXuLyAnh(false);
    }
  };

  const themTepIn = async (event: ChangeEvent<HTMLInputElement>) => {
    const tep = Array.from(event.target.files || []);
    event.target.value = '';
    if (!tep.length) return;

    setDangXuLyTepIn(true);
    try {
      const ketQua = await Promise.allSettled(tep.map(docTepIn));
      const tepMoi = ketQua.filter((r): r is PromiseFulfilledResult<TepIn> => r.status === 'fulfilled').map((r) => r.value);
      const loi = ketQua.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (tepMoi.length > 0) setTepIn((hienTai) => [...hienTai, ...tepMoi]);
      if (loi.length > 0) notify(loi.map((r) => (r.reason instanceof Error ? r.reason.message : 'Không đọc được file.')).join(' '));
    } finally {
      setDangXuLyTepIn(false);
    }
  };

  const guiBieuMau = () => {
    if (!bieuMau.ten.trim()) {
      notify('Vui lòng nhập tên hàng hóa.');
      return;
    }
    onLuu({ ...bieuMau, anh, tepIn });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm" onMouseDown={onDong}>
      <div
        className="my-auto w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#111827]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-5 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-indigo-600/10 text-indigo-500 dark:bg-indigo-500/15 dark:text-indigo-300">
              {dangSua ? <Pencil className="size-5" /> : <PackagePlus className="size-5" />}
            </span>
            <div>
              <h3 className="text-lg font-bold">{dangSua ? 'Sửa hàng hóa' : 'Thêm hàng hóa'}</h3>
              <p className="text-sm text-slate-500">
                {dangSua ? sanPhamGoc.id : 'Mã hàng và mã QR sẽ được sinh tự động sau khi lưu.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onDong}
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
            aria-label="Đóng"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="max-h-[65vh] space-y-4 overflow-y-auto p-5">
          <NhapLieu label="Tên hàng hóa" bacBuoc value={bieuMau.ten} onChange={(value) => capNhat('ten', value)} placeholder="Ví dụ: Móc khóa in 3D" />

          <div className="grid gap-4 sm:grid-cols-2">
            <NhapLieu label="Danh mục" value={bieuMau.danhMuc} onChange={(value) => capNhat('danhMuc', value)} placeholder="Quà tặng" />
            <NhapLieu label="Đơn vị" value={bieuMau.donVi} onChange={(value) => capNhat('donVi', value)} placeholder="cái, hộp, bộ..." />
            <NhapLieu
              label="Giá vốn (VNĐ)"
              type="number"
              value={bieuMau.giaVon}
              onChange={(value) => capNhat('giaVon', value)}
              placeholder="0"
              khoa={!!sanPhamGoc?.parentId}
              moTa={
                sanPhamGoc?.parentId && chaCuaSanPhamGoc
                  ? `Tự tính theo giá vốn mẹ (${dinhDangTien.format(chaCuaSanPhamGoc.giaVon)}) — cập nhật lại mỗi khi mẹ đổi giá.`
                  : 'Các giá bán bên dưới tự tính từ giá vốn — không sửa tay được.'
              }
            />
            <NhapLieu
              label="% lợi nhuận (giá bán lẻ)"
              type="number"
              value={bieuMau.tyLeLoiNhuan}
              onChange={(value) => capNhat('tyLeLoiNhuan', value)}
              placeholder={String(TY_LE_LOI_NHUAN_MAC_DINH)}
              khoa={!!sanPhamGoc?.parentId}
              moTa={
                sanPhamGoc?.parentId && chaCuaSanPhamGoc
                  ? `Dùng chung % lợi nhuận với sản phẩm mẹ (${chaCuaSanPhamGoc.tyLeLoiNhuan}%).`
                  : `Giá bán lẻ = giá vốn + ${tyLeLoiNhuanPreview}%; giá sàn/giá KM tự bù phí sàn để lời tương đương. Bỏ trống = mặc định ${TY_LE_LOI_NHUAN_MAC_DINH}%.`
              }
            />
            <NhapLieu
              label="Số lượng tồn"
              type="number"
              value={bieuMau.soLuong}
              onChange={(value) => capNhat('soLuong', value)}
              placeholder="0"
              khoa={!!sanPhamGoc?.parentId}
              moTa={
                sanPhamGoc?.parentId
                  ? `Tự tính = floor(${dinhDangSo.format(chaCuaSanPhamGoc?.soLuong ?? 0)} sản phẩm mẹ ÷ ${sanPhamGoc.soLuongCombo}).`
                  : undefined
              }
            />
            <NhapLieu
              label="Ngưỡng cảnh báo"
              type="number"
              value={bieuMau.nguongCanhBao}
              onChange={(value) => capNhat('nguongCanhBao', value)}
              placeholder="5"
              moTa="Tồn kho ≤ ngưỡng này sẽ vào danh sách cần nhập thêm."
            />
            <NhapLieu label="Nhà cung cấp" value={bieuMau.nhaCungCap} onChange={(value) => capNhat('nhaCungCap', value)} placeholder="Tên nhà cung cấp" />
          </div>

          <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-100 p-3 dark:bg-slate-900/70">
            <GiaTinhSan nhan="Giá bán sàn" giaTri={giaTinhToan.gia} />
            <GiaTinhSan nhan={`Giá bán lẻ (+${tyLeLoiNhuanPreview}%)`} giaTri={giaTinhToan.giaBanLe} />
            <GiaTinhSan nhan="Giá niêm yết KM 25%" giaTri={giaTinhToan.giaKhuyenMai} />
          </div>

          {!dangSua && (
            <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <Boxes className="size-3.5 shrink-0" />
              Sau khi lưu sẽ tự sinh thêm 3 sản phẩm combo (mã hàng gốc kèm -1/-2/-5), thụt vào 1 tab bên dưới.
            </p>
          )}

          {truongRieng.length > 0 && (
            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Thông tin mở rộng</p>
              <div className="grid gap-4 sm:grid-cols-2">
                {truongRieng.map((truong) => (
                  <NhapLieu
                    key={truong.id}
                    label={truong.ten}
                    value={bieuMau.thongTinRieng[truong.id] || ''}
                    onChange={(value) => capNhatThongTinRieng(truong.id, value)}
                    placeholder={`Nhập ${truong.ten.toLowerCase()}`}
                  />
                ))}
              </div>
            </div>
          )}

          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">Ghi chú</span>
            <textarea
              value={bieuMau.ghiChu}
              onChange={(event) => capNhat('ghiChu', event.target.value)}
              rows={3}
              className={`${LOP_NHAP} h-auto py-2`}
              placeholder="Thông tin nội bộ, quy cách đóng gói, lưu ý bán hàng..."
            />
          </label>

          <div className="rounded-xl border border-dashed border-slate-300 p-4 dark:border-slate-700">
            <label className={`${LOP_NUT_PHU} w-full cursor-pointer`}>
              <ImagePlus className="size-4" />
              {dangXuLyAnh ? 'Đang xử lý ảnh...' : 'Tải ảnh hàng hóa'}
              <input type="file" accept="image/*" multiple onChange={themAnh} className="hidden" disabled={dangXuLyAnh} />
            </label>
            <p className="mt-2 text-xs text-slate-500">
              Chọn được nhiều ảnh. Ảnh lớn sẽ tự thu nhỏ về {CANH_ANH_TOI_DA}px để đồng bộ lên máy chủ nhanh hơn.
              {anh.length > 1 && ' Bấm biểu tượng ngôi sao trên một ảnh để đặt nó làm ảnh đại diện.'}
            </p>

            {anh.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {anh.map((item, index) => (
                  <div key={item.id} className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                    {item.duLieu ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.duLieu} alt={item.ten} className="size-full object-cover" />
                    ) : (
                      <span className="flex size-full items-center justify-center bg-slate-100 text-slate-400 dark:bg-slate-900">
                        <ImageIcon className="size-6" />
                      </span>
                    )}
                    {index === 0 ? (
                      <span className="pointer-events-none absolute left-1 top-1 inline-flex items-center gap-1 rounded-md bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        <Star className="size-3 fill-current" />
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          setAnh((hienTai) => {
                            const chon = hienTai.find((a) => a.id === item.id);
                            return chon ? [chon, ...hienTai.filter((a) => a.id !== item.id)] : hienTai;
                          })
                        }
                        title="Đặt làm ảnh đại diện"
                        aria-label={`Đặt ${item.ten} làm ảnh đại diện`}
                        className="absolute left-1 top-1 flex size-6 items-center justify-center rounded-md bg-slate-950/70 text-white opacity-0 transition-opacity hover:bg-indigo-600 group-hover:opacity-100"
                      >
                        <Star className="size-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setAnh((hienTai) => hienTai.filter((a) => a.id !== item.id))}
                      className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-lg bg-slate-950/70 text-white opacity-0 transition-opacity hover:bg-red-600 group-hover:opacity-100"
                      aria-label={`Xóa ảnh ${item.ten}`}
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-dashed border-slate-300 p-4 dark:border-slate-700">
            <label className={`${LOP_NUT_PHU} w-full cursor-pointer`}>
              <Paperclip className="size-4" />
              {dangXuLyTepIn ? 'Đang xử lý file...' : 'Tải file in (PDF, STL, 3MF, gcode...)'}
              <input type="file" multiple onChange={themTepIn} className="hidden" disabled={dangXuLyTepIn} />
            </label>
            <p className="mt-2 text-xs text-slate-500">
              File in được lưu kèm hàng hóa để khi sắp/hết hàng có thể mở đúng file và in lại ngay. Mỗi file tối đa{' '}
              {dinhDangDungLuong(DUNG_LUONG_TEP_IN_TOI_DA)}.
            </p>

            {tepIn.length > 0 && (
              <div className="mt-3 space-y-2">
                {tepIn.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                        <FileText className="size-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold" title={item.ten}>
                          {item.ten}
                        </span>
                        <span className="text-xs text-slate-500">{dinhDangDungLuong(item.dungLuong)}</span>
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTepIn((hienTai) => hienTai.filter((t) => t.id !== item.id))}
                      className="flex size-7 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                      aria-label={`Xóa file ${item.ten}`}
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 p-5 dark:border-slate-800">
          <button type="button" onClick={onDong} className={LOP_NUT_PHU}>
            Hủy
          </button>
          <button type="button" onClick={guiBieuMau} className={LOP_NUT_CHINH}>
            <CheckCircle2 className="size-4" />
            {dangSua ? 'Lưu thay đổi' : 'Lưu và tạo mã QR'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalCotRieng({
  truongRieng,
  sanPham,
  onThem,
  onXoa,
  onDong,
}: {
  truongRieng: TruongRieng[];
  sanPham: SanPham[];
  onThem: (ten: string) => void;
  onXoa: (id: string) => void;
  onDong: () => void;
}) {
  const [truongMoi, setTruongMoi] = useState('');

  useEffect(() => {
    const dongBangEsc = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onDong();
    };
    window.addEventListener('keydown', dongBangEsc);
    return () => window.removeEventListener('keydown', dongBangEsc);
  }, [onDong]);

  const them = () => {
    onThem(truongMoi);
    setTruongMoi('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onMouseDown={onDong}>
      <div
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#111827]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-5 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-indigo-600/10 text-indigo-500 dark:bg-indigo-500/15 dark:text-indigo-300">
              <Settings2 className="size-5" />
            </span>
            <div>
              <h3 className="text-lg font-bold">Cột thông tin riêng</h3>
              <p className="text-sm text-slate-500">Áp dụng cho mọi hàng hóa trong cửa hàng.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onDong}
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
            aria-label="Đóng"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="flex gap-2">
            <input
              value={truongMoi}
              onChange={(event) => setTruongMoi(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') them();
              }}
              className={LOP_NHAP}
              placeholder="Ví dụ: Màu sắc, size, mùa vụ"
            />
            <button type="button" onClick={them} className={`${LOP_NUT_CHINH} shrink-0`}>
              <Plus className="size-4" />
              Thêm cột
            </button>
          </div>

          <div className="space-y-2">
            {truongRieng.map((truong) => {
              const soHangDung = sanPham.filter((item) => (item.thongTinRieng[truong.id] || '').trim() !== '').length;
              return (
                <div key={truong.id} className={`flex items-center justify-between gap-3 ${LOP_NEN_PHU}`}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{truong.ten}</p>
                    <p className="font-mono text-xs text-slate-500">{truong.id}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {dinhDangSo.format(soHangDung)} hàng hóa
                    </span>
                    <NutBieuTuong nhan="Xóa cột" nguyHiem icon={<Trash2 className="size-4" />} onClick={() => onXoa(truong.id)} />
                  </div>
                </div>
              );
            })}

            {truongRieng.length === 0 && (
              <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
                Chưa có cột riêng nào. Thêm cột để lưu các thông tin đặc thù của cửa hàng.
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end border-t border-slate-200 p-5 dark:border-slate-800">
          <button type="button" onClick={onDong} className={LOP_NUT_PHU}>
            Xong
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Bảng tính giá vốn THAM KHẢO cho một mẻ in — cố ý tách rời hẳn hàng hóa: không đọc, không ghi vào
 * sản phẩm nào, chỉ nhớ lần nhập trước trong localStorage của máy này.
 *
 *   giá 1 sản phẩm = (số gram × tiền/gram + số giờ × tiền/giờ) / số sản phẩm
 */
function ModalTinhGiaVon({ onDong }: { onDong: () => void }) {
  const [mau, setMau] = useState<MauTinhGiaVon>(docMauTinhGiaVon);

  useEffect(() => {
    const dongBangEsc = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onDong();
    };
    window.addEventListener('keydown', dongBangEsc);
    return () => window.removeEventListener('keydown', dongBangEsc);
  }, [onDong]);

  // Nhớ lại cho lần sau — đơn giá nhựa/giờ máy hầu như không đổi giữa các lần tính.
  useEffect(() => {
    try {
      window.localStorage.setItem(KEY_TINH_GIA_VON, JSON.stringify(mau));
    } catch {
      // không lưu được thì thôi, kết quả trong phiên này vẫn đúng
    }
  }, [mau]);

  const capNhat = (ten: keyof MauTinhGiaVon, giaTri: string) => setMau((hienTai) => ({ ...hienTai, [ten]: giaTri }));

  const soDuong = (giaTri: string) => {
    const so = Number(giaTri);
    return Number.isFinite(so) && so > 0 ? so : 0;
  };

  const soGam = soDuong(mau.soGam);
  const soGio = soDuong(mau.soGio);
  const soSanPham = soDuong(mau.soSanPham);
  const tienNhua = soGam * soDuong(mau.tienMoiGam);
  const tienMay = soGio * soDuong(mau.tienMoiGio);
  const tongChiPhi = tienNhua + tienMay;
  const giaMotSanPham = soSanPham > 0 ? Math.round(tongChiPhi / soSanPham) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm" onMouseDown={onDong}>
      <div
        className="my-auto w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#111827]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-5 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-indigo-600/10 text-indigo-500 dark:bg-indigo-500/15 dark:text-indigo-300">
              <Calculator className="size-5" />
            </span>
            <div>
              <h3 className="text-lg font-bold">Tính giá vốn (tham khảo)</h3>
              <p className="text-sm text-slate-500">Chỉ để ước lượng — không ghi vào hàng hóa nào.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onDong}
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
            aria-label="Đóng"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="max-h-[65vh] space-y-4 overflow-y-auto p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <NhapLieu
              label="Số gram nhựa"
              type="number"
              value={mau.soGam}
              onChange={(value) => capNhat('soGam', value)}
              placeholder="0"
              moTa="Tổng nhựa của cả mẻ in."
            />
            <NhapLieu
              label="Tiền / gram (VNĐ)"
              type="number"
              value={mau.tienMoiGam}
              onChange={(value) => capNhat('tienMoiGam', value)}
              placeholder="0"
              moTa="Giá cuộn ÷ số gram (cuộn 1kg giá 350.000đ → 350)."
            />
            <NhapLieu
              label="Số giờ in"
              type="number"
              value={mau.soGio}
              onChange={(value) => capNhat('soGio', value)}
              placeholder="0"
              moTa="Thời gian in cả mẻ."
            />
            <NhapLieu
              label="Tiền / giờ (VNĐ)"
              type="number"
              value={mau.tienMoiGio}
              onChange={(value) => capNhat('tienMoiGio', value)}
              placeholder="0"
              moTa="Điện + hao mòn máy cho mỗi giờ chạy."
            />
            <NhapLieu
              label="Số sản phẩm"
              type="number"
              value={mau.soSanPham}
              onChange={(value) => capNhat('soSanPham', value)}
              placeholder="1"
              moTa="Số thành phẩm mẻ in này cho ra."
            />
          </div>

          <div className={`space-y-2 ${LOP_NEN_PHU}`}>
            <DongTinhGia nhan={`Tiền nhựa (${dinhDangSo.format(soGam)} g)`} giaTri={tienNhua} />
            <DongTinhGia nhan={`Tiền máy in (${dinhDangSo.format(soGio)} h)`} giaTri={tienMay} />
            <DongTinhGia nhan="Tổng chi phí cả mẻ" giaTri={tongChiPhi} damNet />
          </div>

          <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900 dark:bg-indigo-500/10">
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">
              Giá vốn 1 sản phẩm {soSanPham > 0 ? `(chia cho ${dinhDangSo.format(soSanPham)})` : ''}
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-indigo-700 dark:text-indigo-200">
              {dinhDangTien.format(giaMotSanPham)}
            </p>
            {soSanPham <= 0 && <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">Nhập số sản phẩm lớn hơn 0 để chia.</p>}
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Công thức: (số gram × tiền/gram + số giờ × tiền/giờ) ÷ số sản phẩm. Chưa tính bao bì, móc khóa, công dán/đóng gói hay
            tỷ lệ in hỏng — muốn sát thực tế thì cộng thêm phần đó khi nhập giá vốn cho hàng hóa.
          </p>
        </div>

        <div className="flex justify-between gap-2 border-t border-slate-200 p-5 dark:border-slate-800">
          <button type="button" onClick={() => setMau(mauTinhGiaVonBanDau)} className={LOP_NUT_PHU}>
            <RefreshCw className="size-4" />
            Xóa hết
          </button>
          <button type="button" onClick={onDong} className={LOP_NUT_PHU}>
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Một dòng combo trên panel hàng mẹ: mã SKU + tồn kho + ô sửa hệ số + 2 giá tính ra từ nó.
 * Giữ chuỗi đang gõ ở state riêng để người dùng xóa trắng ô hoặc gõ "1." không bị nhảy số; chỉ khi
 * gõ ra một số hợp lệ mới báo lên trên. Giá trị ngoài (đổi từ chỗ khác) đồng bộ lại qua useEffect.
 */
function ChinhHeSoCombo({
  maQR,
  soLuongCombo,
  soLuong,
  heSo,
  gia,
  giaKhuyenMai,
  onDoi,
}: {
  /** Mã SKU của combo (mã mẹ + "-1"/"-2"/"-5") — đúng mã phải khai trên sàn. */
  maQR: string;
  soLuongCombo: number;
  /** Gộp được bao nhiêu bộ từ tồn kho mẹ (đã làm tròn xuống, xem tinhSoLuongCombo). */
  soLuong: number;
  heSo: number;
  gia: number;
  giaKhuyenMai: number;
  onDoi: (heSoMoi: number) => void;
}) {
  const [dangGo, setDangGo] = useState(String(heSo));
  // Đồng bộ khi hệ số bị đổi từ nơi khác (nút "Về hệ số mặc định", chọn sang hàng hóa khác) — chỉnh
  // state ngay trong lúc render là cách React khuyến nghị, không dùng useEffect.
  const [heSoTruoc, setHeSoTruoc] = useState(heSo);
  if (heSo !== heSoTruoc) {
    setHeSoTruoc(heSo);
    setDangGo(String(heSo));
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
            Combo x{soLuongCombo}
          </span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={0.1}
            value={dangGo}
            onChange={(event) => {
              const giaTri = event.target.value;
              setDangGo(giaTri);
              const so = Number(giaTri);
              if (giaTri !== '' && Number.isFinite(so) && so >= 0) onDoi(so);
            }}
            onBlur={() => setDangGo(String(heSo))}
            // Xem chú thích cùng loại ở OSua: chặn lăn chuột đổi số ngoài ý muốn.
            onWheel={(event) => event.currentTarget.blur()}
            aria-label={`Hệ số combo ${soLuongCombo}`}
            className="w-14 rounded-lg border border-slate-300 bg-white px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950"
          />
          <span className="text-[10px] text-slate-400">×</span>
        </span>
        {/* Mã SKU + tồn kho: hai thứ hay phải tra khi khai combo lên sàn, để ngay đây khỏi phải mở
            từng combo con ra xem. Hết hàng thì tô vàng cho dễ thấy. */}
        <span className="flex min-w-0 items-center gap-1.5 text-[10px] leading-none">
          <code
            title={maQR}
            className="min-w-0 truncate font-mono font-semibold text-slate-600 dark:text-slate-300"
          >
            {maQR}
          </code>
          <span className="text-slate-300 dark:text-slate-600">·</span>
          <span
            className={`shrink-0 tabular-nums ${
              soLuong > 0 ? 'text-slate-500 dark:text-slate-400' : 'font-semibold text-amber-600 dark:text-amber-400'
            }`}
          >
            {soLuong > 0 ? `${dinhDangSo.format(soLuong)} bộ` : 'Hết hàng'}
          </span>
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end leading-tight">
        <span className="text-sm font-bold tabular-nums">{dinhDangTien.format(gia)}</span>
        <span className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
          KM {dinhDangTien.format(giaKhuyenMai)}
        </span>
      </span>
    </div>
  );
}

function DongTinhGia({ nhan, giaTri, damNet = false }: { nhan: string; giaTri: number; damNet?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 ${damNet ? 'border-t border-slate-300 pt-2 dark:border-slate-700' : ''}`}>
      <span className={`text-sm ${damNet ? 'font-semibold text-slate-700 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400'}`}>
        {nhan}
      </span>
      <span className={`tabular-nums ${damNet ? 'text-base font-bold' : 'text-sm font-semibold'}`}>{dinhDangTien.format(giaTri)}</span>
    </div>
  );
}

function XemAnh({ anh, onDong }: { anh: AnhSanPham; onDong: () => void }) {
  useEffect(() => {
    const dongBangEsc = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onDong();
    };
    window.addEventListener('keydown', dongBangEsc);
    return () => window.removeEventListener('keydown', dongBangEsc);
  }, [onDong]);

  return (
    <div className="fixed inset-0 z-[75] flex flex-col items-center justify-center gap-3 bg-black/80 p-4 backdrop-blur-sm" onMouseDown={onDong}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={anh.duLieu}
        alt={anh.ten}
        className="max-h-[80vh] max-w-full rounded-2xl object-contain shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      />
      <div className="flex items-center gap-2" onMouseDown={(event) => event.stopPropagation()}>
        <span className="rounded-lg bg-slate-900/80 px-3 py-2 text-sm font-semibold text-white">
          {anh.ten} · {dinhDangDungLuong(anh.dungLuong)}
        </span>
        <button
          type="button"
          onClick={() => taiTep(anh.ten, anh.duLieu)}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-3 text-sm font-semibold text-slate-900 hover:bg-slate-100"
        >
          <Download className="size-4" />
          Tải ảnh
        </button>
        <button
          type="button"
          onClick={onDong}
          className="inline-flex size-10 items-center justify-center rounded-lg bg-slate-900/80 text-white hover:bg-slate-800"
          aria-label="Đóng ảnh"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}

function NhapLieu({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  moTa,
  bacBuoc = false,
  khoa = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  moTa?: string;
  bacBuoc?: boolean;
  /** true = chỉ đọc (giá trị tự tính, không cho sửa tay) */
  khoa?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">
        {label}
        {bacBuoc && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      <input
        value={value}
        type={type}
        onChange={(event) => onChange(event.target.value)}
        disabled={khoa}
        className={`${LOP_NHAP} ${khoa ? 'cursor-not-allowed opacity-60' : ''}`}
        placeholder={placeholder}
      />
      {moTa && <span className="mt-1 block text-xs text-slate-500">{moTa}</span>}
    </label>
  );
}

/** Một chỉ số tổng hiển thị gọn trên thanh header (bản rút gọn của thẻ thống kê lớn trước đây). */
function ThongKeNgan({
  icon,
  ten,
  giaTri,
  canhBao = false,
  dangBat = false,
  onClick,
  moTa,
}: {
  icon: React.ReactNode;
  ten: string;
  giaTri: string;
  canhBao?: boolean;
  dangBat?: boolean;
  onClick?: () => void;
  moTa?: string;
}) {
  const noiDung = (
    <>
      <span
        className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${
          canhBao
            ? 'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300'
            : 'bg-indigo-600/10 text-indigo-500 dark:bg-indigo-500/15 dark:text-indigo-300'
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0 text-left">
        <span className="block text-[10px] font-semibold uppercase leading-tight tracking-wide text-slate-500">{ten}</span>
        <span className="block truncate text-sm font-bold leading-tight">{giaTri}</span>
      </span>
    </>
  );

  const lop = `flex items-center gap-2 rounded-xl border px-2.5 py-1.5 ${
    dangBat
      ? 'border-amber-400 bg-amber-50 dark:border-amber-500/60 dark:bg-amber-500/10'
      : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-[#111827]'
  }`;

  if (!onClick) {
    return (
      <div className={lop} title={moTa}>
        {noiDung}
      </div>
    );
  }

  return (
    <button type="button" onClick={onClick} aria-pressed={dangBat} title={moTa} className={`${lop} transition-colors hover:border-slate-300 dark:hover:border-slate-700`}>
      {noiDung}
    </button>
  );
}

function GiaTinhSan({ nhan, giaTri }: { nhan: string; giaTri: number }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{nhan}</p>
      <p className="mt-0.5 font-bold tabular-nums">{dinhDangTien.format(giaTri)}</p>
    </div>
  );
}

/** Tiêu đề panel: gõ đè thẳng lên tên hàng hóa. Bỏ trống rồi rời ô thì trả lại tên cũ. */
function TenSuaTaiCho({ ten, onLuu }: { ten: string; onLuu: (tenMoi: string) => void }) {
  const [dangGo, setDangGo] = useState(ten);
  const [tenTruoc, setTenTruoc] = useState(ten);
  if (ten !== tenTruoc) {
    setTenTruoc(ten);
    setDangGo(ten);
  }

  const ketThuc = () => {
    const sach = dangGo.trim();
    if (!sach) return setDangGo(ten);
    if (sach !== ten) onLuu(sach);
  };

  return (
    <input
      value={dangGo}
      onChange={(event) => setDangGo(event.target.value)}
      onBlur={ketThuc}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          setDangGo(ten);
          event.currentTarget.blur();
        }
      }}
      title={ten}
      aria-label="Tên hàng hóa"
      className="-mx-1 block w-full truncate rounded-lg border border-transparent bg-transparent px-1 text-lg font-bold outline-none transition-colors hover:border-slate-300 focus:border-indigo-500 focus:bg-white dark:hover:border-slate-700 dark:focus:bg-slate-950"
    />
  );
}

function ThongTin({ ten, giaTri, moTa }: { ten: string; giaTri: string; moTa?: string }) {
  return (
    <div className={LOP_NEN_PHU} title={moTa}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ten}</p>
      <p className="mt-0.5 break-words text-sm font-bold">{giaTri}</p>
    </div>
  );
}

/**
 * Ô sửa TRỰC TIẾP trên panel chi tiết — nhìn y như ô ThongTin nhưng gõ được ngay, không phải mở modal.
 *
 * Chỉ báo thay đổi lên trên khi rời ô hoặc bấm Enter (không phải mỗi lần gõ phím): mỗi lần sửa xong
 * ghi đúng 1 dòng lịch sử kho và bắn đúng 1 lần đồng bộ, thay vì hàng chục dòng rác theo từng ký tự.
 * Esc = bỏ dở, trả lại giá trị cũ.
 */
function OSua({
  ten,
  giaTri,
  onLuu,
  kieu = 'text',
  nhieuDong = false,
  khoa = false,
  moTa,
  placeholder,
}: {
  ten: string;
  giaTri: string;
  onLuu: (giaTriMoi: string) => void;
  kieu?: 'text' | 'number';
  nhieuDong?: boolean;
  /** Trường suy ra từ sản phẩm mẹ (combo con) — hiện như ô thường nhưng không cho gõ. */
  khoa?: boolean;
  moTa?: string;
  placeholder?: string;
}) {
  const [dangGo, setDangGo] = useState(giaTri);
  // Giá trị đổi từ nơi khác (chọn sang hàng hóa khác, combo tự tính lại) — đồng bộ trong lúc render
  // thay vì useEffect, theo khuyến nghị của React.
  const [giaTriTruoc, setGiaTriTruoc] = useState(giaTri);
  if (giaTri !== giaTriTruoc) {
    setGiaTriTruoc(giaTri);
    setDangGo(giaTri);
  }

  if (khoa) return <ThongTin ten={ten} giaTri={giaTri || '—'} moTa={moTa} />;

  const ketThuc = () => {
    if (dangGo !== giaTri) onLuu(dangGo);
  };

  const lopO =
    'mt-0.5 w-full rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-sm font-bold outline-none transition-colors hover:border-slate-300 focus:border-indigo-500 focus:bg-white dark:hover:border-slate-700 dark:focus:bg-slate-950';

  return (
    <label className={`block ${LOP_NEN_PHU}`} title={moTa}>
      <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{ten}</span>
      {nhieuDong ? (
        <textarea
          value={dangGo}
          onChange={(event) => setDangGo(event.target.value)}
          onBlur={ketThuc}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setDangGo(giaTri);
          }}
          rows={3}
          placeholder={placeholder}
          className={`${lopO} resize-y`}
        />
      ) : (
        <input
          type={kieu}
          inputMode={kieu === 'number' ? 'decimal' : undefined}
          value={dangGo}
          onChange={(event) => setDangGo(event.target.value)}
          onBlur={ketThuc}
          // Ô number đang focus mà lăn chuột thì trình duyệt tự tăng/giảm số — người dùng chỉ định
          // cuộn panel nhưng giá tiền đổi mất mà không hay. Nhả focus để trình duyệt bỏ qua.
          onWheel={(event) => event.currentTarget.blur()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') {
              setDangGo(giaTri);
              event.currentTarget.blur();
            }
          }}
          placeholder={placeholder}
          className={`${lopO} ${kieu === 'number' ? 'tabular-nums' : ''}`}
        />
      )}
    </label>
  );
}

function NutBieuTuong({
  nhan,
  icon,
  onClick,
  nguyHiem = false,
}: {
  nhan: string;
  icon: React.ReactNode;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  nguyHiem?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={nhan}
      aria-label={nhan}
      className={`flex size-9 shrink-0 items-center justify-center rounded-lg border transition-colors ${
        nguyHiem
          ? 'border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/40'
          : 'border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
      }`}
    >
      {icon}
    </button>
  );
}
