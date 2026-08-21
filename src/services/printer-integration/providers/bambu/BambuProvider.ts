import prisma from '@/utils/db';
import { IPrinterProvider, PrinterStatusData } from '../../types';
import { HaBackup, type TrangThaiHa } from './ha-backup';
import { chanDoanChang, docHms, docPrintError, moTaLoiDeBao, type ChanDoan, type LoiHms } from './ma-loi';
import { KetNoiMqtt, type BaoCao } from './mqtt-lan';

/**
 * Provider duy nhất cho máy Bambu: **MQTT trong LAN là nguồn chính, Home Assistant chỉ là lưới đỡ**.
 *
 * Vì sao bỏ đường HA làm chính: máy in → HA → vòng quét của mình là hai tầng trễ, sự cố mất 20-30
 * giây mới tới tay người; HA lại là điểm chết duy nhất cho cả xưởng. Nối thẳng MQTT thì máy tự đẩy
 * mỗi ~2,5 giây và lấy được `hms[]` / `print_error` / `stg_cur` thô.
 *
 * Vẫn giữ HA vì khi máy rớt wifi hoặc mình gõ nhầm Access Code thì thà có số liệu chậm còn hơn
 * không có gì. Chuyển qua lại tự động, không cần ai bấm.
 */

/** Nhịp kiểm tra xem có máy nào cần ngã sang HA không. */
const CHU_KY_DO_MS = 20_000;

type MayIn = {
  /** Khóa tra cứu = `cloudPrinterId`, cũng chính là tiền tố entity bên Home Assistant. */
  prefix: string;
  ten: string;
  mqtt: KetNoiMqtt | null;
};

export class BambuProvider implements IPrinterProvider {
  private accountId: string;
  private may: Map<string, MayIn> = new Map();
  private ha: HaBackup | null = null;
  private hen: NodeJS.Timeout | null = null;
  private daDung = false;

  constructor(accountId: string) {
    this.accountId = accountId;
  }

  async connect(): Promise<void> {
    this.daDung = false;

    const [taiKhoan, rows] = await Promise.all([
      prisma.cloudAccount.findUnique({ where: { id: this.accountId } }),
      prisma.printer.findMany({
        where: { cloudAccountId: this.accountId, cloudPrinterId: { not: null } },
        select: { name: true, cloudPrinterId: true, lanIp: true, lanAccessCode: true, lanSerial: true },
      }),
    ]);

    // Tài khoản giữ cấu hình Home Assistant (email = URL, token = long-lived token). Không có thì
    // chạy thuần MQTT, chỉ mất đường dự phòng.
    if (taiKhoan?.email && taiKhoan.token) {
      this.ha = new HaBackup(taiKhoan.email, taiKhoan.token);
    }

    for (const r of rows) {
      const prefix = r.cloudPrinterId;
      if (!prefix || this.may.has(prefix)) continue;

      const duMqtt = Boolean(r.lanIp && r.lanAccessCode && r.lanSerial);
      const mqtt = duMqtt
        ? new KetNoiMqtt({
            serial: r.lanSerial as string,
            ip: r.lanIp as string,
            accessCode: r.lanAccessCode as string,
            ten: r.name,
          })
        : null;

      this.may.set(prefix, { prefix, ten: r.name, mqtt });
      if (mqtt) mqtt.noi().catch((e) => console.error(`[Bambu] Không nối được ${r.name}:`, e));
    }

    if (this.may.size === 0) {
      console.warn(`[Bambu] Tài khoản ${this.accountId} chưa có máy in nào.`);
      return;
    }

    this.hen = setInterval(() => this.doVaBu(), CHU_KY_DO_MS);
    this.hen.unref?.();
    // Chạy ngay một nhịp: máy nào chưa cấu hình MQTT thì cần HA có dữ liệu từ đầu.
    this.doVaBu();
  }

