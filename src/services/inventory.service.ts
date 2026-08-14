import prisma from '@/utils/db';

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export class InventoryService {
  /**
   * Retrieves the current active inventory check session,
   * creating one if none exists.
   */
  static async getActiveSession(): Promise<ServiceResult<any>> {
    try {
      let session = await prisma.inventorySession.findFirst({
        where: { active: true },
        include: {
          items: {
            orderBy: { scannedAt: 'desc' }
          }
        }
      });

      if (!session) {
        session = await prisma.inventorySession.create({
          data: { active: true },
          include: {
            items: true
          }
        });
      }

      return { success: true, data: session };
    } catch (error) {
      console.error('Error getting active session:', error);
      return { success: false, error: 'Lỗi cơ sở dữ liệu khi truy vấn phiên kiểm kho' };
    }
  }

  /**
   * Scans a spool by ID and records it in the active session.
   */
  static async scanSpool(spoolId: string): Promise<ServiceResult<any>> {
    try {
      const normalizedSpoolId = spoolId.trim();

      // Check if spool exists in db
      const spool = await prisma.spool.findUnique({
        where: { id: normalizedSpoolId },
        include: {
          filament: true
        }
      });

      if (!spool) {
        return { success: false, error: `Cuộn nhựa có mã "${spoolId}" không tồn tại trong hệ thống` };
      }

      // Get active session
      const sessionResult = await this.getActiveSession();
      if (!sessionResult.success || !sessionResult.data) {
        return { success: false, error: sessionResult.error };
      }
      const session = sessionResult.data;

      // Upsert inventory item to avoid duplication
      const item = await prisma.inventoryItem.upsert({
        where: {
          sessionId_spoolId: {
            sessionId: session.id,
            spoolId: spool.id
          }
        },
        update: {
          scannedAt: new Date() // update timestamp on rescanning
        },
        create: {
          sessionId: session.id,
          spoolId: spool.id
        }
      });

      return {
        success: true,
        data: {
          item,
          spool: {
            id: spool.id,
            filamentType: spool.filament.type,
            filamentColorName: spool.filament.colorName,
            filamentColorHex: spool.filament.colorHex,
            filamentBrand: spool.filament.brand,
            remainingWeightG: spool.remainingWeightG
          }
        }
      };
    } catch (error) {
      console.error('Error scanning spool:', error);
      return { success: false, error: 'Lỗi cơ sở dữ liệu khi quét cuộn nhựa' };
    }
  }

  /**
   * Resets the current inventory check by archiving (active = false)
   * the active session and spawning a new active session.
   */
  static async resetSession(): Promise<ServiceResult<any>> {
    try {
      // Find and deactivate current active sessions
      await prisma.inventorySession.updateMany({
        where: { active: true },
        data: { active: false }
      });

      // Create new active session
      const newSession = await prisma.inventorySession.create({
        data: { active: true },
        include: {
          items: true
        }
      });

      return { success: true, data: newSession };
    } catch (error) {
      console.error('Error resetting session:', error);
      return { success: false, error: 'Lỗi cơ sở dữ liệu khi làm mới phiên kiểm kho' };
    }
  }
}
