import { describe, expect, it } from 'vitest';

import { tachKhung } from '../printer-integration/providers/bambu/cam-bambu';

/**
 * Camera đẩy qua TCP, mà TCP không tôn trọng ranh giới khung: một gói có thể chứa nửa khung, hoặc
 * ba khung dính nhau. Cắt sai một byte là toàn bộ luồng từ đó trở đi thành rác — và triệu chứng
 * lại là "hình đứng im", rất khó lần ra.
 */

/** Một khung: 16 byte header (4 byte đầu = độ dài payload) rồi tới payload. */
function khung(noiDung: Buffer): Buffer {
  const h = Buffer.alloc(16);
  h.writeUInt32LE(noiDung.length, 0);
  return Buffer.concat([h, noiDung]);
}

const jpg = (danhDau: number, co = 100) => Buffer.alloc(co, danhDau);

describe('tachKhung', () => {
  it('cắt được nhiều khung dính trong một gói', () => {
    const { khung: ra, con, hong } = tachKhung(
      Buffer.concat([khung(jpg(1)), khung(jpg(2)), khung(jpg(3))]),
    );

    expect(ra).toHaveLength(3);
    expect(ra.map((k) => k[0])).toEqual([1, 2, 3]);
    expect(con).toHaveLength(0);
    expect(hong).toBe(false);
  });

  it('giữ lại phần đuôi chưa đủ khung để ghép với gói sau', () => {
    const day = Buffer.concat([khung(jpg(1)), khung(jpg(2))]);
    const cat = 116 + 50; // trọn khung 1 + nửa khung 2

    const lan1 = tachKhung(day.subarray(0, cat));
    expect(lan1.khung).toHaveLength(1);
    expect(lan1.con.length).toBe(50);

    // Ghép đuôi với phần còn lại → ra nốt khung thứ hai.
    const lan2 = tachKhung(Buffer.concat([lan1.con, day.subarray(cat)]));
    expect(lan2.khung).toHaveLength(1);
    expect(lan2.khung[0][0]).toBe(2);
    expect(lan2.con).toHaveLength(0);
  });

  it('gói chỉ có nửa header thì chưa cắt gì cả', () => {
    const ra = tachKhung(Buffer.alloc(9));
    expect(ra.khung).toHaveLength(0);
    expect(ra.con).toHaveLength(9);
    expect(ra.hong).toBe(false);
  });

  it('độ dài vô lý thì báo hỏng để đóng kết nối', () => {
    const xau = Buffer.alloc(20);
    xau.writeUInt32LE(999_999_999, 0);
    expect(tachKhung(xau).hong).toBe(true);

    const khong = Buffer.alloc(20); // độ dài = 0
    expect(tachKhung(khong).hong).toBe(true);
  });

  it('vẫn trả về các khung đọc được trước khi gặp chỗ hỏng', () => {
    const xau = Buffer.alloc(16);
    xau.writeUInt32LE(999_999_999, 0);
    const ra = tachKhung(Buffer.concat([khung(jpg(7)), xau]));

    expect(ra.khung).toHaveLength(1);
    expect(ra.khung[0][0]).toBe(7);
    expect(ra.hong).toBe(true);
  });
});
