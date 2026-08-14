import { describe, expect, it } from 'vitest';
import {
  HE_SO_COMBO_MAC_DINH,
  chuanHoaHeSoCombo,
  tinhGiaCombo,
  tinhGiaGocCombo,
  tinhSoLuongCombo,
  tinhToanBoGia,
} from '../dinh-gia-hang-hoa';

describe('giá hàng lẻ', () => {
  it('giá sàn chia để bù đúng phí sàn (bán xong thu về đúng giá bán lẻ)', () => {
    const { gia, giaBanLe } = tinhToanBoGia(15000, 40);
    expect(giaBanLe).toBe(21000);
    expect(gia).toBe(34286); // (21000 + 3000) / 0.7
    expect(Math.round(gia - 3000 - gia * 0.3)).toBe(giaBanLe);
  });
});

describe('giá combo = giá mẹ × hệ số', () => {
  const me = tinhGiaGocCombo(15000, 40); // vốn 15.000 · lẻ 21.000 · sàn 34.286 · KM 45.715

  it('bộ giá gốc của mẹ đúng dây chuyền cũ', () => {
    expect(me).toEqual({ giaVon: 15000, giaBanLe: 21000, gia: 34286, giaKhuyenMai: 45715 });
  });

  it('giá sàn combo nhân từ giá sàn mẹ, giá KM nhân từ giá KM mẹ', () => {
    const combo2 = tinhGiaCombo(me, 2, HE_SO_COMBO_MAC_DINH); // hệ số 2
    expect(combo2.gia).toBe(me.gia * 2);
    expect(combo2.giaKhuyenMai).toBe(me.giaKhuyenMai * 2);
  });

  it('cả 4 giá cùng một hệ số', () => {
    const combo1 = tinhGiaCombo(me, 1, HE_SO_COMBO_MAC_DINH); // hệ số 1.5
    expect(combo1).toEqual({
      giaVon: Math.round(15000 * 1.5),
      giaBanLe: Math.round(21000 * 1.5),
      gia: Math.round(34286 * 1.5),
      giaKhuyenMai: Math.round(45715 * 1.5),
    });
  });

  it('hệ số riêng của từng hàng được áp dụng, không dùng mặc định', () => {
    const rieng = chuanHoaHeSoCombo({ 1: 1, 2: 1.8, 5: 4.5 });
    expect(tinhGiaCombo(me, 5, rieng).gia).toBe(Math.round(34286 * 4.5));
    expect(tinhGiaCombo(me, 5, HE_SO_COMBO_MAC_DINH).gia).toBe(Math.round(34286 * 4));
  });

  it('mẹ chưa có giá thì combo cũng bằng 0, không sinh giá ảo', () => {
    const chuaCoGia = tinhGiaGocCombo(0, 40);
    expect(tinhGiaCombo(chuaCoGia, 5, HE_SO_COMBO_MAC_DINH)).toEqual({
      giaVon: 0,
      giaBanLe: 0,
      gia: 0,
      giaKhuyenMai: 0,
    });
  });
});

describe('chuanHoaHeSoCombo', () => {
  it('thiếu / sai kiểu / âm đều rơi về mặc định', () => {
    expect(chuanHoaHeSoCombo(null)).toEqual(HE_SO_COMBO_MAC_DINH);
    expect(chuanHoaHeSoCombo({ 1: 'abc', 2: -3 })).toEqual(HE_SO_COMBO_MAC_DINH);
    expect(chuanHoaHeSoCombo({ 2: 3 })).toEqual({ 1: 1.5, 2: 3, 5: 4 });
  });

  it('bỏ qua khóa lạ, chỉ giữ 1 / 2 / 5', () => {
    expect(Object.keys(chuanHoaHeSoCombo({ 1: 1, 2: 2, 5: 5, 99: 9 }))).toEqual(['1', '2', '5']);
  });
});

describe('tồn kho combo', () => {
  it('chia tồn kho mẹ, làm tròn xuống', () => {
    expect(tinhSoLuongCombo(5, 1)).toBe(5);
    expect(tinhSoLuongCombo(5, 2)).toBe(2);
    expect(tinhSoLuongCombo(5, 5)).toBe(1);
  });
});
