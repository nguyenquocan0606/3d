import prisma from '@/utils/db';
import { guiFcm } from './fcm.service';
import { guiTinNhan } from './zalo.service';

/**
 * Nơi duy nhất biết cách biến một sự kiện máy in thành thông báo tới người.
 *
 * Vòng giám sát (`printer-monitor.service.ts`) chỉ việc gọi `ghiVaGuiSuKien()`; chuyện gửi kênh nào,
 * có bị tắt không, ngưỡng ra sao là việc của file này. Nguyên tắc: **không bao giờ ném lỗi ra ngoài**
 * — thông báo hỏng thì lịch sử vẫn phải ghi, và vòng giám sát vẫn phải chạy tiếp.
 */

export const LOAI_SU_KIEN = {
  batDau: { nhan: 'Bắt đầu in', mucDo: 'tin', icon: '🖨️' },
  inXong: { nhan: 'In xong', mucDo: 'tin', icon: '✅' },
  tamDung: { nhan: 'Tạm dừng', mucDo: 'canhBao', icon: '⏸️' },
  inTiep: { nhan: 'In tiếp', mucDo: 'tin', icon: '▶️' },
  huy: { nhan: 'Hủy giữa chừng', mucDo: 'canhBao', icon: '🛑' },
  loi: { nhan: 'Máy báo lỗi', mucDo: 'loi', icon: '🚨' },
  mangMat: { nhan: 'Mất kết nối', mucDo: 'loi', icon: '📵' },
  mangLai: { nhan: 'Kết nối lại', mucDo: 'tin', icon: '📶' },
  dungYen: { nhan: 'Tiến độ đứng yên', mucDo: 'loi', icon: '⚠️' },
  nhietBatThuong: { nhan: 'Nhiệt bất thường', mucDo: 'loi', icon: '🔥' },
} as const;

export type LoaiSuKien = keyof typeof LOAI_SU_KIEN;

/** Thứ tự để so ngưỡng: tin < canhBao < loi. */
const THU_TU_MUC_DO: Record<string, number> = { tin: 0, canhBao: 1, loi: 2 };

export type SuKienMoi = {
  printerId: string;
  tenMay: string;
  loai: LoaiSuKien;
  tieuDe: string;
  noiDung: string;
  tienDo?: number | null;
  tenFile?: string | null;
  nhietVoi?: number | null;
  nhietBan?: number | null;
  /** Ghi đè mức độ mặc định của loại (VD lỗi nhẹ chỉ cảnh báo). */
  mucDo?: string;
};

export async function layCaiDat() {
  return prisma.caiDatThongBao.upsert({
    where: { id: 'default' },
    update: {},
    create: { id: 'default' },
  });
}

export async function luuCaiDat(input: {
  bat?: boolean;
  guiApp?: boolean;
  guiZalo?: boolean;
  zaloThreadId?: string | null;
  zaloTenHoiThoai?: string | null;
  loaiTat?: string[];
  nguongZalo?: string;
}) {
  await layCaiDat(); // bảo đảm dòng "default" tồn tại
  return prisma.caiDatThongBao.update({ where: { id: 'default' }, data: input });
}

/**
 * App gọi mỗi lần mở và mỗi lần Firebase xoay token. Khóa theo token nên gọi lại bao nhiêu lần cũng
 * chỉ có một dòng.
 */
export async function dangKyThietBi(input: { token: string; nenTang: string; tenMay?: string | null }) {
  return prisma.thietBiThongBao.upsert({
    where: { token: input.token },
    update: { nenTang: input.nenTang, tenMay: input.tenMay ?? undefined, hoatDong: true },
    create: { token: input.token, nenTang: input.nenTang, tenMay: input.tenMay ?? null },
  });
}

export async function huyDangKyThietBi(token: string) {
  await prisma.thietBiThongBao.deleteMany({ where: { token } });
}

