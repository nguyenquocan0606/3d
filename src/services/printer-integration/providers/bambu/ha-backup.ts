import { chanDoanTheoKhoa, docHmsTuHa, type ChanDoan, type LoiHms } from './ma-loi';

/**
 * Đường dự phòng: đọc trạng thái máy in qua Home Assistant khi MQTT trực tiếp im tiếng.
 *
 * Chỉ là backup nên cố ý **không** poll liên tục: mỗi nhịp chỉ gọi HA nếu đang có máy nào mất MQTT.
 * Xưởng chạy bình thường thì file này gần như không tốn gì.
 *
 * Đổi lại so với MQTT: chậm hơn (HA tự poll máy in vài giây một lần, cộng thêm nhịp của mình), và
 * thiếu vài số liệu thô. Bù lại HA giải mã sẵn mã HMS ra tiếng Anh nên mô tả lỗi lại dài dòng hơn.
 */

type HaEntity = {
  entity_id: string;
  state: string;
  attributes?: Record<string, unknown>;
};

export type TrangThaiHa = {
  gcodeState: string;
  tienDo: number;
  tenFile: string | null;
  voi: number;
  voiDat: number;
  ban: number;
  banDat: number;
  conLaiGiay: number;
  lop: number | null;
  tongLop: number | null;
  chanDoan: ChanDoan;
  hms: LoiHms[];
  printError: string | null;
  khay: Array<{ name: string; color: string } | null>;
  anh: string | null;
  denBuong: boolean;
};

export class HaBackup {
  private url: string;
  private token: string;
  private duLieu: Map<string, TrangThaiHa> = new Map();
  private layLuc = 0;

  constructor(url: string, token: string) {
    this.url = url.replace(/\/$/, '');
    this.token = token;
  }

  get coCauHinh(): boolean {
    return Boolean(this.url && this.token);
  }

  docTrangThai(prefix: string): TrangThaiHa | null {
    return this.duLieu.get(prefix) ?? null;
  }

  /** Dữ liệu HA cũ quá thì đừng dùng — thà báo mất kết nối còn hơn hiện số của nửa tiếng trước. */
  get conTuoi(): boolean {
    return this.layLuc > 0 && Date.now() - this.layLuc < 120_000;
  }

  /** Kéo một lượt trạng thái cho các prefix cần. Nuốt mọi lỗi: đây chỉ là đường dự phòng. */
  async lamMoi(prefixes: string[]): Promise<void> {
    if (!this.coCauHinh || prefixes.length === 0) return;
    try {
      const res = await fetch(`${this.url}/api/states`, {
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      });
      if (!res.ok) return;
      const states = (await res.json()) as HaEntity[];
      this.layLuc = Date.now();
      for (const p of prefixes) this.duLieu.set(p, this.doc(p, states));
    } catch (e) {
      console.warn('[Bambu HA] Không kéo được trạng thái:', e instanceof Error ? e.message : e);
    }
  }

