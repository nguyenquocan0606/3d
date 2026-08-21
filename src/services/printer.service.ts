import prisma from '../utils/db';
import { Prisma } from '@prisma/client';
import { PrinterInput, Printer, Spool } from '../types/filament.types';
import { printerManager } from './printer-integration/PrinterManager';
import { thuKetNoi } from './printer-integration/providers/bambu';

export type { Result } from '../types/result';
import type { Result } from '../types/result';


/** Ba trường phải đi cùng nhau thì mới nối MQTT được. */
type CauHinhLan = { lanIp?: string | null; lanAccessCode?: string | null; lanSerial?: string | null };

/**
 * Access Code là mật khẩu vào máy in. Đừng bao giờ để nó ra khỏi máy chủ — client chỉ cần biết
 * "đã có mã chưa" để hiện đúng trạng thái ô nhập.
 */
export function giauAccessCode<T extends { lanAccessCode?: string | null }>(may: T): Omit<T, 'lanAccessCode'> & { coAccessCode: boolean } {
  const { lanAccessCode, ...conLai } = may;
  return { ...conLai, coAccessCode: Boolean(lanAccessCode) };
}

/**
 * Tài khoản Bambu duy nhất. Nó không còn là "tài khoản cloud" theo nghĩa cũ nữa — chỉ còn giữ URL
 * và token của Home Assistant để làm đường dự phòng, còn thông tin đăng nhập từng máy nằm ở
 * chính dòng máy in đó.
 */
async function layTaiKhoanBambu(): Promise<string> {
  const co = await prisma.cloudAccount.findFirst({ where: { provider: 'bambu' } });
  if (co) return co.id;
  const moi = await prisma.cloudAccount.create({
    data: { provider: 'bambu', email: '', token: '' },
  });
  return moi.id;
}

/**
 * Kiểm tra thật rồi mới cho lưu. Sai Access Code trông y hệt máy mất điện, không thử ngay lúc bấm
 * Lưu thì người dùng sẽ ngồi chờ một thông báo không bao giờ tới.
 */
async function kiemTraLan(ip: string, accessCode: string, serial: string): Promise<string | null> {
  const kq = await thuKetNoi(ip, accessCode, serial);
  return kq.ok ? null : (kq.loi ?? 'Không nối được máy in.');
}

/**
 * Gom ba trường LAN thành thứ sẵn sàng ghi xuống DB.
 *
 * Quy ước khi sửa máy: ô Access Code để trống nghĩa là **giữ mã cũ**, không phải xoá mã. Bắt gõ lại
 * mật khẩu mỗi lần đổi cái tên máy thì chẳng ai chịu nổi.
 */
function gomCauHinhLan(moi: CauHinhLan, cu: CauHinhLan): { lanIp: string; lanSerial: string; lanAccessCode: string } | null {
  // IP và ID: client GỬI khóa nghĩa là "đặt thành cái này", kể cả rỗng — nhờ vậy xoá trống ô rồi
  // Lưu là gỡ được kết nối trực tiếp, quay về chỉ đọc qua Home Assistant. Không gửi khóa thì giữ
  // nguyên (dùng cho lời gọi chỉ đổi mỗi tên máy).
  const ip = ('lanIp' in moi ? moi.lanIp ?? '' : cu.lanIp ?? '').trim();
  const serial = ('lanSerial' in moi ? moi.lanSerial ?? '' : cu.lanSerial ?? '').trim();
  // Access Code thì ngược lại: rỗng = GIỮ mã cũ. Máy chủ không trả mã đã lưu về client nên không
  // điền sẵn vào ô được, bắt gõ lại mật khẩu mỗi lần sửa tên máy thì chẳng ai chịu nổi.
  const code = (moi.lanAccessCode || cu.lanAccessCode || '').trim();
  if (!ip || !serial || !code) return null;
  return { lanIp: ip, lanSerial: serial, lanAccessCode: code };
}

