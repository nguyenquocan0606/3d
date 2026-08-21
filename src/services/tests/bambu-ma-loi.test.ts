import { afterEach, describe, expect, it } from 'vitest';

import {
  chanDoanChang,
  docHms,
  docHmsTuHa,
  docPrintError,
  moTaLoiDeBao,
} from '../printer-integration/providers/bambu/ma-loi';
import { gopSau } from '../printer-integration/providers/bambu/mqtt-lan';
import { datTuDienLoi } from '../printer-integration/providers/bambu/tu-dien-loi';

/**
 * Máy Bambu không gửi chữ, chỉ gửi số. Ghép sai một phép dịch bit là ra mã lỗi vô nghĩa, mà lỗi
 * kiểu đó thì không ai phát hiện được cho tới lúc cần nó nhất.
 *
 * Các con số dưới đây lấy từ máy A1-2 thật (192.168.99.20) lúc nó đang ôm lỗi firmware AMS, và đã
 * đối chiếu khớp với mã mà Home Assistant báo cho cùng thời điểm.
 */

describe('docHms', () => {
  it('ghép attr + code thành mã HMS 4 cụm như wiki Bambu', () => {
    const [loi] = docHms([{ attr: 0x05000400, code: 0x00010044 }]);

    expect(loi.ma).toBe('0500_0400_0001_0044');
    expect(loi.wiki).toContain('0500_0400_0001_0044');
  });

  it('lấy mức độ từ 16 bit cao của code', () => {
    // Bậc 1 = nghiêm trọng: đúng cái mà HA gắn nhãn "fatal" cho lỗi của A1-2.
    expect(docHms([{ attr: 0x05000400, code: 0x00010044 }])[0]).toMatchObject({
      mucDo: 'nghiêm trọng',
      nang: true,
    });
    // Bậc 4 = nhắc nhở (VD tra dầu trục) — không được xếp vào loại phải dựng người dậy.
    expect(docHms([{ attr: 0x03000100, code: 0x00040001 }])[0]).toMatchObject({
      mucDo: 'nhắc nhở',
      nang: false,
    });
  });

  it('bỏ qua mảng rỗng và các mục toàn số 0', () => {
    expect(docHms(undefined)).toEqual([]);
    expect(docHms([])).toEqual([]);
    expect(docHms([{ attr: 0, code: 0 }])).toEqual([]);
  });
});

describe('docPrintError', () => {
  it('tách số nguyên thành 2 cụm hex', () => {
    // 83935249 là giá trị thô đọc được từ A1-2; HA hiển thị đúng "0500_C011".
    expect(docPrintError(83935249)).toBe('0500_C011');
  });

  it('không có lỗi thì trả null chứ không phải chuỗi "0000_0000"', () => {
    expect(docPrintError(0)).toBeNull();
    expect(docPrintError(undefined)).toBeNull();
  });
});

describe('chanDoanChang', () => {
  it('nhận ra sự cố thật và nói được lý do', () => {
    expect(chanDoanChang(35)).toMatchObject({ chang: 'paused_nozzle_clog', laSuCo: true });
    expect(chanDoanChang(6).lyDo).toBe('hết nhựa giữa chừng');
  });

  it('dừng do người hoặc do G-code không phải là sự cố', () => {
    // Phân biệt được hai cái này mới là điểm mấu chốt: cùng ra gcode_state PAUSE, nhưng một cái
    // đáng réo Zalo lúc 2 giờ sáng còn một cái thì không.
    expect(chanDoanChang(16)).toMatchObject({ chang: 'paused_user', laSuCo: false });
    expect(chanDoanChang(30).laSuCo).toBe(false);
    expect(chanDoanChang(5).laSuCo).toBe(false);
  });

  it('chặng bình thường thì không có lý do dừng', () => {
    expect(chanDoanChang(0)).toMatchObject({ chang: 'printing', lyDo: null, laSuCo: false });
    // X1 trả -1 lúc rảnh, P1 trả 255 — cả hai đều phải ra "idle".
    expect(chanDoanChang(-1).chang).toBe('idle');
    expect(chanDoanChang(255).chang).toBe('idle');
  });

  it('mã lạ (firmware mới) thì trả unknown chứ không nổ', () => {
    expect(chanDoanChang(9999)).toMatchObject({ chang: 'unknown', lyDo: null, laSuCo: false });
    expect(chanDoanChang(undefined).chang).toBe('unknown');
  });
});

