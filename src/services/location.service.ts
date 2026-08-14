import prisma from '../utils/db';

export type { Result } from '../types/result';
import type { Result } from '../types/result';

export class LocationService {
  /**
   * Lấy danh sách tất cả các kho kèm số lượng cuộn nhựa và thông tin chi tiết
   */
  static async getLocations(): Promise<Result<any[]>> {
    try {
      const locations = await prisma.location.findMany({
        include: {
          spools: {
            include: {
              filament: true
            }
          }
        },
        orderBy: {
          createdAt: 'asc'
        }
      });
      return { success: true, data: locations };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Lỗi khi lấy danh sách kho' };
    }
  }

  /**
   * Tạo kho mới
   */
  static async createLocation(id: string, name: string): Promise<Result<any>> {
    try {
      const idClean = id.trim();
      const nameClean = name.trim();

      if (!idClean || !nameClean) {
        return { success: false, error: 'Mã ID kho và tên kho không được để trống' };
      }

      // Kiểm tra trùng ID
      const existing = await prisma.location.findUnique({
        where: { id: idClean }
      });

      if (existing) {
        return { success: false, error: `Mã ID kho "${idClean}" đã tồn tại. Vui lòng nhập ID duy nhất khác.` };
      }

      const location = await prisma.location.create({
        data: {
          id: idClean,
          name: nameClean
        }
      });

      return { success: true, data: location };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Lỗi khi tạo kho mới' };
    }
  }

  /**
   * Cập nhật tên kho
   */
  static async updateLocation(id: string, newName: string): Promise<Result<any>> {
    try {
      const nameClean = newName.trim();
      if (!nameClean) {
        return { success: false, error: 'Tên kho không được để trống' };
      }

      const location = await prisma.location.update({
        where: { id },
        data: {
          name: nameClean
        }
      });

      return { success: true, data: location };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Lỗi khi cập nhật tên kho' };
    }
  }

  /**
   * Xóa kho
   */
  static async deleteLocation(id: string): Promise<Result<boolean>> {
    try {
      await prisma.location.delete({
        where: { id }
      });
      return { success: true, data: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Lỗi khi xóa kho' };
    }
  }

  /**
   * Gán cuộn nhựa vào một kho cụ thể
   */
  static async assignSpoolToLocation(spoolId: string, locationId: string | null): Promise<Result<any>> {
    try {
      const spool = await prisma.spool.findUnique({
        where: { id: spoolId }
      });

      if (!spool) {
        return { success: false, error: 'Không tìm thấy cuộn nhựa cần gán kho' };
      }

      if (locationId) {
        // Kiểm tra xem kho có tồn tại không
        const location = await prisma.location.findUnique({
          where: { id: locationId }
        });
        if (!location) {
          return { success: false, error: 'Không tìm thấy kho chỉ định' };
        }
      }

      const updatedSpool = await prisma.spool.update({
        where: { id: spoolId },
        data: {
          locationId: locationId || null
        },
        include: {
          filament: true,
          location: true
        }
      });

      return { success: true, data: updatedSpool };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Lỗi khi gán cuộn nhựa vào kho' };
    }
  }
}
