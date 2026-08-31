import { describe, it, expect } from 'vitest';
import {
  buildOrderBarcodeTSPLCommand,
  buildTSPLCommand,
  removeDiacritics,
  sanitizeTSPL,
  LabelData,
} from '../../utils/tspl-printer';

describe('sanitizeTSPL', () => {
  it('thay dấu nháy kép bằng nháy đơn (chống hỏng cú pháp lệnh)', () => {
    expect(sanitizeTSPL('Hop "A" dep')).toBe("Hop 'A' dep");
  });

  it('thay ký tự xuống dòng bằng khoảng trắng (chống chèn lệnh TSPL lạ)', () => {
    expect(sanitizeTSPL('DONG1\nDONG2\r\nDONG3')).toBe('DONG1 DONG2 DONG3');
  });

  it('xử lý chuỗi rỗng', () => {
    expect(sanitizeTSPL('')).toBe('');
  });
});

describe('removeDiacritics', () => {
  it('loại bỏ dấu tiếng Việt thông thường (happy path)', () => {
    // Arrange
    const input = 'KHO LƯU TRỮ';

    // Act
    const result = removeDiacritics(input);

    // Assert
    expect(result).toBe('KHO LUU TRU');
  });

  it('chuyển đổi ký tự đ/Đ thành d/D (edge case)', () => {
    // Arrange
    const input = 'Đỏ đậm';

    // Act
    const result = removeDiacritics(input);

    // Assert
    expect(result).toBe('Do dam');
  });

  it('giữ nguyên chuỗi ASCII thuần (edge case)', () => {
    // Arrange
    const input = 'PLA-WHT-01';

    // Act
    const result = removeDiacritics(input);

    // Assert
    expect(result).toBe('PLA-WHT-01');
  });

  it('xử lý chuỗi rỗng (edge case)', () => {
    expect(removeDiacritics('')).toBe('');
  });

  it('xử lý tất cả các nguyên âm có dấu (edge case)', () => {
    // Arrange
    const input = 'àáảãạ èéẻẽẹ ìíỉĩị òóỏõọ ùúủũụ ỳýỷỹỵ ăắằẳẵặ âấầẩẫậ êếềểễệ ôốồổỗộ ơớờởỡợ ưứừửữự';

    // Act
    const result = removeDiacritics(input);

    // Assert
    expect(result).toBe('aaaaa eeeee iiiii ooooo uuuuu yyyyy aaaaaa aaaaaa eeeeee oooooo oooooo uuuuuu');
  });
});

describe('buildTSPLCommand', () => {
  it('sinh đúng chuỗi lệnh TSPL với QR to 30%, chia 22mm/18mm, xoay chữ 270 độ và nhân đôi cỡ chữ (happy path)', () => {
    // Arrange
    const qrCode = 'PLA-WHT-01';
    const labelData: LabelData = {
      line1: 'PLA-WHT-01',
      line2: 'PLA',
      line3: 'White',
    };

    // Act
    const result = buildTSPLCommand(qrCode, labelData);

    // Assert — kiểm tra các lệnh TSPL cốt lõi
    expect(result).toContain('SIZE 40 mm, 30 mm');
    expect(result).toContain('GAP 2 mm, 0 mm');
    expect(result).toContain('CLS');
    expect(result).toContain('PRINT 1,1');

    // QR Code nửa trái, cell size 8
    expect(result).toContain('QRCODE 10,10,M,8,A,0,"PLA-WHT-01"');

    // LINE2 (loại nhựa) nằm dưới QR, font "2", căn giữa theo QR (qrSize = 168): 10 + (168 - 3*12)/2 = 76
    expect(result).toContain('TEXT 76,212,"2",0,1,1,"PLA"');

    // Đường kẻ dọc phân cách tại 22mm (176 dots)
    expect(result).toContain('BAR 176,0,2,240');

    // LINE1 (mã ID) nửa phải, font "3", xoay 270 độ, cỡ chữ nhân đôi, X=192 (cách vạch dọc 16 dots), Y=224 (cách viền trên 8mm)
    expect(result).toContain('TEXT 192,224,"3",270,2,2,"PLA-WHT-01"');

    // LINE3 (tên màu) nửa phải, font "2", xoay 270 độ, cỡ chữ nhân đôi, X=236, Y=224
    expect(result).toContain('TEXT 236,224,"2",270,2,2,"WHITE"');
  });

  it('loại bỏ dấu tiếng Việt trong nội dung in và căn giữa line2 theo QR (happy path)', () => {
    // Arrange
    const qrCode = 'LOC-01';
    const labelData: LabelData = {
      line1: 'LOC-01',
      line2: 'VỊ TRÍ KHO',
      line3: 'Kho Lưu Trữ',
    };

    // Act
    const result = buildTSPLCommand(qrCode, labelData);

    // Assert — loại nhựa (line2) dưới QR căn giữa theo QR (qrSize = 168): "VI TRI KHO" (10 kí tự → width=120, x = 10 + (168-120)/2 = 34)
    expect(result).toContain('TEXT 34,212,"2",0,1,1,"VI TRI KHO"');
    // Tên (line3) nửa phải xoay 270 độ, font "2", cỡ chữ nhân đôi, X=236, Y=224
    expect(result).toContain('TEXT 236,224,"2",270,2,2,"KHO LUU TRU"');
  });

  it('chuyển toàn bộ text thành uppercase (edge case)', () => {
    // Arrange
    const qrCode = 'pla-wht-01';
    const labelData: LabelData = {
      line1: 'pla-wht-01',
      line2: 'pla',
      line3: 'white',
    };

    // Act
    const result = buildTSPLCommand(qrCode, labelData);

    // Assert
    expect(result).toContain('TEXT 192,224,"3",270,2,2,"PLA-WHT-01"');
    expect(result).toContain('TEXT 76,212,"2",0,1,1,"PLA"');
    expect(result).toContain('TEXT 236,224,"2",270,2,2,"WHITE"');
  });

  it('kết thúc bằng ký tự newline (edge case)', () => {
    // Arrange
    const qrCode = 'TEST';
    const labelData: LabelData = { line1: 'A', line2: 'B', line3: 'C' };

    // Act
    const result = buildTSPLCommand(qrCode, labelData);

    // Assert — chuỗi TSPL phải kết thúc bằng \n
    expect(result.endsWith('\n')).toBe(true);
  });
});

