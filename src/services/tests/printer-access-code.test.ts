import { describe, expect, it, vi } from 'vitest';

/**
 * Access Code là mật khẩu vào máy in. Nó đi ra khỏi máy chủ đúng một lần duy nhất: lúc người dùng
 * gõ vào form. Từ đó trở đi mọi đường trả dữ liệu — API danh sách máy in lẫn endpoint đồng bộ
 * xuống SQLite của điện thoại — đều phải cắt nó đi.
 *
 * Ca kiểm này tồn tại vì kiểu rò rỉ đó im lặng tuyệt đối: không ai thấy gì bất thường cho tới lúc
 * một cái điện thoại thất lạc kèm theo mã vào toàn bộ máy in trong xưởng.
 */

vi.mock('../../utils/db', () => ({ default: { printer: {}, cloudAccount: {} } }));

import { giauAccessCode } from '../printer.service';

const MAY = {
  id: 'PRT-A11',
  name: 'A1-1',
  lanIp: '192.168.99.16',
  lanSerial: '03900D611509363',
  lanAccessCode: 'ma-gia-de-test',
};

describe('giauAccessCode', () => {
  it('cắt hẳn Access Code khỏi dữ liệu trả về', () => {
    const ra = giauAccessCode(MAY);

    expect(ra).not.toHaveProperty('lanAccessCode');
    expect(JSON.stringify(ra)).not.toContain('ma-gia-de-test');
  });

  it('thay bằng cờ cho client biết đã lưu mã hay chưa', () => {
    expect(giauAccessCode(MAY).coAccessCode).toBe(true);
    expect(giauAccessCode({ ...MAY, lanAccessCode: null }).coAccessCode).toBe(false);
    expect(giauAccessCode({ ...MAY, lanAccessCode: '' }).coAccessCode).toBe(false);
  });

  it('giữ nguyên các trường còn lại để UI vẫn hiện đủ', () => {
    expect(giauAccessCode(MAY)).toMatchObject({
      id: 'PRT-A11',
      lanIp: '192.168.99.16',
      lanSerial: '03900D611509363',
    });
  });
});
