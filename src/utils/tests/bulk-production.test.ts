import { describe, it, expect } from 'vitest';
import { chiaLuotIn, trangThaiDon, dinhDangThoiLuong } from '../bulk-production';

describe('chiaLuotIn', () => {
  it('chia hết: 200 con, 50 con/mâm, 2 máy → 4 lượt đều 50 con', () => {
    const luots = chiaLuotIn(200, 50, 2);
    expect(luots).toHaveLength(4);
    expect(luots.every((l) => l.quantity === 50)).toBe(true);
  });

  it('lượt cuối nhận phần dư', () => {
    const luots = chiaLuotIn(250, 60, 1);
    expect(luots.map((l) => l.quantity)).toEqual([60, 60, 60, 60, 10]);
    expect(luots.reduce((s, l) => s + l.quantity, 0)).toBe(250);
  });

  it('chia vòng tròn: máy k nhận lượt k, k+soMay, k+2*soMay...', () => {
    const luots = chiaLuotIn(500, 50, 3); // 10 lượt / 3 máy
    expect(luots.map((l) => l.printerIndex)).toEqual([0, 1, 2, 0, 1, 2, 0, 1, 2, 0]);
    // PEI trên máy đầu: 1, 2, 3, 4
    expect(luots.filter((l) => l.printerIndex === 0).map((l) => l.peiIndex)).toEqual([1, 2, 3, 4]);
    // PEI trên máy thứ 3: 1, 2, 3
    expect(luots.filter((l) => l.printerIndex === 2).map((l) => l.peiIndex)).toEqual([1, 2, 3]);
  });

  it('tổng ít hơn 1 mâm → đúng 1 lượt bằng tổng', () => {
    expect(chiaLuotIn(12, 50, 4)).toEqual([{ seq: 1, printerIndex: 0, peiIndex: 1, quantity: 12 }]);
  });

  it('tham số không hợp lệ → mảng rỗng', () => {
    expect(chiaLuotIn(0, 50, 2)).toEqual([]);
    expect(chiaLuotIn(100, 0, 2)).toEqual([]);
    expect(chiaLuotIn(100, 50, 0)).toEqual([]);
    expect(chiaLuotIn(NaN, 50, 2)).toEqual([]);
  });
});

describe('trangThaiDon', () => {
  it('chưa quẹt lượt nào → pending', () => {
    expect(trangThaiDon(['pending', 'pending'])).toBe('pending');
    expect(trangThaiDon([])).toBe('pending');
  });

  it('có lượt đang in hoặc đã xong → printing', () => {
    expect(trangThaiDon(['printing', 'pending'])).toBe('printing');
    expect(trangThaiDon(['completed', 'pending'])).toBe('printing');
  });

  it('xong hết → completed', () => {
    expect(trangThaiDon(['completed', 'completed'])).toBe('completed');
  });
});

describe('dinhDangThoiLuong', () => {
  it('tính khoảng cách 2 mốc quẹt', () => {
    const batDau = new Date('2026-08-13T08:00:00Z');
    expect(dinhDangThoiLuong(batDau, new Date('2026-08-13T10:15:00Z'))).toBe('2g 15p');
    expect(dinhDangThoiLuong(batDau, new Date('2026-08-13T08:45:00Z'))).toBe('45p');
  });

  it('thiếu mốc hoặc mốc ngược → gạch ngang', () => {
    expect(dinhDangThoiLuong(null, new Date())).toBe('—');
    expect(dinhDangThoiLuong(new Date('2026-08-13T10:00:00Z'), new Date('2026-08-13T08:00:00Z'))).toBe('—');
  });
});
