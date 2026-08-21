import { beforeEach, describe, expect, it, vi } from 'vitest';

import prisma from '../../utils/db';
import { PrinterService } from '../printer.service';

/**
 * Ô "Model" của máy in được phép để trống, và khi trống thì web gửi thẳng `model: null` — không
 * phải chuỗi rỗng. Trước đây service gọi `.trim()` lên giá trị đó nên lưu máy in không có model
 * chết với "Cannot read properties of null (reading 'trim')" và API trả 400.
 */

vi.mock('../../utils/db', () => ({
  default: {
    printer: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

const timPrinter = vi.mocked(prisma.printer.findUnique);
const capNhatPrinter = vi.mocked(prisma.printer.update);

/** Dữ liệu ghi xuống DB của lần gọi `update` gần nhất. */
function duLieuDaGhi() {
  return capNhatPrinter.mock.calls[0]![0].data;
}

beforeEach(() => {
  vi.clearAllMocks();
  timPrinter.mockResolvedValue({ id: 'PRT-X-1', name: 'A2L' } as never);
  capNhatPrinter.mockResolvedValue({ id: 'PRT-X-1', name: 'A2L', spools: [] } as never);
});

describe('PrinterService.updatePrinter', () => {
  it('model: null → xóa model, không nổ .trim()', async () => {
    const result = await PrinterService.updatePrinter('PRT-X-1', {
      name: 'A2L',
      model: null,
    });

    expect(result.success).toBe(true);
    expect(duLieuDaGhi()).toMatchObject({ name: 'A2L', model: null });
  });

  it('model rỗng/chỉ có khoảng trắng cũng thành null', async () => {
    await PrinterService.updatePrinter('PRT-X-1', { name: 'A2L', model: '   ' });

    expect(duLieuDaGhi()).toMatchObject({ model: null });
  });

  it('không gửi model thì giữ nguyên model cũ', async () => {
    await PrinterService.updatePrinter('PRT-X-1', { name: 'A2L' });

    expect(duLieuDaGhi()).toMatchObject({ model: undefined });
  });

  it('model có giá trị thì được cắt khoảng trắng thừa', async () => {
    await PrinterService.updatePrinter('PRT-X-1', { model: '  A1 mini ' });

    expect(duLieuDaGhi()).toMatchObject({ model: 'A1 mini' });
  });
});