describe('gopSau', () => {
  it('giữ lại trường cũ mà delta không nhắc tới', () => {
    const cu = { gcode_state: 'RUNNING', mc_percent: 26, hms: [{ attr: 1, code: 2 }] };
    const moi = { nozzle_temper: 219.9 };

    expect(gopSau(cu, moi as never)).toMatchObject({
      gcode_state: 'RUNNING',
      mc_percent: 26,
      hms: [{ attr: 1, code: 2 }],
      nozzle_temper: 219.9,
    });
  });

  it('không để delta rút gọn xoá mất khay AMS', () => {
    // Ca có thật: máy đẩy một tin chỉ có `ams` dạng rút gọn, không kèm mảng `ams.ams`.
    const cu = { ams: { ams: [{ id: '0', tray: [{ id: '0', tray_type: 'PETG', tray_color: 'C52C18FF' }] } ] } };
    const moi = { ams: { ams_exist_bits: '1' } };

    const ra = gopSau(cu, moi as never) as typeof cu & { ams: { ams_exist_bits: string } };
    expect(ra.ams.ams[0].tray[0].tray_type).toBe('PETG');
    expect(ra.ams.ams_exist_bits).toBe('1');
  });

  it('gộp khay theo id, không theo vị trí trong mảng', () => {
    const cu = { tray: [{ id: '0', tray_type: 'PETG' }, { id: '1', tray_type: 'PLA' }] };
    // Delta chỉ chứa đúng khay vừa đổi — nếu gộp theo vị trí thì khay '1' bị đè bằng khay '3'.
    const moi = { tray: [{ id: '3', tray_type: 'ABS' }] };

    const ra = gopSau(cu, moi as never) as typeof cu;
    expect(ra.tray).toHaveLength(3);
    expect(ra.tray.find((t) => t.id === '1')?.tray_type).toBe('PLA');
    expect(ra.tray.find((t) => t.id === '3')?.tray_type).toBe('ABS');
  });

  it('giá trị vô hướng thì delta thắng', () => {
    expect(gopSau({ mc_percent: 26 }, { mc_percent: 27 })).toEqual({ mc_percent: 27 });
    // hms rỗng là tín hiệu thật "đã hết lỗi", phải cho phép ghi đè.
    expect(gopSau({ hms: [{ attr: 1, code: 2 }] }, { hms: [] })).toEqual({ hms: [] });
  });
});

describe('moTaLoiDeBao', () => {
  it('lỗi HMS nghiêm trọng tới đâu cũng KHÔNG sinh thông báo', () => {
    // A1-2 ôm lỗi firmware AMS mức "fatal" suốt nhiều ngày mà vẫn in bình thường. Nếu cái này bắn
    // Zalo thì chỉ sau một đêm là cả xưởng tắt thông báo.
    expect(moTaLoiDeBao(chanDoanChang(0), null)).toBeNull();
  });

  it('máy dừng vì sự cố thì có thông báo, kèm mã lỗi bản in nếu có', () => {
    expect(moTaLoiDeBao(chanDoanChang(35), null)).toBe('tắc đầu phun');
    expect(moTaLoiDeBao(chanDoanChang(6), '0500_C011')).toBe('hết nhựa giữa chừng · mã lỗi 0500_C011');
  });

  it('thợ bấm dừng thì vẫn ghi lý do để người đọc biết là bình thường', () => {
    expect(moTaLoiDeBao(chanDoanChang(16), null)).toBe('người bấm tạm dừng');
  });
});

