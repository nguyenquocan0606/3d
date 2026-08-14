import { describe, it, expect } from 'vitest';
import { buildTSPLCommand, removeDiacritics, sanitizeTSPL, LabelData } from '../../utils/tspl-printer';

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
