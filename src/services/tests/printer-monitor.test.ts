import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import prisma from '../../utils/db';
import { printerManager } from '../printer-integration/PrinterManager';
import { ghiVaGuiSuKien } from '../thong-bao.service';
import { quetMotLuot } from '../printer-monitor.service';

/**
 * Máy dò sự kiện là chỗ dễ sai nhất của tính năng thông báo: sai một nhịp là hoặc bỏ lọt sự cố lúc
 * 2 giờ sáng, hoặc bắn thông báo giả làm người ta tắt luôn cho đỡ phiền. Các ca dưới đây khóa lại
 * đúng những chỗ đã cân nhắc: lần quét đầu phải im, mạng chớp không được kêu, và "tạm dừng" không
 * được báo thành "lỗi".
 */

vi.mock('../../utils/db', () => ({
  default: { printer: { findMany: vi.fn() } },
}));

vi.mock('../printer-integration/PrinterManager', () => ({
  printerManager: { getStatusAsync: vi.fn() },
}));

vi.mock('../thong-bao.service', () => ({
  ghiVaGuiSuKien: vi.fn().mockResolvedValue(undefined),
  LOAI_SU_KIEN: {},
}));

const timPrinter = vi.mocked(prisma.printer.findMany);
const timTrangThai = vi.mocked(printerManager.getStatusAsync);
const banSuKien = vi.mocked(ghiVaGuiSuKien);

/** Dựng một PrinterStatusData tối thiểu; chỉ khai những field mà ca kiểm đang quan tâm. */
function trangThai(input: Partial<Record<string, unknown>> & { status: string }) {
  return {
    nozzleTemp: 0,
    nozzleTargetTemp: 0,
    bedTemp: 0,
    bedTargetTemp: 0,
    progress: 0,
    ...input,
  } as never;
}

const MAY = [{ id: 'PRT-1', name: 'Máy 1', cloudAccountId: 'acc', cloudPrinterId: 'p1' }];

/** Các loại sự kiện đã bắn trong lần quét vừa rồi. */
function loaiDaBan(): string[] {
  return banSuKien.mock.calls.map((c) => c[0].loai);
}