  /** Máy nào mất MQTT thì nhờ HA đọc hộ. Cả xưởng chạy ngon thì không gọi HA phát nào. */
  private doVaBu() {
    if (this.daDung || !this.ha?.coCauHinh) return;
    const can = [...this.may.values()].filter((m) => !m.mqtt?.conSong).map((m) => m.prefix);
    if (can.length > 0) this.ha.lamMoi(can);
  }

  async disconnect(): Promise<void> {
    this.daDung = true;
    if (this.hen) clearInterval(this.hen);
    for (const m of this.may.values()) m.mqtt?.dong();
    this.may.clear();
  }

  async fetchPrinters(): Promise<Array<{ id: string; name: string; status: string }>> {
    return [...this.may.values()].map((m) => ({
      id: m.prefix,
      name: m.ten,
      status: this.getStatus(m.prefix)?.status ?? 'offline',
    }));
  }

  getStatus(printerId: string): PrinterStatusData | null {
    const may = this.may.get(printerId);
    if (!may) return null;

    if (may.mqtt?.conSong) return this.tuMqtt(may.mqtt.trangThai, printerId);

    const ha = this.ha?.docTrangThai(printerId);
    if (ha && this.ha?.conTuoi) return this.tuHa(ha, may.mqtt !== null);

    return {
      status: 'offline',
      nozzleTemp: 0, nozzleTargetTemp: 0, bedTemp: 0, bedTargetTemp: 0, progress: 0,
      extendedInfo: { provider: 'bambu', payload: { print_status: 'OFFLINE', nguon: 'mat' } },
    };
  }

  /** Gộp trạng thái thô thành `status` chung. */
  private gomTrangThai(gcodeState: string): PrinterStatusData['status'] {
    if (gcodeState === 'RUNNING' || gcodeState === 'PREPARE' || gcodeState === 'SLICING') return 'printing';
    if (gcodeState === 'PAUSE' || gcodeState === 'FAILED') return 'error';
    if (gcodeState === 'FINISH' || gcodeState === 'IDLE') return 'idle';
    return 'offline';
  }

  private nen(chanDoan: ChanDoan, hms: LoiHms[], printError: string | null, nguon: string) {
    return {
      nguon,
      stage: chanDoan.chang,
      ly_do_dung: chanDoan.lyDo,
      dung_do_su_co: chanDoan.laSuCo,
      // Nguyên mảng, đã xếp lỗi nặng lên trước — UI hiện được nhiều lỗi cùng lúc.
      hms: [...hms].sort((a, b) => Number(b.nang) - Number(a.nang)),
      print_error: printError,
    };
  }

  private tuMqtt(t: BaoCao, prefix: string): PrinterStatusData {
    const gcodeState = String(t.gcode_state ?? '').toUpperCase();
    const chanDoan = chanDoanChang(t.stg_cur);
    const hms = docHms(t.hms);
    const printError = docPrintError(t.print_error);

    return {
      status: this.gomTrangThai(gcodeState),
      // Máy đẩy nhiệt kiểu 219.96875 — phần thập phân là nhiễu cảm biến, không mang thông tin gì.
      // Làm tròn ngay tại nguồn để web, app và tin nhắn đều nhận cùng một con số.
      nozzleTemp: Math.round(Number(t.nozzle_temper ?? 0)),
      nozzleTargetTemp: Math.round(Number(t.nozzle_target_temper ?? 0)),
      bedTemp: Math.round(Number(t.bed_temper ?? 0)),
      bedTargetTemp: Math.round(Number(t.bed_target_temper ?? 0)),
      progress: Number(t.mc_percent ?? 0),
      // `mc_remaining_time` là PHÚT (khác hẳn sensor của HA vốn trả giờ thập phân).
      remainingTimeSeconds: Number(t.mc_remaining_time ?? 0) * 60,
      fileName: t.subtask_name || t.gcode_file || undefined,
      errorMessage: moTaLoiDeBao(chanDoan, printError) ?? undefined,
      // Ảnh nằm trong file 3MF trên máy in, phải kéo qua FTPS nên không lấy ở đây được (getStatus
      // là hàm đồng bộ, mà kéo mất mấy giây). Trỏ sang route riêng, nó tự tải và nhớ cache.
      // Tên file nằm trong URL nên đổi bản in là trình duyệt tự xin ảnh mới.
      previewUrl: t.gcode_file
        ? `/api/printers/preview?may=${encodeURIComponent(prefix)}&f=${encodeURIComponent(t.gcode_file)}`
        : undefined,
      materials: this.khayTuMqtt(t),
      extendedInfo: {
        provider: 'bambu',
        payload: {
          // Giữ đúng tên `print_status` mà vòng giám sát đang đọc để tách "tạm dừng" khỏi "lỗi".
          print_status: gcodeState,
          ...this.nen(chanDoan, hms, printError, 'mqtt'),
          layer_num: t.layer_num,
          total_layers: t.total_layer_num,
          remaining_time: t.mc_remaining_time,
          wifi_signal: t.wifi_signal,
          current_print: t.subtask_name,
          chamber_light: t.lights_report?.some((l) => l.node === 'chamber_light' && l.mode === 'on') ?? false,
        },
      },
    };
  }

