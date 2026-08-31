/**
 * Giải mã các trường lỗi thô trong báo cáo MQTT của máy Bambu.
 *
 * Máy không gửi chữ, chỉ gửi số: `stg_cur` là chặng đang chạy, `hms[]` là các lỗi phần cứng,
 * `print_error` là lỗi gắn với bản in. Đây là nơi duy nhất biết đổi mấy con số đó ra tiếng người.
 *
 * Bảng `CHANG` lấy từ `CURRENT_STAGE_IDS` của ha-bambulab — đã đối chiếu khớp với danh sách 80
 * giá trị mà Home Assistant đang phơi ra cho đúng 4 máy trong xưởng.
 */

/** `stg_cur` → khóa chặng. X1 trả -1 cho lúc rảnh, P1 trả 255. */
export const CHANG: Record<number, string> = {
  [-1]: 'idle', 255: 'idle',
  0: 'printing', 1: 'auto_bed_leveling', 2: 'heatbed_preheating', 3: 'sweeping_xy_mech_mode',
  4: 'changing_filament', 5: 'm400_pause', 6: 'paused_filament_runout', 7: 'heating_hotend',
  8: 'calibrating_extrusion', 9: 'scanning_bed_surface', 10: 'inspecting_first_layer',
  11: 'identifying_build_plate_type', 12: 'calibrating_micro_lidar', 13: 'homing_toolhead',
  14: 'cleaning_nozzle_tip', 15: 'checking_extruder_temperature', 16: 'paused_user',
  17: 'paused_front_cover_falling', 18: 'calibrating_micro_lidar', 19: 'calibrating_extrusion_flow',
  20: 'paused_nozzle_temperature_malfunction', 21: 'paused_heat_bed_temperature_malfunction',
  22: 'filament_unloading', 23: 'paused_skipped_step', 24: 'filament_loading',
  25: 'calibrating_motor_noise', 26: 'paused_ams_lost', 27: 'paused_low_fan_speed_heat_break',
  28: 'paused_chamber_temperature_control_error', 29: 'cooling_chamber', 30: 'paused_user_gcode',
  31: 'motor_noise_showoff', 32: 'paused_nozzle_filament_covered_detected', 33: 'paused_cutter_error',
  34: 'paused_first_layer_error', 35: 'paused_nozzle_clog',
  36: 'check_absolute_accuracy_before_calibration', 37: 'absolute_accuracy_calibration',
  38: 'check_absolute_accuracy_after_calibration', 39: 'calibrate_nozzle_offset',
  40: 'bed_level_high_temperature', 41: 'check_quick_release', 42: 'check_door_and_cover',
  43: 'laser_calibration', 44: 'check_plaform', 45: 'check_birdeye_camera_position',
  46: 'calibrate_birdeye_camera', 47: 'bed_level_phase_1', 48: 'bed_level_phase_2',
  49: 'heating_chamber', 50: 'heated_bedcooling', 51: 'print_calibration_lines', 52: 'check_material',
  53: 'calibrating_live_view_camera', 54: 'waiting_for_heatbed_temperature',
  55: 'check_material_position', 56: 'calibrating_cutter_model_offset', 57: 'measuring_surface',
  58: 'thermal_preconditioning', 59: 'homing_blade_holder', 60: 'calibrating_camera_offset',
  61: 'calibrating_blade_holder_position', 62: 'hotend_pick_place_test',
  63: 'waiting_chamber_temperature_equalize', 64: 'preparing_hotend',
  65: 'calibrating_detection_nozzle_clumping', 66: 'purifying_chamber_air',
  67: 'measuring_rotary_attachment', 68: 'moving_toolhead_above_purge_chute', 69: 'cooling_nozzle',
  70: 'moving_toolhead_to_center_of_heatbed', 71: 'active_arc_fitting', 72: 'hotend_type_detection',
  73: 'build_plate_alignment_detection', 74: 'heatbed_surface_foreign_object_detection',
  75: 'heatbed_underside_foreign_object_detection', 76: 'pre_extrusion_before_printing',
  77: 'preparing_ams',
};

/**
 * Lý do dừng, viết cho thợ đứng máy đọc — nói luôn phải đi làm gì, đừng bắt tra mã.
 * Chỉ dịch nhóm `paused_*`; các chặng bình thường (hiệu chuẩn, gia nhiệt...) không cần báo ai.
 */
