import { describe, expect, it } from 'vitest';

import { bocAnh, soMam } from '../printer-integration/providers/bambu/anh-preview';

/**
 * File 3MF trên máy in là ZIP, và mình cố tình chỉ tải vài trăm KB đầu — nghĩa là **không có**
 * central directory ở cuối để tra cứu. Phải dò local file header, mà header đó ghi kích thước
 * bằng 0 (ZIP kiểu streaming, số thật nằm ở data descriptor phía sau). Nên chỗ duy nhất biết ảnh
 * kết thúc ở đâu là chunk `IEND` của chính file PNG.
 */

/** Dựng một local file header ZIP tối thiểu, cố tình để csize/usize = 0 như máy in thật ghi. */
function mucZip(ten: string, noiDung: Buffer, nen = 0): Buffer {
  const tenB = Buffer.from(ten, 'utf8');
  const h = Buffer.alloc(30);
  h.write('PK\x03\x04', 0, 'binary');
  h.writeUInt16LE(20, 4); // version
  h.writeUInt16LE(0x0808, 6); // cờ: có data descriptor
  h.writeUInt16LE(nen, 8);
  h.writeUInt32LE(0, 18); // csize = 0
  h.writeUInt32LE(0, 22); // usize = 0
  h.writeUInt16LE(tenB.length, 26);
  h.writeUInt16LE(0, 28);
  return Buffer.concat([h, tenB, noiDung]);
}

/** PNG giả: đủ chữ ký, một chunk rác, rồi IEND + CRC. */
function pngGia(danhDau: number): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from([danhDau, danhDau, danhDau, danhDau]),
    Buffer.from('IEND', 'binary'),
    Buffer.from([1, 2, 3, 4]), // CRC
  ]);
}

describe('bocAnh', () => {
  it('lấy đúng ảnh theo tên giữa nhiều mục', () => {
    const zip = Buffer.concat([
      mucZip('Metadata/plate_1.png', pngGia(0xaa)),
      mucZip('Metadata/plate_2_small.png', pngGia(0xbb)),
      mucZip('Metadata/top_1.png', pngGia(0xcc)),
    ]);

    const ra = bocAnh(zip, 'Metadata/plate_2_small.png');
    expect(ra).not.toBeNull();
    expect(ra![8]).toBe(0xbb);
    // Phải cắt đúng tới hết IEND + CRC, không nuốt sang mục kế tiếp.
    expect(ra!.length).toBe(pngGia(0xbb).length);
  });

  it('cắt tới hết chunk IEND kể cả khi header ghi kích thước 0', () => {
    const anh = pngGia(0x11);
    const ra = bocAnh(Buffer.concat([mucZip('a.png', anh), Buffer.from('RÁC PHÍA SAU')]), 'a.png');
    expect(ra).toEqual(anh);
  });

  it('không có tên đó thì trả null', () => {
    expect(bocAnh(mucZip('Metadata/plate_1.png', pngGia(1)), 'Metadata/plate_9.png')).toBeNull();
  });

  it('ảnh bị nén thì bỏ qua, thà không có còn hơn trả byte hỏng', () => {
    expect(bocAnh(mucZip('a.png', pngGia(1), 8), 'a.png')).toBeNull();
  });

  it('dữ liệu cụt (tải thiếu) không làm nổ chương trình', () => {
    const cut = mucZip('a.png', Buffer.from([0x89, 0x50])).subarray(0, 20);
    expect(() => bocAnh(cut, 'a.png')).not.toThrow();
    expect(bocAnh(cut, 'a.png')).toBeNull();
  });
});

describe('soMam', () => {
  it('đọc số mâm từ tên file khi bản in nhiều mâm', () => {
    expect(soMam('FARM BASKETS_plate_3.gcode.3mf')).toBe(3);
    expect(soMam('mu_coi (1) (1)_plate_2.3mf')).toBe(2);
  });

  it('tên không có hậu tố mâm thì mặc định mâm 1', () => {
    expect(soMam('mu_coi (1) (1).3mf')).toBe(1);
  });
});