  private tuHa(h: TrangThaiHa, coCauHinhMqtt: boolean): PrinterStatusData {
    const printError = h.printError;
    return {
      status: this.gomTrangThai(h.gcodeState),
      nozzleTemp: h.voi,
      nozzleTargetTemp: h.voiDat,
      bedTemp: h.ban,
      bedTargetTemp: h.banDat,
      progress: h.tienDo,
      remainingTimeSeconds: h.conLaiGiay,
      fileName: h.tenFile ?? undefined,
      errorMessage: moTaLoiDeBao(h.chanDoan, printError) ?? undefined,
      previewUrl: h.anh ?? undefined,
      materials: h.khay,
      extendedInfo: {
        provider: 'bambu',
        payload: {
          print_status: h.gcodeState,
          ...this.nen(h.chanDoan, h.hms, printError, 'ha'),
          // Phân biệt "máy này vốn chỉ có HA" với "máy có MQTT nhưng đang rớt" — UI cần cảnh báo
          // trường hợp thứ hai, còn trường hợp đầu là bình thường.
          mqtt_roi: coCauHinhMqtt,
          layer_num: h.lop,
          total_layers: h.tongLop,
          current_print: h.tenFile,
          chamber_light: h.denBuong,
        },
      },
    };
  }

  private khayTuMqtt(t: BaoCao): Array<{ name: string; color: string } | null> {
    const mau = (hex: unknown) => {
      const s = String(hex ?? '');
      return s.length >= 6 ? `#${s.slice(0, 6)}` : '#ffffff';
    };
    const cum = t.ams?.ams;
    if (Array.isArray(cum) && cum.length > 0) {
      // Trải phẳng nhiều cụm AMS theo thứ tự để slot 5 rơi vào khay 1 của cụm thứ hai.
      return cum
        .flatMap((c) => (Array.isArray(c?.tray) ? c.tray : []))
        .map((k) => (k?.tray_type ? { name: String(k.tray_type), color: mau(k.tray_color) } : null));
    }
    // Máy không lắp AMS: cuộn ngoài là nguồn duy nhất, coi như khay số 1.
    return t.vt_tray?.tray_type ? [{ name: String(t.vt_tray.tray_type), color: mau(t.vt_tray.tray_color) }] : [];
  }