const LY_DO_DUNG: Record<string, string> = {
  paused_filament_runout: 'hết nhựa giữa chừng',
  paused_nozzle_clog: 'tắc đầu phun',
  paused_first_layer_error: 'lỗi lớp đầu tiên',
  paused_skipped_step: 'trượt bước (kẹt trục hoặc va đầu phun)',
  paused_ams_lost: 'mất kết nối AMS',
  paused_nozzle_temperature_malfunction: 'nhiệt đầu phun hỏng',
  paused_heat_bed_temperature_malfunction: 'nhiệt bàn in hỏng',
  paused_chamber_temperature_control_error: 'lỗi điều khiển nhiệt buồng',
  paused_low_fan_speed_heat_break: 'quạt heat-break quay yếu',
  paused_front_cover_falling: 'nắp trước bị rơi',
  paused_cutter_error: 'lỗi dao cắt nhựa',
  paused_nozzle_filament_covered_detected: 'nhựa bám kín đầu phun',
  paused_user: 'người bấm tạm dừng',
  paused_user_gcode: 'lệnh dừng nằm trong file G-code',
  m400_pause: 'lệnh M400 trong G-code',
};

/**
 * Ba chặng này là dừng CÓ CHỦ Ý, không phải máy hỏng — báo ở mức tin thường thôi, đừng réo
 * như cháy nhà. Còn lại trong nhóm `paused_*` đều là sự cố thật, phải kêu ngay.
 */
const DUNG_CO_CHU_Y = new Set(['paused_user', 'paused_user_gcode', 'm400_pause']);

export type ChanDoan = {
  /** Khóa chặng, VD `paused_nozzle_clog`. */
  chang: string;
  /** Lý do bằng tiếng Việt, hoặc null nếu chặng này không phải là dừng. */
  lyDo: string | null;
  /** Dừng do người/G-code (false) hay do máy gặp sự cố (true). */
  laSuCo: boolean;
};

/**
 * Chẩn đoán từ khóa chặng. Home Assistant đưa thẳng chuỗi này (`sensor.<máy>_current_stage`) nên
 * đường backup dùng hàm này, còn MQTT thì phải đổi số sang khóa trước.
 */
export function chanDoanTheoKhoa(chang: string): ChanDoan {
  const lyDo = LY_DO_DUNG[chang] ?? null;
  return { chang, lyDo, laSuCo: lyDo !== null && !DUNG_CO_CHU_Y.has(chang) };
}

/** Đọc `stg_cur` (số nguyên trong báo cáo MQTT) ra chẩn đoán. */
export function chanDoanChang(stgCur: number | undefined | null): ChanDoan {
  return chanDoanTheoKhoa(CHANG[Number(stgCur)] ?? 'unknown');
}

import { moTaHms, moTaLoiBanIn } from './tu-dien-loi';

const hex4 = (n: number) => (n >>> 0).toString(16).toUpperCase().padStart(4, '0');

/** Mức độ nằm ở 16 bit cao của `code`. */
const MUC_DO_HMS: Record<number, string> = { 1: 'nghiêm trọng', 2: 'nặng', 3: 'thường', 4: 'nhắc nhở' };

export type LoiHms = {
  ma: string;
  mucDo: string;
  /** Nặng = fatal/serious. Chỉ dùng để xếp thứ tự hiển thị — HMS không còn sinh thông báo nữa. */
  nang: boolean;
  /** Mô tả tiếng Anh của Bambu. Chỉ đường Home Assistant có; MQTT thô không kèm chữ. */
  moTa?: string;
  wiki: string;
};

/**
 * Ghép `attr` + `code` (hai số nguyên) thành mã HMS 4 cụm như trên wiki Bambu.
 * Đã nghiệm trên máy A1-2: attr/code thô ra đúng `0500_0400_0001_0044` mà Home Assistant báo.
 */
export function docHms(hms: Array<{ attr?: number; code?: number }> | undefined | null): LoiHms[] {
  if (!Array.isArray(hms)) return [];
  return hms
    .filter((h) => Number(h?.attr) > 0 || Number(h?.code) > 0)
    .map((h) => {
      const attr = Number(h.attr) >>> 0;
      const code = Number(h.code) >>> 0;
      const ma = `${hex4(attr >>> 16)}_${hex4(attr & 0xffff)}_${hex4(code >>> 16)}_${hex4(code & 0xffff)}`;
      const bac = code >>> 16;
      return {
        ma,
        mucDo: MUC_DO_HMS[bac] ?? `bậc ${bac}`,
        nang: bac === 1 || bac === 2,
        // Đường MQTT chỉ có số; chữ lấy từ kho lỗi tiếng Việt chính thức của Bambu.
        moTa: moTaHms(ma) ?? undefined,
        wiki: `https://wiki.bambulab.com/en/x1/troubleshooting/hmscode/${ma.toLowerCase()}`,
      };
    });
}

/** `print_error` là một số nguyên; wiki Bambu viết nó thành 2 cụm hex. */
export function docPrintError(n: number | undefined | null): string | null {
  const v = Number(n) >>> 0;
  if (!v) return null;
  return `${hex4(v >>> 16)}_${hex4(v & 0xffff)}`;
}

