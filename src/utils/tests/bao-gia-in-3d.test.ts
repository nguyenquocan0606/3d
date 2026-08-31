import { describe, expect, it } from 'vitest';
import {
  DENSITY_G_CM3,
  infillHieuDung,
  tinhGiaBaoGia,
  tinhGiaVonInBan,
  traDensity,
  uocLuongInBan,
} from '../bao-gia-in-3d';

describe('traDensity', () => {
  it('tra đúng theo loại nhựa, không phân biệt hoa/thường', () => {
    expect(traDensity('pla')).toBe(DENSITY_G_CM3.PLA);
    expect(traDensity('PETG')).toBe(DENSITY_G_CM3.PETG);
  });

  it('loại lạ hoặc rỗng rơi về mặc định PLA', () => {
    expect(traDensity('KHONG_TON_TAI')).toBe(DENSITY_G_CM3.PLA);
    expect(traDensity(null)).toBe(DENSITY_G_CM3.PLA);
    expect(traDensity(undefined)).toBe(DENSITY_G_CM3.PLA);
  });
});

describe('infillHieuDung', () => {
  it('cộng thêm phụ phí vỏ, không vượt quá 1', () => {
    expect(infillHieuDung(0)).toBeCloseTo(0.12);
    expect(infillHieuDung(100)).toBe(1);
  });

  it('kẹp về [0, 100] trước khi tính', () => {
    expect(infillHieuDung(-10)).toBeCloseTo(0.12);
    expect(infillHieuDung(150)).toBe(1);
  });
});

describe('uocLuongInBan', () => {
  it('nhân bản (instanceCount) làm tăng đúng tỷ lệ khối lượng', () => {
    const mot = uocLuongInBan({ volumeCm3: 10, instanceCount: 1, infillPercent: 20, filamentType: 'PLA', layerHeightMm: 0.2 });
    const ba = uocLuongInBan({ volumeCm3: 10, instanceCount: 3, infillPercent: 20, filamentType: 'PLA', layerHeightMm: 0.2 });
    expect(ba.weightG).toBeCloseTo(mot.weightG * 3, 1);
    expect(Math.abs(ba.timeMinutes - mot.timeMinutes * 3)).toBeLessThanOrEqual(1);
  });

  it('layer mỏng hơn thì thời gian in lâu hơn', () => {
    const layerDay = uocLuongInBan({ volumeCm3: 10, instanceCount: 1, infillPercent: 20, filamentType: 'PLA', layerHeightMm: 0.28 });
    const layerMong = uocLuongInBan({ volumeCm3: 10, instanceCount: 1, infillPercent: 20, filamentType: 'PLA', layerHeightMm: 0.12 });
    expect(layerMong.timeMinutes).toBeGreaterThan(layerDay.timeMinutes);
  });

  it('nhựa nặng hơn (ABS < PLA density) ra khối lượng khác nhau đúng theo density', () => {
    const pla = uocLuongInBan({ volumeCm3: 10, instanceCount: 1, infillPercent: 100, filamentType: 'PLA', layerHeightMm: 0.2 });
    const abs = uocLuongInBan({ volumeCm3: 10, instanceCount: 1, infillPercent: 100, filamentType: 'ABS', layerHeightMm: 0.2 });
    expect(abs.weightG).toBeLessThan(pla.weightG);
  });
});

describe('tinhGiaVonInBan', () => {
  it('cộng tiền nhựa (theo gram) và tiền máy (theo giờ)', () => {
    const giaVon = tinhGiaVonInBan({ weightG: 1000, filamentCostPerKg: 200_000, timeMinutes: 60, gioMayInVnd: 5000 });
    expect(giaVon).toBe(205_000); // 1kg * 200k + 1h * 5k
  });

  it('thiếu giá nhựa (null) thì chỉ tính tiền máy', () => {
    expect(tinhGiaVonInBan({ weightG: 1000, filamentCostPerKg: null, timeMinutes: 60, gioMayInVnd: 5000 })).toBe(5000);
  });
});

describe('tinhGiaBaoGia', () => {
  it('ra đúng bộ giá từ giaVon tính được, dùng chung pipeline dinh-gia-hang-hoa', () => {
    const ketQua = tinhGiaBaoGia(
      { weightG: 1000, filamentCostPerKg: 200_000, timeMinutes: 60, gioMayInVnd: 5000 },
      40,
    );
    expect(ketQua.giaVon).toBe(205_000);
    expect(ketQua.giaBanLe).toBe(Math.round(205_000 * 1.4));
  });
});