  /**
   * Lệnh điều khiển chỉ đi qua MQTT.
   *
   * Không làm đường vòng qua HA: MQTT chết gần như luôn đồng nghĩa máy in không với tới được, mà
   * HA cũng nói chuyện với đúng cái máy đó nên có vòng qua nó cũng vô ích.
   *
   * Lưu ý firmware mới của Bambu đòi bật Developer Mode thì lệnh mới chạy — riêng phần ĐỌC trạng
   * thái thì không cần.
   */
  async sendCommand(
    printerId: string,
    command: string,
    payload?: {
      on?: boolean | string;
      value?: number | string;
      target?: number;
      speed?: number;
      spools?: Array<{ printerSlot?: number | null; filament?: { type?: string; colorHex?: string } }>;
    },
  ): Promise<boolean> {
    const mqtt = this.may.get(printerId)?.mqtt;
    if (!mqtt?.conSong) {
      console.warn(`[Bambu] ${printerId} chưa nối MQTT, không gửi được lệnh "${command}".`);
      return false;
    }

    const gcode = (line: string) => ({ print: { command: 'gcode_line', param: `${line}\n` } });
    // UI cũ gửi lẫn lộn `value`, `target`, `speed` tuỳ lệnh — nhận cả ba cho khỏi vỡ.
    const so = Math.round(Number(payload?.value ?? payload?.target ?? payload?.speed ?? 0));

    if (command === 'pause' || command === 'resume' || command === 'stop') {
      return mqtt.guiLenh({ print: { command } });
    }
    if (command === 'light') {
      const bat = payload?.on === true || payload?.on === 'true';
      return mqtt.guiLenh({
        system: {
          command: 'ledctrl', led_node: 'chamber_light', led_mode: bat ? 'on' : 'off',
          led_on_time: 500, led_off_time: 500, loop_times: 0, interval_time: 0,
        },
      });
    }
    if (command === 'sync-ams') {
      const cuon = payload?.spools ?? [];
      if (cuon.length === 0) return true;
      let xong = 0;
      for (const c of cuon) {
        if (!c.printerSlot) continue;
        // Slot người dùng đánh 1..N, máy đánh cụm/khay từ 0 — mỗi cụm AMS 4 khay.
        const stt = c.printerSlot - 1;
        const ok = await this.setFilament(
          printerId,
          Math.floor(stt / 4),
          stt % 4,
          c.filament?.type ?? 'PLA',
          c.filament?.colorHex ?? '#FFFFFF',
        );
        if (ok) xong++;
      }
      return xong > 0;
    }
    if (command === 'temp-nozzle') return mqtt.guiLenh(gcode(`M104 S${so}`));
    if (command === 'temp-bed') return mqtt.guiLenh(gcode(`M140 S${so}`));
    // UI gửi phần trăm, G-code cần thang 0-255.
    if (command === 'fan') return mqtt.guiLenh(gcode(`M106 P1 S${Math.round((Math.max(0, Math.min(100, so)) / 100) * 255)}`));

    console.warn(`[Bambu] Chưa hỗ trợ lệnh "${command}".`);
    return false;
  }

  /** Đẩy thông tin cuộn nhựa lên khay AMS (nút "đồng bộ AMS" trên web/app). */
  async setFilament(
    printerId: string,
    amsId: number,
    trayId: number,
    type: string,
    colorHex: string,
  ): Promise<boolean> {
    const mqtt = this.may.get(printerId)?.mqtt;
    if (!mqtt?.conSong) return false;

    const loai = (type || 'PLA').toUpperCase();
    // Mã nhựa "generic" của Bambu — đủ để máy đặt đúng dải nhiệt, không cần đúng hãng.
    const maNhua = loai.includes('PETG') ? 'GFG99'
      : loai.includes('ABS') ? 'GFB99'
      : loai.includes('TPU') ? 'GFU99'
      : 'GFL99';
    const [nhietMin, nhietMax] = loai.includes('PETG') ? [220, 260]
      : loai.includes('ABS') ? [240, 280]
      : [190, 230];

    let hex = (colorHex || '#FFFFFF').replace('#', '').toUpperCase();
    if (hex.length === 6) hex += 'FF'; // máy đòi đủ kênh alpha

    return mqtt.guiLenh({
      print: {
        command: 'ams_filament_setting',
        ams_id: amsId,
        tray_id: trayId,
        tray_info_idx: maNhua,
        tray_color: hex,
        tray_type: loai,
        nozzle_temp_min: nhietMin,
        nozzle_temp_max: nhietMax,
      },
    });
  }
}
