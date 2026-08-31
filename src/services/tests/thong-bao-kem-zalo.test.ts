import { beforeEach, describe, expect, it, vi } from 'vitest';

import prisma from '../../utils/db';
import { guiFcm } from '../fcm.service';
import { guiTinNhan } from '../zalo.service';
import { guiDiscord } from '../discord.service';
import { guiDi } from '../thong-bao.service';

/**
 * Khối mã HMS cố ý chỉ đi Zalo. Discord đã có bảng số liệu riêng, app đẩy dài quá thì bị cắt, còn
 * web hiện sẵn nguyên mảng — nên ca này khóa lại đúng chuyện đó: thêm cho Zalo, không rò sang kênh khác.
 */

vi.mock('../../utils/db', () => ({
  default: { caiDatThongBao: { upsert: vi.fn() }, thietBiThongBao: { findMany: vi.fn(), updateMany: vi.fn() } },
}));
vi.mock('../fcm.service', () => ({ guiFcm: vi.fn() }));
vi.mock('../zalo.service', () => ({ guiTinNhan: vi.fn() }));
vi.mock('../discord.service', () => ({ guiDiscord: vi.fn() }));

const layCaiDat = vi.mocked(prisma.caiDatThongBao.upsert);
const timThietBi = vi.mocked(prisma.thietBiThongBao.findMany);
const banFcm = vi.mocked(guiFcm);
const banZalo = vi.mocked(guiTinNhan);
const banDiscord = vi.mocked(guiDiscord);

const HMS = '\nMáy báo 1 lỗi:\n• 0500_0400_0001_0044 — Đầu phun bị tắc. (nghiêm trọng)';

beforeEach(() => {
  vi.clearAllMocks();
  layCaiDat.mockResolvedValue({
    bat: true,
    loaiTat: [],
    guiApp: true,
    guiZalo: true,
    zaloThreadId: 'thread-1',
    nguongZalo: 'canhBao',
    guiDiscord: true,
    discordWebhook: 'https://discord.test/hook',
    nguongDiscord: 'tin',
  } as never);
  timThietBi.mockResolvedValue([{ token: 'tok-1' }] as never);
  banFcm.mockResolvedValue({ thanhCong: 1, loi: [], tokenChet: [] } as never);
  banZalo.mockResolvedValue(undefined as never);
  banDiscord.mockResolvedValue(true);
});

describe('guiDi với kemZalo', () => {
  it('nối khối HMS vào tin Zalo, còn app đẩy và Discord giữ nguyên nội dung gốc', async () => {
    await guiDi({
      loai: 'loi',
      mucDo: 'loi',
      tieuDe: '🚨 Máy 1 dừng vì tắc đầu phun',
      noiDung: 'tắc đầu phun\nBản in: ke.gcode · Tiến độ 26%',
      kemZalo: HMS,
    });

    expect(banZalo.mock.calls[0][0].text).toContain('0500_0400_0001_0044');
    expect(banFcm.mock.calls[0][1].noiDung).not.toContain('0500_0400_0001_0044');
    expect(banDiscord.mock.calls[0][0].noiDung).not.toContain('0500_0400_0001_0044');
  });

  it('không có mã HMS thì tin Zalo không mọc thêm dòng trống', async () => {
    await guiDi({ loai: 'loi', mucDo: 'loi', tieuDe: 'Tiêu đề', noiDung: 'Nội dung' });

    expect(banZalo.mock.calls[0][0].text).toBe('Tiêu đề\nNội dung');
  });
});