/** Nhãn mức độ mà Home Assistant dùng, quy về cùng thang với đường MQTT. */
const MUC_DO_HA: Record<string, { nhan: string; nang: boolean }> = {
  fatal: { nhan: 'nghiêm trọng', nang: true },
  serious: { nhan: 'nặng', nang: true },
  common: { nhan: 'thường', nang: false },
  info: { nhan: 'nhắc nhở', nang: false },
};

/**
 * Đọc lỗi HMS từ attribute của `binary_sensor.<máy>_hms_errors`.
 *
 * HA đã giải mã sẵn thành chữ, đánh số từ 1: `1-Code`, `1-Error`, `1-Severity`, `1-Wiki`. Nhờ vậy
 * đường backup nói được nguyên nhân y như đường MQTT, chỉ khác là kèm luôn mô tả tiếng Anh của Bambu.
 */
export function docHmsTuHa(attrs: Record<string, unknown> | undefined | null): LoiHms[] {
  if (!attrs) return [];
  const soLuong = Number(attrs.Count ?? 0);
  const ra: LoiHms[] = [];

  for (let i = 1; i <= soLuong; i++) {
    const maDay = String(attrs[`${i}-Code`] ?? '');
    if (!maDay) continue;
    // HA trả dạng "HMS_0500_0400_0001_0044"; phần còn lại sau tiền tố mới là mã.
    const ma = maDay.replace(/^HMS_/i, '');
    const bac = MUC_DO_HA[String(attrs[`${i}-Severity`] ?? '').toLowerCase()];
    ra.push({
      ma,
      mucDo: bac?.nhan ?? 'không rõ',
      nang: bac?.nang ?? false,
      // Ưu tiên tiếng Việt; HA chỉ có tiếng Anh nên chỉ dùng khi từ điển chưa có mã đó.
      moTa: moTaHms(ma) ?? (String(attrs[`${i}-Error`] ?? '') || undefined),
      wiki: String(attrs[`${i}-Wiki`] ?? '') || `https://wiki.bambulab.com/en/x1/troubleshooting/hmscode/${ma.toLowerCase()}`,
    });
  }
  return ra;
}

/**
 * Câu mô tả lỗi dùng để QUYẾT ĐỊNH có bắn thông báo hay không (Zalo/FCM).
 *
 * Cố ý **không** gộp lỗi HMS vào đây. HMS phần lớn là chuyện dai dẳng — firmware AMS lệch phiên
 * bản, nhắc tra dầu trục — máy vẫn in ngon lành mà cứ réo thì chỉ tổ làm người ta tắt thông báo,
 * rồi lúc thật sự tắc đầu phun lại không ai hay. Muốn ĐÍNH mã HMS vào một thông báo đã chắc chắn
 * phải gửi thì dùng `dongHmsDeBao()` — đính kèm khác hẳn với tự mình réo lên.
 */
export function moTaLoiDeBao(chanDoan: ChanDoan, printError: string | null): string | null {
  const phan: string[] = [];
  if (chanDoan.lyDo) phan.push(chanDoan.lyDo);
  if (printError) {
    // Có chữ thì đưa chữ — mã hex trần chẳng nói gì với người đang đứng cạnh máy.
    const chu = moTaLoiBanIn(printError);
    phan.push(chu ? `${chu} (${printError})` : `mã lỗi ${printError}`);
  }
  return phan.length > 0 ? phan.join(' · ') : null;
}

/**
 * Các dòng HMS để đính vào thông báo — đúng thứ web đang hiện: mã 4 cụm, mô tả tiếng Việt, mức độ.
 *
 * Trước đây tin Zalo chỉ có mỗi lý do dừng, thợ cầm điện thoại ra tới máy vẫn phải mở web mới biết
 * mã nào mà tra wiki. Vẫn giữ nguyên luật: HMS không tự sinh thông báo (xem `moTaLoiDeBao`), chỉ đi
 * ké khi đã có việc khác phải báo.
 *
 * Cắt bớt khi máy ôm quá nhiều lỗi: tin nhắn dài mấy chục dòng thì người ta lướt qua, mà lỗi nặng
 * đã được provider xếp lên đầu mảng rồi.
 */
export function dongHmsDeBao(hms: LoiHms[], toiDa = 5): string[] {
  const dong = hms
    .slice(0, toiDa)
    .map((l) => `• ${l.ma}${l.moTa ? ` — ${l.moTa}` : ''} (${l.mucDo})`);
  if (hms.length > toiDa) dong.push(`• …và ${hms.length - toiDa} lỗi nữa, xem trên web.`);
  return dong;
}
