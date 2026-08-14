import { describe, it, expect, vi, beforeEach } from 'vitest';
import prisma from '../../utils/db';
import { FilamentService } from '../filament.service';

// Mock Prisma Client
vi.mock('../../utils/db', () => ({
  default: {
    filament: {
      findFirst: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
    },
    spool: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

describe('FilamentService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createFilament', () => {
    it('nên tạo loại nhựa mới thành công (happy path)', async () => {
      // Arrange
      const input = {
        type: 'PLA',
        colorName: 'Đỏ',
        colorHex: '#FF0000',
        brand: 'eSun',
      };
      const mockFilament = {
        id: 'filament-id-123',
        ...input,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(prisma.filament.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.filament.create).mockResolvedValue(mockFilament);

      // Act
      const result = await FilamentService.createFilament(input);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockFilament);
      }
      expect(prisma.filament.findFirst).toHaveBeenCalledWith({
        where: {
          type: { equals: 'PLA', mode: 'insensitive' },
          colorName: { equals: 'Đỏ', mode: 'insensitive' },
          brand: { equals: 'eSun', mode: 'insensitive' },
        },
      });
      expect(prisma.filament.create).toHaveBeenCalled();
    });

    it('nên thất bại khi loại nhựa đã tồn tại (error path)', async () => {
      // Arrange
      const input = {
        type: 'PLA',
        colorName: 'Đỏ',
        brand: 'eSun',
      };
      const existingFilament = {
        id: 'filament-id-existing',
        ...input,
        colorHex: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(prisma.filament.findFirst).mockResolvedValue(existingFilament);

      // Act
      const result = await FilamentService.createFilament(input);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('đã tồn tại');
      }
      expect(prisma.filament.create).not.toHaveBeenCalled();
    });
  });

  describe('createSpool', () => {
    it('nên thêm cuộn nhựa mới thành công (happy path)', async () => {
      // Arrange
      const input = {
        id: 'PLA-RED-001',
        filamentId: 'filament-id-123',
        initialWeightG: 1000,
        emptySpoolWeightG: 220,
        remainingWeightG: 1000,
      };
      const mockSpool = {
        ...input,
        locationId: null,
        printerId: null,
        printerSlot: null,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(prisma.spool.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.filament.findUnique as any).mockResolvedValue({ id: 'filament-id-123' });
      vi.mocked(prisma.spool.create).mockResolvedValue(mockSpool);

      // Act
      const result = await FilamentService.createSpool(input);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockSpool);
      }
      expect(prisma.spool.findUnique).toHaveBeenCalledWith({ where: { id: 'PLA-RED-001' } });
      expect(prisma.spool.create).toHaveBeenCalled();
    });

    it('nên thất bại khi ID cuộn nhựa bị trùng (error path)', async () => {
      // Arrange
      const input = {
        id: 'PLA-RED-001',
        filamentId: 'filament-id-123',
        initialWeightG: 1000,
        remainingWeightG: 1000,
      };
      const existingSpool = {
        ...input,
        emptySpoolWeightG: 220,
        locationId: null,
        printerId: null,
        printerSlot: null,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(prisma.spool.findUnique).mockResolvedValue(existingSpool);

      // Act
      const result = await FilamentService.createSpool(input);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('đã tồn tại');
      }
      expect(prisma.spool.create).not.toHaveBeenCalled();
    });
  });

  describe('createSpoolUnified', () => {
    it('nên tạo cuộn nhựa mới kèm loại nhựa mới thành công (happy path)', async () => {
      // Arrange
      const input = {
        id: 'PLA-NEW-001',
        type: 'PLA',
        colorName: 'Xanh Lá',
        colorHex: '#00FF00',
        brand: 'eSun',
        initialWeightG: 1000,
        emptySpoolWeightG: 220,
        remainingWeightG: 1000,
      };
      const mockFilament = {
        id: 'filament-new-id',
        type: 'PLA',
        colorName: 'Xanh Lá',
        colorHex: '#00FF00',
        brand: 'eSun',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const mockSpool = {
        id: 'PLA-NEW-001',
        filamentId: 'filament-new-id',
        locationId: null,
        printerId: null,
        printerSlot: null,
        initialWeightG: 1000,
        emptySpoolWeightG: 220,
        remainingWeightG: 1000,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(prisma.spool.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.filament.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.filament.create).mockResolvedValue(mockFilament);
      vi.mocked(prisma.spool.create).mockResolvedValue(mockSpool);

      // Act
      const result = await FilamentService.createSpoolUnified(input);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockSpool);
      }
      expect(prisma.spool.findUnique).toHaveBeenCalledWith({ where: { id: 'PLA-NEW-001' } });
      expect(prisma.filament.findFirst).toHaveBeenCalled();
      expect(prisma.filament.create).toHaveBeenCalled();
      expect(prisma.spool.create).toHaveBeenCalled();
    });

    it('nên tạo cuộn nhựa mới liên kết loại nhựa đã có thành công (happy path)', async () => {
      // Arrange
      const input = {
        id: 'PLA-EXIST-001',
        type: 'PLA',
        colorName: 'Đỏ',
        brand: 'eSun',
        initialWeightG: 1000,
        remainingWeightG: 1000,
      };
      const existingFilament = {
        id: 'filament-existing-id',
        type: 'PLA',
        colorName: 'Đỏ',
        colorHex: '#FF0000',
        brand: 'eSun',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const mockSpool = {
        id: 'PLA-EXIST-001',
        filamentId: 'filament-existing-id',
        locationId: null,
        printerId: null,
        printerSlot: null,
        initialWeightG: 1000,
        emptySpoolWeightG: 220,
        remainingWeightG: 1000,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(prisma.spool.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.filament.findFirst).mockResolvedValue(existingFilament);
      vi.mocked(prisma.spool.create).mockResolvedValue(mockSpool);

      // Act
      const result = await FilamentService.createSpoolUnified(input);

      // Assert
      expect(result.success).toBe(true);
      expect(prisma.filament.create).not.toHaveBeenCalled();
      expect(prisma.spool.create).toHaveBeenCalled();
    });

    it('nên thất bại khi ID cuộn nhựa bị trùng (error path)', async () => {
      // Arrange
      const input = {
        id: 'PLA-RED-001',
        type: 'PLA',
        colorName: 'Đỏ',
        initialWeightG: 1000,
        remainingWeightG: 1000,
      };
      const existingSpool = {
        id: 'PLA-RED-001',
        filamentId: 'some-id',
        locationId: null,
        printerId: null,
        printerSlot: null,
        initialWeightG: 1000,
        emptySpoolWeightG: 220,
        remainingWeightG: 1000,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(prisma.spool.findUnique).mockResolvedValue(existingSpool);

      // Act
      const result = await FilamentService.createSpoolUnified(input);

      // Assert
      expect(result.success).toBe(false);
      expect(prisma.spool.create).not.toHaveBeenCalled();
    });
  });


  describe('updateSpoolWeight', () => {
    it('nên cập nhật khối lượng còn lại thành công (happy path)', async () => {
      // Arrange
      const spoolId = 'PLA-RED-001';
      const remainingWeightG = 750;
      const existingSpool = {
        id: spoolId,
        filamentId: 'filament-id-123',
        locationId: null,
        printerId: null,
        printerSlot: null,
        initialWeightG: 1000,
        emptySpoolWeightG: 220,
        remainingWeightG: 1000,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const updatedSpool = {
        ...existingSpool,
        remainingWeightG,
      };

      vi.mocked(prisma.spool.findUnique).mockResolvedValue(existingSpool);
      vi.mocked(prisma.spool.update).mockResolvedValue(updatedSpool);

      // Act
      const result = await FilamentService.updateSpoolWeight(spoolId, remainingWeightG);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.remainingWeightG).toBe(remainingWeightG);
      }
      expect(prisma.spool.update).toHaveBeenCalledWith({
        where: { id: spoolId },
        data: {
          remainingWeightG,
          status: 'active',
        },
      });
    });

    it('nên thất bại khi cập nhật số gam nhựa âm (edge case)', async () => {
      // Arrange
      const spoolId = 'PLA-RED-001';
      const remainingWeightG = -50;
      const existingSpool = {
        id: spoolId,
        filamentId: 'filament-id-123',
        locationId: null,
        printerId: null,
        printerSlot: null,
        initialWeightG: 1000,
        emptySpoolWeightG: 220,
        remainingWeightG: 1000,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(prisma.spool.findUnique).mockResolvedValue(existingSpool);

      // Act
      const result = await FilamentService.updateSpoolWeight(spoolId, remainingWeightG);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('không thể âm');
      }
      expect(prisma.spool.update).not.toHaveBeenCalled();
    });

    it('nên thất bại khi cập nhật số gam lớn hơn ban đầu (edge case)', async () => {
      // Arrange
      const spoolId = 'PLA-RED-001';
      const remainingWeightG = 1200;
      const existingSpool = {
        id: spoolId,
        filamentId: 'filament-id-123',
        locationId: null,
        printerId: null,
        printerSlot: null,
        initialWeightG: 1000,
        emptySpoolWeightG: 220,
        remainingWeightG: 1000,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(prisma.spool.findUnique).mockResolvedValue(existingSpool);

      // Act
      const result = await FilamentService.updateSpoolWeight(spoolId, remainingWeightG);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('không thể vượt quá khối lượng ban đầu');
      }
      expect(prisma.spool.update).not.toHaveBeenCalled();
    });
  });
});