beforeEach(() => {
  vi.clearAllMocks();
  // Bộ nhớ so sánh nằm trên globalThis để sống qua hot-reload — mỗi ca phải bắt đầu từ trắng.
  (globalThis as { giamSatMayInBoNho?: Map<string, unknown> }).giamSatMayInBoNho?.clear();
  timPrinter.mockResolvedValue(MAY as never);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('quetMotLuot', () => {
  it('lần quét đầu chỉ ghi nền, không bắn thông báo', async () => {
    timTrangThai.mockResolvedValue(trangThai({ status: 'printing', progress: 42 }));

    await quetMotLuot();

    expect(banSuKien).not.toHaveBeenCalled();
  });

  it('rảnh → in báo "bắt đầu in", in → rảnh ở 100% báo "in xong"', async () => {
    timTrangThai.mockResolvedValue(trangThai({ status: 'idle' }));
    await quetMotLuot(); // nền

    timTrangThai.mockResolvedValue(trangThai({ status: 'printing', progress: 1, fileName: 'ke.gcode' }));
    await quetMotLuot();
    expect(loaiDaBan()).toEqual(['batDau']);

    banSuKien.mockClear();
    timTrangThai.mockResolvedValue(trangThai({ status: 'printing', progress: 100, fileName: 'ke.gcode' }));
    await quetMotLuot();
    timTrangThai.mockResolvedValue(trangThai({ status: 'idle', progress: 0 }));
    await quetMotLuot();

    expect(loaiDaBan()).toEqual(['inXong']);
  });

  it('đang in mà về rảnh sớm thì là hủy, không phải in xong', async () => {
    timTrangThai.mockResolvedValue(trangThai({ status: 'printing', progress: 30, fileName: 'ke.gcode' }));
    await quetMotLuot(); // nền
    await quetMotLuot(); // vẫn đang in, tiến độ 30%

    timTrangThai.mockResolvedValue(trangThai({ status: 'idle', progress: 0 }));
    await quetMotLuot();

    expect(loaiDaBan()).toEqual(['huy']);
    expect(banSuKien.mock.calls[0][0].noiDung).toContain('30%');
  });

  it('tạm dừng không bị báo thành lỗi, và in tiếp được nhận ra', async () => {
    timTrangThai.mockResolvedValue(trangThai({ status: 'printing', progress: 10 }));
    await quetMotLuot();

    // Cả Bambu lẫn Moonraker đều gộp tạm dừng vào status 'error' — phân biệt bằng trạng thái thô.
    timTrangThai.mockResolvedValue(
      trangThai({ status: 'error', progress: 10, extendedInfo: { payload: { print_status: 'PAUSE' } } }),
    );
    await quetMotLuot();
    expect(loaiDaBan()).toEqual(['tamDung']);

    banSuKien.mockClear();
    timTrangThai.mockResolvedValue(trangThai({ status: 'printing', progress: 11 }));
    await quetMotLuot();
    expect(loaiDaBan()).toEqual(['inTiep']);
  });

  it('dừng vì sự cố được nâng lên mức lỗi và nói rõ nguyên nhân', async () => {
    timTrangThai.mockResolvedValue(trangThai({ status: 'printing', progress: 26 }));
    await quetMotLuot();

    // Provider LAN giải mã sẵn `stg_cur` → biết máy dừng vì tắc đầu phun chứ không phải người bấm.
    timTrangThai.mockResolvedValue(
      trangThai({
        status: 'error',
        progress: 26,
        errorMessage: 'tắc đầu phun · HMS_0500_0400_0001_0044 (nghiêm trọng)',
        extendedInfo: {
          payload: { print_status: 'PAUSE', ly_do_dung: 'tắc đầu phun', dung_do_su_co: true },
        },
      }),
    );
    await quetMotLuot();

    // Phải là 'loi' chứ không phải 'tamDung': 'tamDung' chỉ ở mức cảnh báo, dễ rơi dưới ngưỡng Zalo.
    expect(loaiDaBan()).toEqual(['loi']);
    expect(banSuKien.mock.calls[0][0].tieuDe).toContain('dừng vì tắc đầu phun');
    expect(banSuKien.mock.calls[0][0].noiDung).toContain('HMS_0500_0400_0001_0044');
  });

  it('thợ bấm tạm dừng vẫn chỉ là tạm dừng, và ghi rõ là do người', async () => {
    timTrangThai.mockResolvedValue(trangThai({ status: 'printing', progress: 40 }));
    await quetMotLuot();

    timTrangThai.mockResolvedValue(
      trangThai({
        status: 'error',
        progress: 40,
        extendedInfo: {
          payload: { print_status: 'PAUSE', ly_do_dung: 'người bấm tạm dừng', dung_do_su_co: false },
        },
      }),
    );
    await quetMotLuot();

    expect(loaiDaBan()).toEqual(['tamDung']);
    expect(banSuKien.mock.calls[0][0].noiDung).toContain('người bấm tạm dừng');
  });

  it('lỗi thật (không phải tạm dừng) thì báo lỗi kèm mô tả của máy', async () => {
    timTrangThai.mockResolvedValue(trangThai({ status: 'printing', progress: 10 }));
    await quetMotLuot();

    timTrangThai.mockResolvedValue(
      trangThai({
        status: 'error',
        progress: 10,
        errorMessage: 'mã lỗi 0500_C011',
        extendedInfo: { payload: { print_status: 'FAILED' } },
      }),
    );
    await quetMotLuot();

    expect(loaiDaBan()).toEqual(['loi']);
    expect(banSuKien.mock.calls[0][0].noiDung).toContain('0500_C011');
  });

  it('lỗi HMS không sinh thông báo dù máy vẫn đang in bình thường', async () => {
    timTrangThai.mockResolvedValue(trangThai({ status: 'printing', progress: 10 }));
    await quetMotLuot();

    // A1-2 ôm lỗi firmware AMS mức nghiêm trọng suốt nhiều ngày mà vẫn in ngon. Provider trả hms
    // trong payload để UI hiện, nhưng errorMessage rỗng nên chẳng có gì để báo.
    timTrangThai.mockResolvedValue(
      trangThai({
        status: 'printing',
        progress: 11,
        extendedInfo: {
          payload: {
            print_status: 'RUNNING',
            hms: [{ ma: '0500_0400_0001_0044', mucDo: 'nghiêm trọng', nang: true }],
          },
        },
      }),
    );
    await quetMotLuot();

    expect(banSuKien).not.toHaveBeenCalled();
  });

  it('mạng chớp một nhịp không kêu; mất hai nhịp liên tiếp mới báo mất kết nối', async () => {
    timTrangThai.mockResolvedValue(trangThai({ status: 'printing', progress: 50 }));
    await quetMotLuot();

    timTrangThai.mockResolvedValue(null);
    await quetMotLuot();
    expect(banSuKien).not.toHaveBeenCalled();

    await quetMotLuot();
    expect(loaiDaBan()).toEqual(['mangMat']);

    // Vẫn mất tín hiệu thì im, không lặp lại mỗi 20 giây.
    banSuKien.mockClear();
    await quetMotLuot();
    expect(banSuKien).not.toHaveBeenCalled();

    // Về lại thì báo đúng một lần.
    timTrangThai.mockResolvedValue(trangThai({ status: 'idle' }));
    await quetMotLuot();
    expect(loaiDaBan()).toEqual(['mangLai']);
  });

  it('máy chủ vừa khởi động, provider chưa có dữ liệu: không báo "kết nối lại" giả', async () => {
    // Provider (Bambu qua HA) trả null ở lần hỏi đầu vì mới bắt đầu poll — nhìn y hệt mất kết nối.
    timTrangThai.mockResolvedValue(null);
    await quetMotLuot();

    timTrangThai.mockResolvedValue(trangThai({ status: 'printing', progress: 20 }));
    await quetMotLuot();

    expect(banSuKien).not.toHaveBeenCalled();
  });

  it('máy chết sẵn từ lúc máy chủ bật vẫn được báo mất kết nối', async () => {
    timTrangThai.mockResolvedValue(null);
    await quetMotLuot();
    await quetMotLuot();

    expect(loaiDaBan()).toEqual(['mangMat']);
    expect(banSuKien.mock.calls[0][0].noiDung).toContain('từ lúc máy chủ khởi động');
  });

  it('đang in mà tiến độ đứng yên quá lâu thì cảnh báo kẹt', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-17T00:00:00Z'));

    timTrangThai.mockResolvedValue(trangThai({ status: 'printing', progress: 40, fileName: 'ke.gcode' }));
    await quetMotLuot(); // nền
    await quetMotLuot();
    expect(banSuKien).not.toHaveBeenCalled();

    // Ngưỡng mặc định 30 phút.
    vi.setSystemTime(new Date('2026-08-17T00:31:00Z'));
    await quetMotLuot();
    expect(loaiDaBan()).toEqual(['dungYen']);

    // Tiến độ nhúc nhích trở lại → hết cảnh báo.
    banSuKien.mockClear();
    timTrangThai.mockResolvedValue(trangThai({ status: 'printing', progress: 41, fileName: 'ke.gcode' }));
    await quetMotLuot();
    expect(banSuKien).not.toHaveBeenCalled();
  });

  it('nhiệt vượt ngưỡng hai lần quét liên tiếp mới báo', async () => {
    timTrangThai.mockResolvedValue(trangThai({ status: 'printing', progress: 10, nozzleTemp: 350 }));
    await quetMotLuot(); // nền, soLanNhietCao chưa tính

    await quetMotLuot();
    expect(banSuKien).not.toHaveBeenCalled();

    await quetMotLuot();
    expect(loaiDaBan()).toEqual(['nhietBatThuong']);
  });
});