/** Ghi sự kiện vào lịch sử rồi đẩy đi. Trả về dòng vừa ghi (đã cập nhật `daGui`). */
export async function ghiVaGuiSuKien(suKien: SuKienMoi) {
  const meta = LOAI_SU_KIEN[suKien.loai];
  const mucDo = suKien.mucDo || meta.mucDo;

  const dong = await prisma.suKienMayIn.create({
    data: {
      printerId: suKien.printerId,
      tenMay: suKien.tenMay,
      loai: suKien.loai,
      mucDo,
      tieuDe: suKien.tieuDe,
      noiDung: suKien.noiDung,
      tienDo: suKien.tienDo ?? null,
      tenFile: suKien.tenFile ?? null,
      nhietVoi: suKien.nhietVoi ?? null,
      nhietBan: suKien.nhietBan ?? null,
    },
  });

  const { daGui, loiGui } = await guiDi({
    loai: suKien.loai,
    mucDo,
    tieuDe: `${meta.icon} ${suKien.tieuDe}`,
    noiDung: suKien.noiDung,
    duLieu: {
      suKienId: dong.id,
      printerId: suKien.printerId,
      loai: suKien.loai,
    },
  });

  return prisma.suKienMayIn.update({
    where: { id: dong.id },
    data: { daGui, loiGui },
  });
}

/**
 * Đẩy một thông báo qua mọi kênh đang bật. `daGui` = true nếu **ít nhất một** kênh nhận được —
 * Zalo hỏng nhưng app đã kêu thì vẫn tính là tới tay người.
 */
export async function guiDi(input: {
  loai: string;
  mucDo: string;
  tieuDe: string;
  noiDung: string;
  duLieu?: Record<string, string>;
}): Promise<{ daGui: boolean; loiGui: string | null }> {
  const loi: string[] = [];
  let daGui = false;

  try {
    const caiDat = await layCaiDat();

    if (!caiDat.bat) return { daGui: false, loiGui: 'Thông báo đang tắt.' };
    if (caiDat.loaiTat.includes(input.loai)) return { daGui: false, loiGui: null };

    if (caiDat.guiApp) {
      const thietBi = await prisma.thietBiThongBao.findMany({ where: { hoatDong: true } });
      if (thietBi.length === 0) {
        loi.push('Chưa có máy nào đăng ký nhận thông báo.');
      } else {
        const kq = await guiFcm(
          thietBi.map((t) => t.token),
          {
            tieuDe: input.tieuDe,
            noiDung: input.noiDung,
            duLieu: input.duLieu,
            mucDo: input.mucDo,
          },
        );
        if (kq.thanhCong > 0) daGui = true;
        loi.push(...kq.loi);
        if (kq.tokenChet.length > 0) {
          // Không xóa hẳn: giữ dòng để còn biết máy nào đã rụng, và tránh app đăng ký lại tức thì
          // bằng chính token chết đó.
          await prisma.thietBiThongBao.updateMany({
            where: { token: { in: kq.tokenChet } },
            data: { hoatDong: false },
          });
        }
      }
    }

    const duNguong =
      (THU_TU_MUC_DO[input.mucDo] ?? 0) >= (THU_TU_MUC_DO[caiDat.nguongZalo] ?? 1);
    if (caiDat.guiZalo && caiDat.zaloThreadId && duNguong) {
      try {
        await guiTinNhan({
          threadId: caiDat.zaloThreadId,
          text: `${input.tieuDe}\n${input.noiDung}`,
        });
        daGui = true;
      } catch (e) {
        loi.push(`Zalo: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } catch (e) {
    loi.push(e instanceof Error ? e.message : String(e));
  }

  return { daGui, loiGui: loi.length > 0 ? loi.join(' | ') : null };
}

export async function layLichSu(input: { limit?: number; printerId?: string; tuNgay?: Date } = {}) {
  return prisma.suKienMayIn.findMany({
    where: {
      ...(input.printerId ? { printerId: input.printerId } : {}),
      ...(input.tuNgay ? { createdAt: { gte: input.tuNgay } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(input.limit ?? 100, 500),
  });
}
