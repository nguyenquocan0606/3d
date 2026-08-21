import type { MqttClient } from 'mqtt';

/**
 * Một kết nối MQTT tới đúng một máy Bambu trong LAN.
 *
 * Khác mọi provider trước đây ở chỗ **mỗi máy in tự nó là một broker** (cổng 8883, TLS, user
 * `bblp`, mật khẩu là Access Code trên màn hình máy), nên không có "một kết nối cho cả tài khoản".
 */

/** Máy chỉ đẩy delta. Không có `pushall` thì mãi mãi không thấy trạng thái đầy đủ. */
export const LENH_PUSHALL = JSON.stringify({ pushing: { sequence_id: '0', command: 'pushall' } });

/**
 * Xin lại toàn bộ trạng thái định kỳ. Delta lâu ngày có thể lệch (mất gói, máy khởi động lại giữa
 * chừng), và `hms[]` chỉ được gửi lúc đổi nên cần mốc chuẩn để đối chiếu.
 */
const CHU_KY_PUSHALL_MS = 5 * 60_000;

/** Quá lâu không nghe thấy gì thì coi như mất tín hiệu, kể cả khi socket TCP vẫn treo đó. */
export const NGUONG_IM_LANG_MS = 90_000;

/** Một khay nhựa trong báo cáo AMS. */
export type Khay = { tray_type?: string; tray_color?: string };

/**
 * Báo cáo MQTT của máy — chỉ khai những trường thực sự đọc tới.
 * Tất cả đều optional: sau `pushall` máy chỉ đẩy delta 4-6 trường, nên trường nào cũng có thể vắng.
 */
export type BaoCao = {
  gcode_state?: string;
  stg_cur?: number;
  mc_percent?: number;
  mc_remaining_time?: number;
  subtask_name?: string;
  gcode_file?: string;
  nozzle_temper?: number;
  nozzle_target_temper?: number;
  bed_temper?: number;
  bed_target_temper?: number;
  layer_num?: number;
  total_layer_num?: number;
  wifi_signal?: number;
  print_error?: number;
  hms?: Array<{ attr?: number; code?: number }>;
  ams?: { ams?: Array<{ tray?: Khay[] }> };
  vt_tray?: Khay;
  lights_report?: Array<{ node?: string; mode?: string }>;
};

/** Object thuần (không phải mảng, không phải null) — thứ duy nhất đáng đệ quy vào. */
function laObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Gộp delta vào trạng thái cũ, có đệ quy.
 *
 * Không dùng spread một tầng được: đã bắt tận tay máy A1-1 đẩy một tin chỉ có `ams` dạng rút gọn
 * (không kèm mảng `ams.ams`). Spread một tầng sẽ thay nguyên cụm `ams`, xoá sạch 4 khay nhựa vừa
 * đọc được ở tin `pushall` trước đó — UI mất màu, và tệ hơn là mọi suy luận dựa trên AMS đều sai.
 *
 * Mảng khay thì gộp theo `id` chứ không theo vị trí: delta có thể chỉ chứa đúng khay vừa đổi, mà
 * số khay của AMS là cố định nên không sợ giữ lại khay đã bị gỡ.
 */
export function gopSau<T>(cu: T, moi: T): T {
  if (Array.isArray(cu) && Array.isArray(moi)) {
    const coId = (x: unknown) => laObject(x) && 'id' in x;
    if (cu.every(coId) && moi.every(coId)) {
      const theoId = new Map(cu.map((x) => [(x as { id: unknown }).id, x]));
      for (const m of moi) {
        const id = (m as { id: unknown }).id;
        theoId.set(id, theoId.has(id) ? gopSau(theoId.get(id), m) : m);
      }
      return [...theoId.values()] as T;
    }
    return moi;
  }

  if (laObject(cu) && laObject(moi)) {
    const ra: Record<string, unknown> = { ...cu };
    for (const [k, v] of Object.entries(moi)) ra[k] = k in cu ? gopSau(cu[k], v) : v;
    return ra as T;
  }

  return moi;
}

export class KetNoiMqtt {
  readonly serial: string;
  readonly ip: string;
  private accessCode: string;
  private ten: string;
  private client: MqttClient | null = null;
  private henPushall: NodeJS.Timeout | null = null;
  private daDung = false;
  private soLenh = 0;

  /** Trạng thái đã GỘP qua nhiều delta. */
  trangThai: BaoCao = {};
  /** Mốc nhận tin gần nhất. 0 = chưa nghe thấy gì kể từ lúc dựng. */
  nhanLuc = 0;

  constructor(input: { serial: string; ip: string; accessCode: string; ten: string }) {
    this.serial = input.serial;
    this.ip = input.ip;
    this.accessCode = input.accessCode;
    this.ten = input.ten;
  }

  /** Còn nghe thấy máy hay không — cơ sở để quyết định có phải ngã sang Home Assistant chưa. */
  get conSong(): boolean {
    return this.nhanLuc > 0 && Date.now() - this.nhanLuc <= NGUONG_IM_LANG_MS;
  }

