import { describe, expect, it } from 'vitest';

import { canXacNhan, ghepKhay, type KhayAms } from '../printer-integration/providers/bambu/ghep-khay';
import type { FilamentDung } from '../printer-integration/providers/bambu/doc-3mf';

/**
 * Ghép sai khay là trừ nhầm cuộn nhựa — kiểu hỏng âm thầm nhất: không ai thấy gì cho tới lúc kiểm
 * kho và số liệu lệch cả ký, mà lúc đó không lần lại được đã lệch từ mâm nào.
 *
 * Số liệu dưới đây chép từ bản in mũ cối thật trên A1-1 và AMS thật của nó.
 */

const FILAMENT_THAT: FilamentDung[] = [
  { so: 1, mau: '#400000', gram: 8.47 },
  { so: 2, mau: '#327B0F', gram: 161.29 },
  { so: 3, mau: '#917E00', gram: 16.76 },
  { so: 4, mau: '#FE0000', gram: 8.84 },
];

const KHAY_THAT: KhayAms[] = [
  { slot: 1, loai: 'PETG', mau: '#C52C18' },
  { slot: 2, loai: 'PETG', mau: '#F6DA5A' },
  { slot: 3, loai: 'PETG', mau: '#18C241' },
  { slot: 4, loai: 'PETG', mau: '#FFFFFF' },
];

describe('ghepKhay', () => {
  it('KHÔNG ghép theo số thứ tự — filament 2 phải ra khay xanh, không phải khay 2', () => {
    const ra = ghepKhay(FILAMENT_THAT, KHAY_THAT);
    const f2 = ra.find((c) => c.filament.so === 2)!;

    // Khay 3 mới là cuộn xanh (#18C241); khay 2 đang lắp cuộn vàng.
    expect(f2.slot).toBe(3);
  });

  it('cuộn vàng của slicer ra đúng khay vàng', () => {
    const ra = ghepKhay(FILAMENT_THAT, KHAY_THAT);
    expect(ra.find((c) => c.filament.so === 3)!.slot).toBe(2);
  });

  it('hai filament cùng gam đỏ không được cùng ăn một khay', () => {
    const ra = ghepKhay(FILAMENT_THAT, KHAY_THAT);
    const slots = ra.map((c) => c.slot).filter((s): s is number => s !== null);
    expect(new Set(slots).size).toBe(slots.length);
  });

  it('đòi xác nhận khi không có cặp nào trùng khít', () => {
    // Đây chính là ca thật: slicer đặt màu khác màu cuộn đang lắp, không cặp nào đạt 0,95.
    expect(canXacNhan(ghepKhay(FILAMENT_THAT, KHAY_THAT))).toBe(true);
  });

  it('màu trùng khít thì tự tin, khỏi hỏi', () => {
    const f: FilamentDung[] = [{ so: 1, mau: '#18C241', gram: 100 }];
    const k: KhayAms[] = [
      { slot: 1, loai: 'PETG', mau: '#C52C18' },
      { slot: 2, loai: 'PETG', mau: '#18C241' },
    ];
    const ra = ghepKhay(f, k);

    expect(ra[0].slot).toBe(2);
    expect(ra[0].diem).toBe(1);
    expect(canXacNhan(ra)).toBe(false);
  });

  it('khay trống không được gán', () => {
    const f: FilamentDung[] = [{ so: 1, mau: '#18C241', gram: 50 }];
    const k: KhayAms[] = [
      { slot: 1, loai: null, mau: null },
      { slot: 2, loai: 'PETG', mau: '#18C241' },
    ];
    expect(ghepKhay(f, k)[0].slot).toBe(2);
  });

  it('nhiều filament hơn số khay thì phần thừa để trống, không bịa', () => {
    const f: FilamentDung[] = [
      { so: 1, mau: '#FF0000', gram: 10 },
      { so: 2, mau: '#00FF00', gram: 10 },
    ];
    const ra = ghepKhay(f, [{ slot: 1, loai: 'PETG', mau: '#FF0000' }]);

    expect(ra.find((c) => c.filament.so === 1)!.slot).toBe(1);
    expect(ra.find((c) => c.filament.so === 2)!.slot).toBeNull();
    expect(canXacNhan(ra)).toBe(true);
  });

  it('file không ghi màu thì không đoán liều', () => {
    const ra = ghepKhay([{ so: 1, mau: null, gram: 10 }], KHAY_THAT);
    expect(ra[0].diem).toBe(0);
    expect(canXacNhan(ra)).toBe(true);
  });
});
