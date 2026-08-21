import { describe, expect, it, vi } from 'vitest';

/**
 * MQTT là nguồn chính, Home Assistant là lưới đỡ. Chỗ dễ sai nhất không phải lúc cả hai cùng sống,
 * mà là lúc giao thời: MQTT vừa tắt tiếng thì phải ngã sang HA chứ đừng báo "mất kết nối"; HA mà
 * cũng ôi thiu thì thà nhận là mất còn hơn hiện số liệu của nửa tiếng trước.
 */

vi.mock('../../utils/db', () => ({ default: { cloudAccount: {}, printer: {} } }));

import { BambuProvider } from '../printer-integration/providers/bambu';
import type { TrangThaiHa } from '../printer-integration/providers/bambu/ha-backup';
import { chanDoanTheoKhoa } from '../printer-integration/providers/bambu/ma-loi';

/** Cửa sổ nhìn vào phần private — dựng sẵn tình huống thay vì phải có máy in thật. */
type NoiBo = {
  may: Map<string, { prefix: string; ten: string; mqtt: unknown }>;
  ha: unknown;
};

const HA_MAU: TrangThaiHa = {
  gcodeState: 'RUNNING',
  tienDo: 47,
  tenFile: 'mu_coi.3mf',
  voi: 220, voiDat: 220, ban: 75, banDat: 75,  // HaBackup đã làm tròn trước khi tới đây
  conLaiGiay: 1800,
  lop: 40, tongLop: 99,
  chanDoan: chanDoanTheoKhoa('printing'),
  hms: [],
  printError: null,
  khay: [],
  anh: null,
  denBuong: false,
};

/** Dựng provider với đúng tình huống cần: MQTT sống/chết, HA có/không, HA còn tươi hay không. */
function dung(opts: { mqttSong: boolean | null; haCo: boolean; haTuoi?: boolean }) {
  const p = new BambuProvider('acc');
  const noiBo = p as unknown as NoiBo;

  noiBo.may = new Map([
    [
      'a1_1',
      {
        prefix: 'a1_1',
        ten: 'A1-1',
        mqtt:
          opts.mqttSong === null
            ? null // máy chưa khai IP/Access Code — vốn dĩ chỉ có đường HA
            : {
                conSong: opts.mqttSong,
                trangThai: {
                  gcode_state: 'RUNNING',
                  mc_percent: 93,
                  stg_cur: 0,
                  // Số thô y như máy A1-1 đẩy ra thật.
                  nozzle_temper: 219.96875,
                  nozzle_target_temper: 220,
                  bed_temper: 74.96875,
                  bed_target_temper: 75,
                },
              },
      },
    ],
  ]);

  noiBo.ha = opts.haCo
    ? { docTrangThai: () => HA_MAU, conTuoi: opts.haTuoi ?? true, coCauHinh: true }
    : null;

  return p;
}

const nguonCua = (p: BambuProvider) =>
  (p.getStatus('a1_1')?.extendedInfo?.payload as { nguon?: string; mqtt_roi?: boolean } | undefined);

describe('BambuProvider chọn nguồn dữ liệu', () => {
  it('MQTT còn sống thì dùng MQTT, kệ Home Assistant', () => {
    const p = dung({ mqttSong: true, haCo: true });
    expect(nguonCua(p)?.nguon).toBe('mqtt');
    expect(p.getStatus('a1_1')?.progress).toBe(93);
  });

  it('MQTT tắt tiếng thì ngã sang Home Assistant, không báo mất kết nối', () => {
    const p = dung({ mqttSong: false, haCo: true });
    expect(nguonCua(p)?.nguon).toBe('ha');
    expect(p.getStatus('a1_1')?.progress).toBe(47);
    // Cờ này để UI phân biệt "máy có MQTT nhưng đang rớt" với "máy vốn chỉ có HA".
    expect(nguonCua(p)?.mqtt_roi).toBe(true);
  });

  it('máy vốn không cấu hình MQTT thì dùng HA mà không kêu ca gì', () => {
    const p = dung({ mqttSong: null, haCo: true });
    expect(nguonCua(p)?.nguon).toBe('ha');
    expect(nguonCua(p)?.mqtt_roi).toBe(false);
  });

  it('cả hai đều im thì mới nhận là mất kết nối', () => {
    expect(nguonCua(dung({ mqttSong: false, haCo: false }))?.nguon).toBe('mat');
    expect(dung({ mqttSong: false, haCo: false }).getStatus('a1_1')?.status).toBe('offline');
  });

  it('dữ liệu HA quá cũ thì coi như mất, đừng hiện số của nửa tiếng trước', () => {
    const p = dung({ mqttSong: false, haCo: true, haTuoi: false });
    expect(nguonCua(p)?.nguon).toBe('mat');
  });

  it('máy lạ không có trong danh sách thì trả null chứ không dựng trạng thái giả', () => {
    expect(dung({ mqttSong: true, haCo: true }).getStatus('khong-ton-tai')).toBeNull();
  });
});

describe('nhiệt độ', () => {
  it('làm tròn ngay tại nguồn, không để lọt số thập phân ra ngoài', () => {
    // Máy đẩy 219.96875 / 74.96875 — phần thập phân là nhiễu cảm biến. Thẻ máy in trên web in
    // thẳng giá trị này ra màn hình nên chỉ cần lọt là hiện "219.96875°".
    const st = dung({ mqttSong: true, haCo: false }).getStatus('a1_1')!;

    expect(st.nozzleTemp).toBe(220);
    expect(st.bedTemp).toBe(75);
    for (const v of [st.nozzleTemp, st.nozzleTargetTemp, st.bedTemp, st.bedTargetTemp]) {
      expect(Number.isInteger(v)).toBe(true);
    }
  });
});