  async noi(): Promise<void> {
    this.daDung = false;
    // Nạp trễ giống sync-notify.service.ts: `mqtt` là gói nặng, chỉ kéo vào khi thật sự cần.
    const { connect } = await import('mqtt');
    if (this.daDung) return;

    const client = connect(`mqtts://${this.ip}:8883`, {
      username: 'bblp',
      password: this.accessCode,
      // Máy dùng cert tự ký của "BBL CA" (CN = số serial) nên không verify theo CA hệ thống được.
      // Chấp nhận được vì đây là LAN nội bộ và địa chỉ là IP tĩnh mình tự đặt.
      rejectUnauthorized: false,
      connectTimeout: 8_000,
      reconnectPeriod: 10_000,
      clientId: `3dmanage-${this.serial.slice(-6)}-${process.pid}`,
    });

    client.on('connect', () => {
      console.log(`[Bambu MQTT] Đã nối ${this.ten} (${this.ip}).`);
      client.subscribe(`device/${this.serial}/report`, (err) => {
        if (err) return console.error(`[Bambu MQTT] Không subscribe được ${this.ten}:`, err.message);
        client.publish(`device/${this.serial}/request`, LENH_PUSHALL);
      });
    });

    client.on('message', (_topic, buf) => {
      let p: BaoCao | undefined;
      try {
        p = (JSON.parse(buf.toString()) as { print?: BaoCao })?.print;
      } catch {
        return;
      }
      if (!p) return;
      this.nhanLuc = Date.now();
      this.trangThai = gopSau(this.trangThai, p);
    });

    // Không log mỗi lần lỗi: mqtt.js tự thử lại mỗi 10 giây, máy tắt qua đêm sẽ ngập log.
    client.on('error', (e) => {
      if (this.nhanLuc > 0) console.warn(`[Bambu MQTT] ${this.ten} rớt: ${e.message}`);
      this.nhanLuc = 0;
    });

    this.client = client;
    this.henPushall = setInterval(() => {
      if (client.connected) client.publish(`device/${this.serial}/request`, LENH_PUSHALL);
    }, CHU_KY_PUSHALL_MS);
    this.henPushall.unref?.();
  }

  dong() {
    this.daDung = true;
    if (this.henPushall) clearInterval(this.henPushall);
    this.client?.end(true);
    this.client = null;
  }

  /** Đẩy một gói lệnh lên máy. Trả false nếu chưa nối được. */
  async guiLenh(goi: Record<string, unknown>): Promise<boolean> {
    if (!this.client?.connected) return false;
    const co = { ...goi };
    // Bambu đòi sequence_id trong mọi lệnh; trùng số thì máy bỏ qua lệnh sau.
    for (const khoi of Object.values(co)) {
      if (laObject(khoi) && !('sequence_id' in khoi)) khoi.sequence_id = String(++this.soLenh);
    }
    return new Promise((giaiQuyet) => {
      this.client!.publish(`device/${this.serial}/request`, JSON.stringify(co), (err) => {
        if (err) console.error(`[Bambu MQTT] Gửi lệnh hỏng:`, err.message);
        giaiQuyet(!err);
      });
    });
  }
}

/**
 * Thử nối một máy trước khi lưu cấu hình.
 *
 * Sai Access Code là kiểu hỏng phổ biến nhất, mà triệu chứng của nó lại y hệt máy tắt điện — không
 * thử ngay lúc bấm Lưu thì người dùng sẽ ngồi đợi thông báo không bao giờ tới.
 */
export async function thuKetNoi(
  ip: string,
  accessCode: string,
  serial: string,
): Promise<{ ok: boolean; loi?: string; trangThai?: string }> {
  const { connect } = await import('mqtt');
  return new Promise((giaiQuyet) => {
    const client = connect(`mqtts://${ip}:8883`, {
      username: 'bblp',
      password: accessCode,
      rejectUnauthorized: false,
      connectTimeout: 8_000,
      reconnectPeriod: 0, // thử một phát rồi thôi, không để nó lặp vô hạn trong request
      clientId: `3dmanage-thu-${Date.now()}`,
    });

    const xong = (kq: { ok: boolean; loi?: string; trangThai?: string }) => {
      clearTimeout(hen);
      client.end(true);
      giaiQuyet(kq);
    };

    // Nối được nhưng máy im ru cũng là hỏng — thường do sai serial nên subscribe nhầm topic.
    const hen = setTimeout(
      () => xong({ ok: false, loi: 'Nối được nhưng máy không đẩy dữ liệu — kiểm tra lại ID máy in.' }),
      15_000,
    );

    client.on('error', (e) =>
      xong({
        ok: false,
        loi: /not authorized|bad user name|password/i.test(e.message)
          ? 'Sai Access Code.'
          : `Không nối được ${ip}: ${e.message}`,
      }),
    );

    client.on('connect', () => {
      client.subscribe(`device/${serial}/report`, (err) => {
        if (err) return xong({ ok: false, loi: `Không subscribe được: ${err.message}` });
        client.publish(`device/${serial}/request`, LENH_PUSHALL);
      });
    });

    client.on('message', (_topic, buf) => {
      try {
        const p = (JSON.parse(buf.toString()) as { print?: BaoCao })?.print;
        if (p) xong({ ok: true, trangThai: p.gcode_state ?? 'UNKNOWN' });
      } catch {
        /* tin hỏng thì bỏ qua, chờ tin sau */
      }
    });
  });
}
