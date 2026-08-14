import prisma from '../utils/db';
import { Prisma } from '@prisma/client';
import { PrinterInput, Printer, Spool } from '../types/filament.types';

export type { Result } from '../types/result';
import type { Result } from '../types/result';

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
      return { success: true, data: printers as unknown as Printer[] };
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

      const printer = await prisma.printer.create({
        data: {
          id: idClean,
          name: nameClean,
          model: input.model?.trim() || null,
          status: input.status ?? 'idle',
        },
      });

      return { success: true, data: printer as unknown as Printer };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Lỗi khi tạo máy in mới' };
    }
  }

  /**
   * Cập nhật thông tin máy in
   */
  static async updatePrinter(
    id: string,
    data: { name?: string; model?: string; status?: string }
  ): Promise<Result<Printer>> {
    try {
      const printer = await prisma.printer.findUnique({
        where: { id },
      });

      if (!printer) {
        return { success: false, error: 'Không tìm thấy máy in cần cập nhật' };
      }

      const updated = await prisma.printer.update({
        where: { id },
        data: {
          name: data.name?.trim() || undefined,
          model: data.model !== undefined ? (data.model.trim() || null) : undefined,
          status: data.status || undefined,
        },
        include: {
          spools: {
            include: { filament: true },
          },
        },
      });

      return { success: true, data: updated as unknown as Printer };
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