export class PrinterService {
  /**
   * Lấy danh sách máy in kèm cuộn nhựa đang gắn
   */
  static async getPrinters(): Promise<Result<Printer[]>> {
    try {
      const printers = await prisma.printer.findMany({
        include: {
          spools: {
            include: {
              filament: true,
            },
            orderBy: {
              createdAt: 'desc',
            },
          },
          tasks: {
            where: {
              status: 'printing'
            },
            orderBy: {
              createdAt: 'desc'
            },
            take: 1
          },
          // KHÔNG trả field token về client (Long-Lived Access Token của Home Assistant)
          cloudAccount: {
            select: { id: true, provider: true, email: true, isActive: true }
          }
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
      return { success: true, data: printers.map(giauAccessCode) as unknown as Printer[] };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Lỗi khi lấy danh sách máy in' };
    }
  }

  /**
   * Tạo máy in mới
   */
  static async createPrinter(input: PrinterInput): Promise<Result<Printer>> {
    try {
      const idClean = input.id.trim();
      const nameClean = input.name.trim();

      // Kiểm tra trùng ID
      const existing = await prisma.printer.findUnique({
        where: { id: idClean },
      });

      if (existing) {
        return { success: false, error: `Máy in với ID "${idClean}" đã tồn tại.` };
      }

      const lan = gomCauHinhLan(input, {});
      if (lan) {
        const loi = await kiemTraLan(lan.lanIp, lan.lanAccessCode, lan.lanSerial);
        if (loi) return { success: false, error: loi };
      }

      // Máy chỉ được provider ngó tới khi có cloudPrinterId. Chưa khai ID phía Home Assistant thì
      // lấy luôn serial làm khóa — vẫn chạy MQTT bình thường, chỉ là không có đường dự phòng.
      const khoa = input.cloudPrinterId?.trim() || lan?.lanSerial || null;
      const taiKhoan = khoa ? await layTaiKhoanBambu() : null;

      const printer = await prisma.printer.create({
        data: {
          id: idClean,
          name: nameClean,
          model: input.model?.trim() || null,
          status: input.status ?? 'idle',
          lanIp: lan?.lanIp ?? null,
          lanAccessCode: lan?.lanAccessCode ?? null,
          lanSerial: lan?.lanSerial ?? null,
          cloudPrinterId: khoa,
          cloudAccountId: taiKhoan,
        },
      });

      // Provider giữ danh sách máy trong RAM từ lúc connect() nên phải gỡ để nó dựng lại.
      if (taiKhoan) printerManager.removeProvider(taiKhoan);

      return { success: true, data: giauAccessCode(printer) as unknown as Printer };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Lỗi khi tạo máy in mới' };
    }
  }

  /**
   * Cập nhật thông tin máy in
   */
  static async updatePrinter(
    id: string,
    data: { name?: string; model?: string | null; status?: string } & CauHinhLan & { cloudPrinterId?: string | null }
  ): Promise<Result<Printer>> {
    try {
      const printer = await prisma.printer.findUnique({
        where: { id },
      });

      if (!printer) {
        return { success: false, error: 'Không tìm thấy máy in cần cập nhật' };
      }

      const lan = gomCauHinhLan(data, printer);
      // Chỉ thử kết nối khi thông tin thật sự đổi — đổi mỗi cái tên máy mà phải chờ 15 giây dò MQTT
      // thì quá phiền.
      const doiKetNoi =
        lan !== null &&
        (lan.lanIp !== printer.lanIp ||
          lan.lanSerial !== printer.lanSerial ||
          lan.lanAccessCode !== printer.lanAccessCode);
      if (doiKetNoi) {
        const loi = await kiemTraLan(lan.lanIp, lan.lanAccessCode, lan.lanSerial);
        if (loi) return { success: false, error: loi };
      }

      const khoa = data.cloudPrinterId !== undefined
        ? (data.cloudPrinterId?.trim() || lan?.lanSerial || null)
        : (printer.cloudPrinterId ?? lan?.lanSerial ?? null);
      const taiKhoan = khoa ? (printer.cloudAccountId ?? (await layTaiKhoanBambu())) : null;

      const updated = await prisma.printer.update({
        where: { id },
        data: {
          name: data.name?.trim() || undefined,
          // Client gửi model: null khi ô Model để trống → xóa model, đừng gọi .trim() trên null
          model: data.model !== undefined ? (data.model?.trim() || null) : undefined,
          status: data.status || undefined,
          lanIp: lan?.lanIp ?? null,
          lanAccessCode: lan?.lanAccessCode ?? null,
          lanSerial: lan?.lanSerial ?? null,
          cloudPrinterId: khoa,
          cloudAccountId: taiKhoan,
        },
        include: {
          spools: {
            include: { filament: true },
          },
        },
      });

      if (taiKhoan) printerManager.removeProvider(taiKhoan);

      return { success: true, data: giauAccessCode(updated) as unknown as Printer };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Lỗi khi cập nhật máy in' };
    }
  }

  /**
   * Xóa máy in (cuộn nhựa gắn trên máy → printerId = null nhờ onDelete: SetNull)
   */
  static async deletePrinter(id: string): Promise<Result<boolean>> {
    try {
      await prisma.printer.delete({
        where: { id },
      });
      return { success: true, data: true };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          return { success: false, error: 'Máy in không tồn tại hoặc đã bị xóa' };
        }
        if (error.code === 'P2003') {
          return { success: false, error: 'Không thể xóa máy in vì vẫn còn dữ liệu liên quan tham chiếu tới nó' };
        }
      }
      return { success: false, error: error instanceof Error ? error.message : 'Lỗi khi xóa máy in' };
    }
  }

  /**
   * Gán cuộn nhựa vào máy in + tự động xóa locationId (mutual exclusive)
   */
  static async assignSpoolToPrinter(spoolId: string, printerId: string): Promise<Result<Spool>> {
    try {
      const spool = await prisma.spool.findUnique({
        where: { id: spoolId },
      });

      if (!spool) {
        return { success: false, error: `Không tìm thấy cuộn nhựa "${spoolId}"` };
      }

      const printer = await prisma.printer.findUnique({
        where: { id: printerId },
      });

      if (!printer) {
        return { success: false, error: `Không tìm thấy máy in "${printerId}"` };
      }

      // Mutual exclusive: gán vào máy in → xóa khỏi kho
      const updated = await prisma.spool.update({
        where: { id: spoolId },
        data: {
          printerId: printerId,
          locationId: null,  // Xóa khỏi kho
        },
        include: {
          filament: true,
          printer: true,
          location: true,
        },
      });

      return { success: true, data: updated as unknown as Spool };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Lỗi khi gán cuộn nhựa vào máy in' };
    }
  }

  /**
   * Tháo cuộn nhựa khỏi máy in
   */
  static async unassignSpoolFromPrinter(spoolId: string): Promise<Result<Spool>> {
    try {
      const spool = await prisma.spool.findUnique({
        where: { id: spoolId },
      });

      if (!spool) {
        return { success: false, error: `Không tìm thấy cuộn nhựa "${spoolId}"` };
      }

      if (!spool.printerId) {
        return { success: false, error: `Cuộn nhựa "${spoolId}" hiện không được gán vào máy in nào.` };
      }

      const updated = await prisma.spool.update({
        where: { id: spoolId },
        data: {
          printerId: null,
        },
        include: {
          filament: true,
          printer: true,
          location: true,
        },
      });

      return { success: true, data: updated as unknown as Spool };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Lỗi khi tháo cuộn nhựa khỏi máy in' };
    }
  }
}
// Trigger rebuild