describe('buildOrderBarcodeTSPLCommand', () => {
  /** Mọi lệnh TEXT trong chuỗi TSPL → { x, font, text } để soi bề ngang. */
  const textCommands = (tspl: string) =>
    tspl
      .split('\n')
      .filter((line) => line.startsWith('TEXT '))
      .map((line) => {
        const m = line.match(/^TEXT (\d+),(\d+),"(\d)",0,(\d),\d,"(.*)"$/);
        if (!m) throw new Error(`Lệnh TEXT lạ: ${line}`);
        return { x: +m[1], y: +m[2], font: m[3], scale: +m[4], text: m[5] };
      });

  const FONT_W: Record<string, number> = { '1': 8, '2': 12, '3': 16 };

  it('in tên, mã vạch, số của mã vạch rồi mô tả phụ (happy path)', () => {
    // Arrange — đúng nội dung tem lượt in SLL
    const result = buildOrderBarcodeTSPLCommand('12345678', {
      line1: '12345678',
      line2: 'Móc khóa hình mèo',
      line3: 'Máy in 01 PEI 1 - 12 con',
    });

    // Assert
    expect(result).toContain('SIZE 40 mm, 30 mm');
    expect(result).toContain('"128M"');
    expect(result).toContain('"MOC KHOA HINH MEO"');
    // Số của chính mã vạch được in nhỏ (font "2") ngay dưới vạch
    expect(result).toContain('"2",0,1,1,"12345678"');
    expect(result).toContain('"MAY IN 01 PEI 1 - 12 CON"');
  });

  it('không dòng chữ nào tràn khỏi bề ngang 320 dots (regression)', () => {
    // Arrange — tên sản phẩm và mô tả đều dài quá một dòng
    const result = buildOrderBarcodeTSPLCommand('12345678', {
      line1: '12345678',
      line2: 'Giá đỡ điện thoại gấp gọn phiên bản 2024',
      line3: 'May in Bambu P1S so 12 PEI 3 - 24 con',
    });

    // Assert
    for (const cmd of textCommands(result)) {
      const right = cmd.x + cmd.text.length * FONT_W[cmd.font] * cmd.scale;
      expect(right).toBeLessThanOrEqual(320);
    }
  });

  it('mã vạch và chữ nằm gọn trong chiều cao 240 dots (regression)', () => {
    // Arrange
    const result = buildOrderBarcodeTSPLCommand('12345678', {
      line1: '12345678',
      line2: 'Giá đỡ điện thoại gấp gọn phiên bản 2024',
      line3: 'May in Bambu P1S so 12 PEI 3 - 24 con',
    });

    // Act — dòng chữ thấp nhất + chiều cao font phải còn nằm trong tem
    const lowest = textCommands(result).reduce(
      (max, cmd) => Math.max(max, cmd.y + (cmd.font === '3' ? 24 : 20) * cmd.scale),
      0,
    );
    const barcode = result.match(/^BARCODE (\d+),(\d+),"128M",(\d+),/m);

    // Assert
    expect(lowest).toBeLessThanOrEqual(240);
    expect(barcode).not.toBeNull();
    expect(+barcode![2] + +barcode![3]).toBeLessThanOrEqual(240);
    // Mã vạch vẫn đủ cao để súng quét đọc được
    expect(+barcode![3]).toBeGreaterThanOrEqual(40);
  });

  it('hạ độ rộng vạch khi nội dung mã dài, thay vì để tràn (edge case)', () => {
    // Arrange — mã đơn hàng người dùng tự đặt, dài hơn mã 8 số
    const result = buildOrderBarcodeTSPLCommand('DH-2026-000123456', {
      line1: 'DH-2026-000123456',
      line2: 'Don hang',
      line3: 'THUNG 1',
    });

    // Act
    const barcode = result.match(/^BARCODE (\d+),(\d+),"128M",\d+,0,0,(\d+),(\d+),/m);

    // Assert — narrow = 1 và vạch vẫn nằm trong tem
    expect(barcode).not.toBeNull();
    const modules = 11 * ('DH-2026-000123456'.length + 2) + 13;
    expect(+barcode![3]).toBe(1);
    expect(+barcode![1] + modules * +barcode![3]).toBeLessThanOrEqual(320);
  });

  it('vẫn in được khi chỉ có mã vạch, không có chữ (edge case)', () => {
    // Arrange
    const result = buildOrderBarcodeTSPLCommand('12345678', {
      line1: '12345678',
      line2: '',
      line3: '',
    });

    // Assert — chỉ còn đúng dòng số của mã vạch
    expect(textCommands(result)).toHaveLength(1);
    expect(result).toContain('PRINT 1,1');
  });
});
