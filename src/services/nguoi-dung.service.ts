import prisma from '@/utils/db';
import { PhienDangNhap, VaiTro, bamMatKhau, docToken, kiemTraMatKhau } from '@/utils/auth';
import { TEN_COOKIE_PHIEN } from '@/utils/auth';

/** Bản gọn của người dùng để trả ra API — không bao giờ kèm `matKhauBam`. */
export interface NguoiDungGon {
  id: string;
  tenDangNhap: string;
  hoTen: string;
  vaiTro: VaiTro;
  hoatDong: boolean;
  lanDangNhapCuoi: Date | null;
  createdAt: Date;
}

const CHON_GON = {
  id: true,
  tenDangNhap: true,
  hoTen: true,
  vaiTro: true,
  hoatDong: true,
  lanDangNhapCuoi: true,
  createdAt: true,
} as const;

function chuanHoaTen(tenDangNhap: string): string {
  return tenDangNhap.trim().toLowerCase();
}

export const NguoiDungService = {
  /**
   * Đọc phiên đăng nhập từ cookie của request. Dùng trong route handler `/api/*`
   * (middleware không chặn `/api/*` nên route nào cần quyền phải tự kiểm tra).
   */
  async layPhien(request: Request): Promise<PhienDangNhap | null> {
    const cookie = request.headers.get('cookie');
    if (!cookie) return null;
    const phanTu = cookie.split(';').map((m) => m.trim());
    const muc = phanTu.find((m) => m.startsWith(`${TEN_COOKIE_PHIEN}=`));
    if (!muc) return null;
    return docToken(decodeURIComponent(muc.slice(TEN_COOKIE_PHIEN.length + 1)));
  },

  /** Trả về người dùng nếu đúng mật khẩu và tài khoản còn hoạt động, ngược lại `null`. */
  async xacThuc(tenDangNhap: string, matKhau: string): Promise<NguoiDungGon | null> {
    const nguoiDung = await prisma.nguoiDung.findUnique({ where: { tenDangNhap: chuanHoaTen(tenDangNhap) } });
    // Sai tên và sai mật khẩu trả cùng một kết quả — không tiết lộ tên nào có thật.
    if (!nguoiDung || !nguoiDung.hoatDong) return null;
    if (!(await kiemTraMatKhau(matKhau, nguoiDung.matKhauBam))) return null;

    await prisma.nguoiDung.update({ where: { id: nguoiDung.id }, data: { lanDangNhapCuoi: new Date() } });

    // Dựng lại thủ công thay vì trải nguyên bản ghi — chắc chắn `matKhauBam` không lọt ra ngoài.
    return {
      id: nguoiDung.id,
      tenDangNhap: nguoiDung.tenDangNhap,
      hoTen: nguoiDung.hoTen,
      vaiTro: nguoiDung.vaiTro as VaiTro,
      hoatDong: nguoiDung.hoatDong,
      lanDangNhapCuoi: nguoiDung.lanDangNhapCuoi,
      createdAt: nguoiDung.createdAt,
    };
  },

  async danhSach(): Promise<NguoiDungGon[]> {
    const ds = await prisma.nguoiDung.findMany({ select: CHON_GON, orderBy: { createdAt: 'asc' } });
    return ds as NguoiDungGon[];
  },

  async taoMoi(input: { tenDangNhap: string; hoTen: string; matKhau: string; vaiTro: VaiTro }): Promise<NguoiDungGon> {
    const nguoiDung = await prisma.nguoiDung.create({
      data: {
        tenDangNhap: chuanHoaTen(input.tenDangNhap),
        hoTen: input.hoTen.trim(),
        matKhauBam: await bamMatKhau(input.matKhau),
        vaiTro: input.vaiTro,
      },
      select: CHON_GON,
    });
    return nguoiDung as NguoiDungGon;
  },

  async capNhat(
    id: string,
    thayDoi: { hoTen?: string; vaiTro?: VaiTro; hoatDong?: boolean; matKhau?: string },
  ): Promise<NguoiDungGon> {
    const nguoiDung = await prisma.nguoiDung.update({
      where: { id },
      data: {
        ...(thayDoi.hoTen !== undefined ? { hoTen: thayDoi.hoTen.trim() } : {}),
        ...(thayDoi.vaiTro !== undefined ? { vaiTro: thayDoi.vaiTro } : {}),
        ...(thayDoi.hoatDong !== undefined ? { hoatDong: thayDoi.hoatDong } : {}),
        ...(thayDoi.matKhau ? { matKhauBam: await bamMatKhau(thayDoi.matKhau) } : {}),
      },
      select: CHON_GON,
    });
    return nguoiDung as NguoiDungGon;
  },

  async xoa(id: string): Promise<void> {
    await prisma.nguoiDung.delete({ where: { id } });
  },

  /** Số admin đang hoạt động — dùng để chặn thao tác làm mất admin cuối cùng. */
  async soAdminHoatDong(): Promise<number> {
    return prisma.nguoiDung.count({ where: { vaiTro: 'admin', hoatDong: true } });
  },

  /** Đổi mật khẩu chính mình, bắt buộc nhập đúng mật khẩu cũ. */
  async doiMatKhauCuaToi(id: string, matKhauCu: string, matKhauMoi: string): Promise<boolean> {
    const nguoiDung = await prisma.nguoiDung.findUnique({ where: { id } });
    if (!nguoiDung) return false;
    if (!(await kiemTraMatKhau(matKhauCu, nguoiDung.matKhauBam))) return false;
    await prisma.nguoiDung.update({ where: { id }, data: { matKhauBam: await bamMatKhau(matKhauMoi) } });
    return true;
  },
};
