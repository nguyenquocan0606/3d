import prisma from '../utils/db';
import { 
  FilamentInput, 
  SpoolInput, 
  SpoolUnifiedInput,
  FilamentWithSpools, 
  Spool, 
  DashboardStats 
} from '../types/filament.types';


export type { Result } from '../types/result';
import type { Result } from '../types/result';

export class FilamentService {
  /**
   * Lấy danh sách các loại nhựa kèm theo cuộn tương ứng
   */
  static async getFilaments(): Promise<Result<FilamentWithSpools[]>> {
    try {
      const filaments = await prisma.filament.findMany({
        include: {
          spools: {
            include: {
              location: true,
              printer: true,
            },
            orderBy: {
              createdAt: 'desc',
            },
          },
        },
        orderBy: {
          type: 'asc',
        },
      });
      return { success: true, data: filaments as FilamentWithSpools[] };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Lỗi không xác định khi lấy danh sách nhựa' };
    }
  }

  /**
   * Tạo loại nhựa mới
   */
  static async createFilament(input: FilamentInput): Promise<Result<any>> {
    try {
      const typeClean = input.type.trim();
      const colorClean = input.colorName.trim();
      const brandClean = input.brand?.trim() || null;

      // Kiểm tra xem đã tồn tại chưa
      const existing = await prisma.filament.findFirst({
        where: {
          type: { equals: typeClean, mode: 'insensitive' },
          colorName: { equals: colorClean, mode: 'insensitive' },
          brand: brandClean ? { equals: brandClean, mode: 'insensitive' } : null,
        },
      });

      if (existing) {
        return { success: false, error: 'Loại nhựa với màu sắc và thương hiệu này đã tồn tại' };
      }

      const filament = await prisma.filament.create({
        data: {
          type: typeClean,
          colorName: colorClean,
          colorHex: input.colorHex?.trim() || null,
          brand: brandClean,
        },
      });

      return { success: true, data: filament };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Lỗi khi tạo loại nhựa mới' };
    }
  }

  /**
   * Xóa loại nhựa
   */
  static async deleteFilament(id: string): Promise<Result<boolean>> {
    try {
      await prisma.filament.delete({
        where: { id },
      });
      return { success: true, data: true };
    } catch (error: any) {
      console.error('FilamentService.deleteFilament error:', error);
      return { success: false, error: 'Không thể xóa loại nhựa. Có thể đang có cuộn nhựa sử dụng loại này.' };
    }
  }

  /**
   * Cập nhật mã màu hex cho TẤT CẢ các loại nhựa có cùng colorName.
   * Do người dùng có thể gộp chung thẻ màu cho cả PLA, PETG... cùng tên màu.
   */
  static async updateFilamentColor(colorName: string, colorHex: string): Promise<Result<boolean>> {
    try {
      await prisma.filament.updateMany({
        where: { colorName },
        data: { colorHex },
      });
      return { success: true, data: true };
    } catch (error: any) {
      console.error('FilamentService.updateFilamentColor error:', error);
      return { success: false, error: 'Lỗi khi cập nhật mã màu.' };
    }
  }

  /**
   * Thêm cuộn nhựa mới
   */
  static async createSpool(input: SpoolInput): Promise<Result<Spool>> {
    try {
      const spoolIdClean = input.id.trim();

      // Kiểm tra trùng ID
      const existingSpool = await prisma.spool.findUnique({
        where: { id: spoolIdClean },
      });

      if (existingSpool) {
        return { success: false, error: `ID cuộn nhựa "${spoolIdClean}" đã tồn tại. Vui lòng nhập ID duy nhất khác.` };
      }

      // Kiểm tra filamentId hợp lệ
      const filament = await prisma.filament.findUnique({
        where: { id: input.filamentId },
      });

      if (!filament) {
        return { success: false, error: 'Không tìm thấy loại nhựa tương ứng với cuộn nhựa này' };
      }

      const spool = await prisma.spool.create({
        data: {
          id: spoolIdClean,
          filamentId: input.filamentId,
          locationId: input.locationId || null,
          initialWeightG: input.initialWeightG,
          emptySpoolWeightG: input.emptySpoolWeightG ?? 220,
          remainingWeightG: input.remainingWeightG,
          status: input.status ?? 'active',
        },
      });

      return { success: true, data: spool as Spool };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Lỗi khi tạo cuộn nhựa mới' };
    }
  }