describe('docHmsTuHa', () => {
  it('đọc nhiều lỗi cùng lúc từ attribute của Home Assistant', () => {
    const ra = docHmsTuHa({
      Count: 2,
      '1-Code': 'HMS_0500_0400_0001_0044',
      '1-Error': 'The firmware of AMS A does not match the printer.',
      '1-Severity': 'fatal',
      '1-Wiki': 'https://wiki.bambulab.com/en/h2/troubleshooting/hmscode/0500_0400_0001_0044',
      '2-Code': 'HMS_0300_0100_0004_0001',
      '2-Error': 'Lubricate the rods.',
      '2-Severity': 'info',
    });

    expect(ra).toHaveLength(2);
    // Bỏ tiền tố HMS_ để trùng đúng dạng mã mà đường MQTT dựng ra.
    expect(ra[0]).toMatchObject({ ma: '0500_0400_0001_0044', mucDo: 'nghiêm trọng', nang: true });
    expect(ra[0].moTa).toContain('firmware of AMS A');
    expect(ra[1]).toMatchObject({ ma: '0300_0100_0004_0001', mucDo: 'nhắc nhở', nang: false });
    // Thiếu wiki thì tự dựng link từ mã.
    expect(ra[1].wiki).toContain('0300_0100_0004_0001');
  });

  it('máy sạch thì trả mảng rỗng', () => {
    expect(docHmsTuHa({ Count: 0 })).toEqual([]);
    expect(docHmsTuHa(null)).toEqual([]);
  });
});

describe('từ điển lỗi tiếng Việt', () => {
  /**
   * Máy in chỉ đẩy về số. Đưa mã hex trần cho thợ đứng máy thì vô dụng — Bambu có sẵn kho mô tả
   * tiếng Việt chính thức nên không phải tự dịch. Các ca dưới đây bơm từ điển giả, không gọi mạng.
   */
  const KHO = {
    hms: { '0500040000010044': 'Phần mềm cơ sở của AMS A không khớp với máy in.' },
    banIn: { '07008011': 'Sợi nhựa tại AMS đã hết. Hãy lắp sợi nhựa mới vào cùng một khe AMS.' },
  };

  afterEach(() => datTuDienLoi(undefined));

  it('docHms gắn chữ tiếng Việt vào mã', () => {
    datTuDienLoi(KHO);
    const [l] = docHms([{ attr: 0x05000400, code: 0x00010044 }]);

    expect(l.ma).toBe('0500_0400_0001_0044');
    expect(l.moTa).toContain('AMS A');
  });

  it('tin nhắn thông báo dùng chữ, không phải mã trần', () => {
    datTuDienLoi(KHO);
    expect(moTaLoiDeBao(chanDoanChang(35), '0700_8011')).toBe(
      'tắc đầu phun · Sợi nhựa tại AMS đã hết. Hãy lắp sợi nhựa mới vào cùng một khe AMS. (0700_8011)',
    );
  });

  it('mã lạ hoặc chưa tải từ điển thì vẫn hiện mã, không nuốt mất', () => {
    datTuDienLoi(KHO);
    expect(moTaLoiDeBao(chanDoanChang(0), '9999_9999')).toBe('mã lỗi 9999_9999');

    datTuDienLoi(undefined);
    expect(moTaLoiDeBao(chanDoanChang(0), '0700_8011')).toBe('mã lỗi 0700_8011');
    expect(docHms([{ attr: 0x05000400, code: 0x00010044 }])[0].moTa).toBeUndefined();
  });

  it('Home Assistant có chữ tiếng Anh thì vẫn ưu tiên tiếng Việt', () => {
    datTuDienLoi(KHO);
    const [l] = docHmsTuHa({
      Count: 1,
      '1-Code': 'HMS_0500_0400_0001_0044',
      '1-Error': 'The firmware of AMS A does not match the printer.',
      '1-Severity': 'fatal',
    });
    expect(l.moTa).toContain('Phần mềm cơ sở');
  });
});