  private doc(prefix: string, states: HaEntity[]): TrangThaiHa {
    const cua = states.filter((s) => s.entity_id.includes(prefix));
    const tim = (id: string) => cua.find((s) => s.entity_id === id);
    const sensor = (hau: string) => tim(`sensor.${prefix}_${hau}`)?.state ?? null;
    const so = (hau: string) => parseFloat(sensor(hau) ?? '0') || 0;
    // Nhiệt độ luôn là số nguyên: phần thập phân chỉ là nhiễu cảm biến. Giữ cùng quy ước với
    // đường MQTT để hai nguồn không hiện lệch nhau lúc chuyển qua lại.
    const nhiet = (hau: string) => Math.round(so(hau));

    // HA trả 'unavailable'/'unknown' như một state bình thường; để lọt vào tên file thì thông báo
    // sẽ ghi "Bản in: unavailable" — đã từng xảy ra thật.
    const chu = (hau: string) => {
      const v = sensor(hau);
      return v && v !== 'unavailable' && v !== 'unknown' ? v : null;
    };

    const hmsAttr = tim(`binary_sensor.${prefix}_hms_errors`)?.attributes;
    const loiIn = tim(`binary_sensor.${prefix}_print_error`)?.attributes;
    const maLoiIn = String(loiIn?.code ?? '') || null;

    return {
      gcodeState: (sensor('print_status') ?? 'unknown').toUpperCase(),
      tienDo: so('print_progress'),
      tenFile: chu('gcode_filename') ?? chu('task_name') ?? chu('gcode_file_downloaded'),
      voi: nhiet('nozzle_temperature'),
      voiDat: nhiet('nozzle_target_temperature'),
      ban: nhiet('bed_temperature'),
      banDat: nhiet('bed_target_temperature'),
      // Sensor "Remaining time" của HA trả SỐ THẬP PHÂN ĐƠN VỊ GIỜ (VD "2.883" = 2h53m). Giao diện
      // HA tự format đẹp thành "2h 53m" nhưng giá trị thô qua REST luôn là giờ, KHÔNG phải phút.
      conLaiGiay: Math.round(this.gio(sensor('remaining_time')) * 3600),
      lop: sensor('current_layer') ? parseInt(sensor('current_layer') as string, 10) : null,
      tongLop: sensor('total_layer_count') ? parseInt(sensor('total_layer_count') as string, 10) : null,
      chanDoan: chanDoanTheoKhoa(sensor('current_stage') ?? 'unknown'),
      hms: docHmsTuHa(hmsAttr),
      printError: maLoiIn,
      khay: this.khay(prefix, cua),
      anh: (() => {
        const anh = tim(`image.${prefix}_cover_image`)?.attributes?.entity_picture;
        return typeof anh === 'string' ? `${this.url}${anh}` : null;
      })(),
      denBuong: tim(`light.${prefix}_chamber_light`)?.state === 'on',
    };
  }

  private gio(raw: string | null): number {
    if (!raw) return 0;
    const t = raw.trim();
    if (/^-?\d+(\.\d+)?$/.test(t)) return parseFloat(t);
    // Dự phòng cho bản integration khác có thể trả chuỗi "Xh Ym"
    const h = t.match(/(\d+)\s*h/i);
    const m = t.match(/(\d+)\s*m/i);
    if (!h && !m) return 0;
    return (h ? parseInt(h[1], 10) : 0) + (m ? parseInt(m[1], 10) : 0) / 60;
  }

  /**
   * KHÔNG được hard-code `ams_1`: ha-bambulab đặt tên entity theo ID mà máy in báo về cho cụm AMS,
   * chứ không đánh số từ 1. A2L trong xưởng đang ra `sensor.<prefix>_ams_17_tray_1..4`.
   */
  private khay(prefix: string, cua: HaEntity[]): Array<{ name: string; color: string } | null> {
    const mau = new RegExp(`^sensor\\.${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_ams_(\\d+)_tray_(\\d+)$`);
    const found = cua
      .map((s) => ({ s, m: mau.exec(s.entity_id) }))
      .filter((x): x is { s: HaEntity; m: RegExpExecArray } => x.m !== null)
      .sort((a, b) => Number(a.m[1]) - Number(b.m[1]) || Number(a.m[2]) - Number(b.m[2]))
      .map((x) => x.s);

    // Máy không lắp AMS thì cuộn ngoài là nguồn duy nhất — coi là khay số 1 để UI vẫn có màu.
    const nguon = found.length > 0 ? found : [cua.find((s) => s.entity_id === `sensor.${prefix}_externalspool_external_spool`)];

    return nguon.map((e) => {
      if (!e || ['Empty', 'unknown', 'unavailable'].includes(e.state)) return null;
      let hex = String(e.attributes?.color ?? '#ffffff');
      if (!hex.startsWith('#')) hex = '#' + hex.substring(0, 6);
      // HA trả màu kèm alpha, VD "#C52C18FF" — cắt bớt để CSS hiểu được.
      else if (hex.length > 7) hex = hex.substring(0, 7);
      return { name: e.state, color: hex };
    });
  }
}