  /**
   * Hợp nhất thêm cuộn nhựa & tự động giải quyết loại nhựa
   */
  static async createSpoolUnified(input: SpoolUnifiedInput): Promise<Result<Spool>> {
    try {
      const spoolIdClean = input.id.trim();

      // 1. Kiểm tra trùng ID cuộn nhựa trước
      const existingSpool = await prisma.spool.findUnique({
        where: { id: spoolIdClean },
      });

      if (existingSpool) {
        return { success: false, error: `ID cuộn nhựa "${spoolIdClean}" đã tồn tại. Vui lòng nhập ID duy nhất khác.` };
      }

      let filamentId = input.filamentId;

      // 2. Nếu không truyền filamentId trực tiếp, tìm kiếm hoặc tạo mới dựa trên loại/màu/hãng
      if (!filamentId) {
        if (!input.type || !input.colorName) {
          return { success: false, error: 'Loại nhựa và màu sắc là bắt buộc để tìm hoặc tạo loại nhựa' };
        }

        const typeClean = input.type.trim();
        const colorClean = input.colorName.trim();
        const brandClean = input.brand?.trim() || null;

        let filament = await prisma.filament.findFirst({
          where: {
            type: { equals: typeClean, mode: 'insensitive' },
            colorName: { equals: colorClean, mode: 'insensitive' },
            brand: brandClean ? { equals: brandClean, mode: 'insensitive' } : null,
          },
        });

        if (!filament) {
          // Chưa có thì tạo mới loại nhựa
          filament = await prisma.filament.create({
            data: {
              type: typeClean,
              colorName: colorClean,
              colorHex: input.colorHex?.trim() || null,
              brand: brandClean,
            },
          });
        }
        
        filamentId = filament.id;
      } else {
        // Kiểm tra filamentId có tồn tại hay không
        const filament = await prisma.filament.findUnique({
          where: { id: filamentId },
        });

        if (!filament) {
          return { success: false, error: 'Không tìm thấy loại nhựa tương ứng với cuộn nhựa này' };
        }
      }

      // Mutual exclusive logic
      let finalLocationId = input.locationId || null;
      let finalPrinterId = input.printerId || null;

      if (finalLocationId) finalPrinterId = null;
      if (finalPrinterId) finalLocationId = null;

      // 3. Tạo cuộn nhựa mới liên kết với filament này
      const spool = await prisma.spool.create({
        data: {
          id: spoolIdClean,
          filamentId: filamentId,
          locationId: finalLocationId,
          printerId: finalPrinterId,
          initialWeightG: input.initialWeightG,
          emptySpoolWeightG: input.emptySpoolWeightG ?? 220,
          remainingWeightG: input.remainingWeightG,
          status: input.status ?? 'active',
        },
      });

      return { success: true, data: spool as Spool };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Lỗi khi tạo cuộn nhựa' };
    }
  }


  /**
   * Cập nhật khối lượng nhựa còn lại của một cuộn
   */
  static async updateSpoolWeight(spoolId: string, remainingWeightG: number): Promise<Result<Spool>> {
    try {
      const spool = await prisma.spool.findUnique({
        where: { id: spoolId },
      });

      if (!spool) {
        return { success: false, error: 'Không tìm thấy cuộn nhựa cần cập nhật' };
      }

      if (remainingWeightG < 0) {
        return { success: false, error: 'Khối lượng nhựa còn lại không thể âm' };
      }

      if (remainingWeightG > spool.initialWeightG) {
        return { success: false, error: `Khối lượng còn lại không thể vượt quá khối lượng ban đầu (${spool.initialWeightG}g)` };
      }

      // Chỉ tự động đổi trạng thái giữa active <-> depleted theo khối lượng.
      // Cuộn archived giữ nguyên archived (không tự "hồi sinh" khi cân lại).
      let newStatus = spool.status;
      if (remainingWeightG === 0) {
        newStatus = 'depleted';
      } else if (spool.status === 'depleted') {
        newStatus = 'active';
      }

      const updatedSpool = await prisma.spool.update({
        where: { id: spoolId },
        data: {
          remainingWeightG,
          status: newStatus,
        },
      });

      return { success: true, data: updatedSpool as Spool };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Lỗi khi cập nhật khối lượng cuộn nhựa' };
    }
  }

