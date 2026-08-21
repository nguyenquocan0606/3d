import type { FilamentDung } from './doc-3mf';

/**
 * Ghép filament trong file in với khay AMS thật trên máy, để biết trừ nhựa vào cuộn nào.
 *
 * **Vì sao không ghép theo số thứ tự:** đã đối chiếu trên A1-1, filament 2 trong file là xanh lá
 * nhưng khay 2 của AMS lại đang lắp cuộn vàng. Số hiệu filament của slicer không phải số khay.
 *
 * **Vì sao ghép theo màu vẫn phải hỏi lại:** file ghi màu người dùng đặt trong slicer, còn AMS báo
 * màu cuộn đang lắp — hai cái gần nhau chứ không bằng nhau (#327B0F với #18C241 đều là xanh lá).
 * Tệ hơn, một bản in có thể có hai filament cùng gam màu (#400000 và #FE0000 đều đỏ) mà AMS chỉ có
 * một khay đỏ. Đoán sai rồi trừ luôn thì kiểm kê hỏng âm thầm, không ai phát hiện ra.
 *
 * Nên hàm này chỉ **đề nghị**, kèm điểm tin cậy để giao diện biết chỗ nào cần người xác nhận kỹ.
 */

export type KhayAms = {
  /** Số khay, đánh từ 1 cho khớp với `Spool.printerSlot`. */
  slot: number;
  loai: string | null;
  mau: string | null;
};

export type CapGhep = {
  filament: FilamentDung;
  /** Khay được đề nghị, null nếu không tìm được khay nào hợp. */
  slot: number | null;
  /**
   * Độ khớp màu 0..1. 1 là trùng khít.
   * Dưới ~0,8 nghĩa là chỉ "cùng gam màu" — nên bắt người xác nhận.
   */
  diem: number;
  /** Vì sao chọn khay này, để hiện cho người dùng đọc. */
  lyDo: string;
};

function docHex(hex: string | null): [number, number, number] | null {
  if (!hex) return null;
  const m = /^#?([0-9a-f]{6})/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Độ giống nhau của hai màu, 0..1.
 *
 * Dùng khoảng cách Euclid trong RGB — thô so với CIEDE2000 nhưng đủ: mục đích chỉ là **xếp hạng**
 * các khay hiện có, không phải đo chính xác độ lệch màu. Thêm một thư viện màu cho việc này là quá
 * thừa.
 */
function giongNhau(a: string | null, b: string | null): number {
  const x = docHex(a);
  const y = docHex(b);
  if (!x || !y) return 0;
  const d = Math.sqrt((x[0] - y[0]) ** 2 + (x[1] - y[1]) ** 2 + (x[2] - y[2]) ** 2);
  return 1 - Math.min(1, d / 441.67); // 441.67 = khoảng cách đen↔trắng
}

/**
 * Đề nghị cách ghép. Mỗi khay chỉ được gán cho một filament — ghép cặp tham lam theo điểm cao dần,
 * nên hai filament cùng gam màu sẽ không cùng ăn vào một khay.
 */
export function ghepKhay(filament: FilamentDung[], khay: KhayAms[]): CapGhep[] {
  const conKhay = new Set(khay.filter((k) => k.loai).map((k) => k.slot));

  // Xét mọi cặp, xếp điểm cao trước. Filament nặng được ưu tiên khi hoà điểm: gán sai một cuộn
  // 161g tai hại hơn nhiều so với cuộn 8g.
  const cap: Array<{ f: FilamentDung; k: KhayAms; diem: number }> = [];
  for (const f of filament) {
    for (const k of khay) {
      if (!k.loai) continue;
      cap.push({ f, k, diem: giongNhau(f.mau, k.mau) });
    }
  }
  cap.sort((a, b) => b.diem - a.diem || b.f.gram - a.f.gram);

  const ketQua = new Map<number, CapGhep>();
  for (const c of cap) {
    if (ketQua.has(c.f.so) || !conKhay.has(c.k.slot)) continue;
    conKhay.delete(c.k.slot);
    ketQua.set(c.f.so, {
      filament: c.f,
      slot: c.k.slot,
      diem: Math.round(c.diem * 100) / 100,
      lyDo:
        c.diem >= 0.95
          ? 'Màu trùng khít'
          : c.diem >= 0.8
            ? 'Màu gần giống'
            : 'Không màu nào khớp rõ — khay còn lại',
    });
  }

  return filament.map(
    (f) =>
      ketQua.get(f.so) ?? {
        filament: f,
        slot: null,
        diem: 0,
        lyDo: 'Hết khay để gán',
      },
  );
}

/** Còn phải hỏi người dùng không, hay tự tin đủ để trừ thẳng. */
export function canXacNhan(cap: CapGhep[]): boolean {
  return cap.some((c) => c.slot === null || c.diem < 0.95);
}
