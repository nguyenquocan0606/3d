import { describe, expect, it } from 'vitest';

import { bocAnh, docTongKet, soMam } from '../printer-integration/providers/bambu/doc-3mf';

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

describe('docTongKet', () => {
  /// Hai dòng này slicer ghi sẵn ở đầu gcode — chép nguyên từ bản in mũ cối thật trên A1-1.
  const THAT = [
    '; HEADER_BLOCK_START',
    '; BambuStudio 02.08.00.50',
    '; model printing time: 11h 48m 26s; total estimated time: 11h 54m 41s',
    '; total filament weight [g] : 8.47,161.29,16.76,8.84',
    '; HEADER_BLOCK_END',
  ].join('\n');

  it('đọc đúng khối lượng từng filament và tổng', () => {
    const ra = docTongKet(THAT)!;
    expect(ra.gramTheoFilament).toEqual([8.47, 161.29, 16.76, 8.84]);
    expect(ra.tongGram).toBeCloseTo(195.36, 2);
  });

  it('đổi thời gian dự kiến ra giây', () => {
    // Phải lấy "total estimated time" chứ không phải "model printing time" đứng trước nó — con số
    // sau mới là cái Bambu Studio hiện cho người dùng.
    expect(docTongKet(THAT)!.giayDuKien).toBe(11 * 3600 + 54 * 60 + 41);
  });

  it('bản in một màu vẫn ra đúng một phần tử', () => {
    const ra = docTongKet('; total filament weight [g] : 42.5')!;
    expect(ra.gramTheoFilament).toEqual([42.5]);
    expect(ra.tongGram).toBe(42.5);
  });

  it('thiếu dòng khối lượng thì trả null, đừng đoán bừa', () => {
    expect(docTongKet('; total estimated time: 1h 0m 0s')).toBeNull();
    expect(docTongKet('')).toBeNull();
  });

  it('có khối lượng nhưng không có thời gian thì vẫn dùng được', () => {
    const ra = docTongKet('; total filament weight [g] : 10,20')!;
    expect(ra.tongGram).toBe(30);
    expect(ra.giayDuKien).toBeNull();
  });
});