  /**
   * Cập nhật thông tin chi tiết một cuộn nhựa
   */
  static async updateSpool(
    spoolId: string,
    data: {
      id?: string;
      brand?: string;
      locationId?: string | null;
      printerId?: string | null;
      printerSlot?: number | null;
      initialWeightG?: number;
      emptySpoolWeightG?: number;
      remainingWeightG?: number;
      status?: string;
    }
  ): Promise<Result<Spool>> {
    try {
      const spool = await prisma.spool.findUnique({
        where: { id: spoolId },
        include: { filament: true },
      });

      if (!spool) {
        return { success: false, error: 'Không tìm thấy cuộn nhựa cần cập nhật' };
      }

      const newId = data.id?.trim();
      if (newId && newId !== spoolId) {
        const existingSpool = await prisma.spool.findUnique({
          where: { id: newId },
        });
        if (existingSpool) {
          return { success: false, error: `Mã ID "${newId}" đã tồn tại trên một cuộn nhựa khác.` };
        }
      }

      // Xử lý đổi thương hiệu (brand) độc lập cho cuộn nhựa
      let filamentId = spool.filamentId;
      const brandNew = data.brand !== undefined ? data.brand.trim() : null;
      const brandOld = spool.filament.brand;

      if (data.brand !== undefined && brandNew !== brandOld) {
        const type = spool.filament.type;
        const colorName = spool.filament.colorName;
        const colorHex = spool.filament.colorHex;

        // Tìm loại nhựa trùng khớp với type, colorName và brand mới
        let targetFilament = await prisma.filament.findFirst({
          where: {
            type: { equals: type, mode: 'insensitive' },
            colorName: { equals: colorName, mode: 'insensitive' },
            brand: brandNew ? { equals: brandNew, mode: 'insensitive' } : null,
          },
        });

        if (!targetFilament) {
          // Tạo mới loại nhựa nếu chưa có
          targetFilament = await prisma.filament.create({
            data: {
              type,
              colorName,
              colorHex,
              brand: brandNew || null,
            },
          });
        }
        filamentId = targetFilament.id;
      }

      const initialWeightG = data.initialWeightG !== undefined ? data.initialWeightG : spool.initialWeightG;
      const remainingWeightG = data.remainingWeightG !== undefined ? data.remainingWeightG : spool.remainingWeightG;

      if (remainingWeightG < 0) {
        return { success: false, error: 'Khối lượng nhựa còn lại không thể âm' };
      }

      if (remainingWeightG > initialWeightG) {
        return { success: false, error: `Khối lượng còn lại không thể vượt quá khối lượng ban đầu (${initialWeightG}g)` };
      }

      // Mutual exclusive: gán vào kho → xóa printerId, gán vào máy in → xóa locationId
      let finalLocationId = data.locationId !== undefined ? data.locationId : undefined;
      let finalPrinterId = data.printerId !== undefined ? data.printerId : undefined;

      if (finalLocationId && finalLocationId !== null) {
        finalPrinterId = null; // Gán vào kho → tháo khỏi máy in
      }
      if (finalPrinterId && finalPrinterId !== null) {
        finalLocationId = null; // Gán vào máy in → tháo khỏi kho
      }

      const updatedSpool = await prisma.spool.update({
        where: { id: spoolId },
        data: {
          id: newId || undefined,
          filamentId,
          locationId: finalLocationId,
          printerId: finalPrinterId,
          printerSlot: finalPrinterId ? (data.printerSlot !== undefined ? data.printerSlot : undefined) : null,
          initialWeightG,
          emptySpoolWeightG: data.emptySpoolWeightG !== undefined ? data.emptySpoolWeightG : spool.emptySpoolWeightG,
          remainingWeightG,
          status: data.status || (remainingWeightG === 0 ? 'depleted' : spool.status),
        },
      });

      return { success: true, data: updatedSpool as Spool };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Lỗi khi cập nhật cuộn nhựa' };
    }
  }

  /**
   * Xóa cuộn nhựa
   */
  static async deleteSpool(id: string): Promise<Result<boolean>> {
    try {
      await prisma.spool.delete({
        where: { id },
      });
      return { success: true, data: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Lỗi khi xóa cuộn nhựa' };
    }
  }

  /**
   * Tính toán thống kê Dashboard
   */
  static async getDashboardStats(): Promise<Result<DashboardStats>> {
    try {
      const spools = await prisma.spool.findMany({
        include: {
          filament: true,
        },
      });

      const totalSpools = spools.length;
      const activeSpools = spools.filter(s => s.status === 'active').length;
      const depletedSpools = spools.filter(s => s.status === 'depleted').length;
      const lowSpools = spools.filter(s => s.status === 'active' && (s.remainingWeightG / s.initialWeightG) < 0.2).length;
      const totalRemainingWeightG = spools.reduce((acc, s) => acc + s.remainingWeightG, 0);

      const spoolsByMaterialType: Record<string, number> = {};
      const spoolsByColor: Record<string, number> = {};

      spools.forEach(s => {
        const type = s.filament.type;
        spoolsByMaterialType[type] = (spoolsByMaterialType[type] || 0) + 1;

        const color = s.filament.colorName;
        spoolsByColor[color] = (spoolsByColor[color] || 0) + 1;
      });

      const stats: DashboardStats = {
        totalSpools,
        activeSpools,
        depletedSpools,
        lowSpools,
        totalRemainingWeightG,
        spoolsByMaterialType,
        spoolsByColor,
      };

      return { success: true, data: stats };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Lỗi khi lấy thông số Dashboard' };
    }
  }
}
