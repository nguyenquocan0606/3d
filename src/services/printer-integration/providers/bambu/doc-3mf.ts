import { Client } from 'basic-ftp';
import { Writable } from 'node:stream';
import zlib from 'node:zlib';

/**
 * Đọc file bản in (.3mf) trên máy in qua FTPS: ảnh preview, khối lượng nhựa từng filament, và
 * thời gian dự kiến — tất cả trong **một lần tải duy nhất**.
 *
 * Máy Bambu mở sẵn FTPS ngầm ở cổng 990 (user `bblp`, mật khẩu chính là Access Code). File bản in
 * nằm ở `/cache/<tên>`, bản thân nó là một file ZIP, và may mắn là **ảnh preview nằm ngay đầu**:
 * đã đo trên A1-1, `Metadata/plate_1_small.png` bắt đầu ở byte 68.648 của một file 8 MB. Nên chỉ
 * kéo vài trăm KB đầu rồi ngắt, không tải cả file.
 *
 * Ảnh trong 3MF được lưu dạng **stored** (không nén) nên bóc ra chỉ là cắt byte. Còn gcode thì bị
 * nén, nhưng phần đầu của nó có sẵn dòng tổng kết:
 *
 *     ; total filament weight [g] : 8.47,161.29,16.76,8.84
 *     ; total estimated time: 11h 54m 41s
 *
 * và gcode bắt đầu quanh byte 221.000 nên vẫn nằm gọn trong khoảng đã tải.
 *
 * Vì sao không đọc `Metadata/slice_info.config` (nơi có cùng dữ liệu, lại còn kèm màu): nó nằm ở
 * 3 KB **cuối** file 8 MB, mà máy in **không hỗ trợ lệnh `REST`** của FTP (trả 502) nên không thể
 * tải riêng phần đuôi — muốn lấy phải kéo cả 8 MB, mất 75 giây.
 */

/** Đủ để chứa toàn bộ cụm ảnh ở đầu file, đo trên bản in thật thì `pick_1.png` kết thúc quanh 260 KB. */
const SO_BYTE_DAU = 320_000;

/** Ảnh chỉ đổi khi đổi bản in, mà bản in thì hàng giờ mới xong — giữ lâu cho đỡ phiền máy in. */
const HAN_CACHE_MS = 60 * 60_000;

type BanGhi = { png: Buffer | null; tt: ThongTinBanIn | null; luc: number };

declare global {
  var banInCache: Map<string, BanGhi> | undefined;
}

const cache: Map<string, BanGhi> = (globalThis.banInCache ??= new Map());

/**
 * Dòng ghi chỉ giữ `SO_BYTE_DAU` byte đầu rồi báo lỗi để basic-ftp dừng tải.
 *
 * Không có cách nào lịch sự hơn: FTP không có range như HTTP, chỉ có REST (điểm bắt đầu). Muốn
 * dừng sớm thì phải làm hỏng đường ghi.
 */
class ChiLayDau extends Writable {
  private phan: Buffer[] = [];
  private daCo = 0;
  daDu = false;

  _write(chunk: Buffer, _enc: BufferEncoding, cb: (e?: Error | null) => void) {
    this.phan.push(chunk);
    this.daCo += chunk.length;
    if (this.daCo >= SO_BYTE_DAU) {
      this.daDu = true;
      return cb(new Error('DU_ROI'));
    }
    cb();
  }

  get duLieu(): Buffer {
    return Buffer.concat(this.phan);
  }
}

/**
 * Dò các local file header của ZIP để lấy đúng một ảnh.
 *
 * Không đọc được central directory vì nó nằm cuối file mà mình cố tình không tải tới đó. Bù lại
 * local header đủ dùng: có tên file và cờ nén. Riêng kích thước thì bằng 0 (ZIP ghi kiểu streaming,
 * số thật nằm ở data descriptor phía sau) nên phải cắt theo cấu trúc PNG — đọc tới chunk `IEND`.
 */
export function bocAnh(d: Buffer, ten: string): Buffer | null {
  let i = 0;
  while (i >= 0 && i + 30 <= d.length) {
    i = d.indexOf('PK\x03\x04', i, 'binary');
    if (i < 0 || i + 30 > d.length) return null;

    const nen = d.readUInt16LE(i + 8);
    const nlen = d.readUInt16LE(i + 26);
    const elen = d.readUInt16LE(i + 28);
    const ten2 = d.subarray(i + 30, i + 30 + nlen).toString('utf8');

    if (ten2 === ten) {
      // Chỉ xử lý ảnh lưu nguyên (Bambu luôn lưu kiểu này). Nếu firmware nào đó nén lại thì bỏ qua
      // còn hơn trả về một mớ byte hỏng.
      if (nen !== 0) return null;
      const batDau = i + 30 + nlen + elen;
      const cuoi = d.indexOf('IEND', batDau, 'binary');
      if (cuoi < 0) return null;
      return d.subarray(batDau, cuoi + 8); // IEND + 4 byte CRC
    }
    i += 4;
  }
  return null;
}


/**
 * Giải nén phần đầu của gcode nằm trong 3MF.
 *
 * Khác ảnh (lưu nguyên), gcode bị deflate. Mình chỉ có mấy trăm KB đầu nên luồng nén luôn **cụt** —
 * `inflateRawSync` mặc định sẽ ném lỗi. `Z_SYNC_FLUSH` bảo zlib trả về những gì giải được rồi thôi,
 * đúng thứ cần: phần tổng kết nằm ngay mấy KB đầu.
 */
export function bocGcodeDau(d: Buffer, soByte = 20_000): string {
  // `soByte` là số byte **nén** được đưa vào giải — 20 KB nén cho ra cỡ trăm KB gcode, thừa sức
  // chứa khối chú thích tổng kết ở đầu.
  let i = 0;
  while (i >= 0 && i + 30 <= d.length) {
    i = d.indexOf('PK\x03\x04', i, 'binary');
    if (i < 0 || i + 30 > d.length) return '';

    const nen = d.readUInt16LE(i + 8);
    const nlen = d.readUInt16LE(i + 26);
    const elen = d.readUInt16LE(i + 28);
    const ten = d.subarray(i + 30, i + 30 + nlen).toString('utf8');

    if (ten.endsWith('.gcode')) {
      if (nen !== 8) return '';
      try {
        // Cắt ở ĐẦU VÀO chứ không dùng `maxOutputLength`: vượt ngưỡng đầu ra thì Node ném lỗi chứ
        // không cắt bớt, mà gcode 53 MB thì chắc chắn vượt. Giới hạn byte nén là cách duy nhất để
        // chỉ giải ra đúng phần đầu.
        const ra = zlib.inflateRawSync(d.subarray(i + 30 + nlen + elen, i + 30 + nlen + elen + soByte), {
          finishFlush: zlib.constants.Z_SYNC_FLUSH,
        });
        return ra.toString('utf8');
      } catch {
        return '';
      }
    }
    i += 4;
  }
  return '';
}

/** Một filament mà bản in thật sự dùng tới. */
export type FilamentDung = {
  /** Số hiệu filament trong slicer, đánh từ 1. */
  so: number;
  /** Màu người dùng đặt trong slicer, VD "#327B0F". Có thể lệch với màu cuộn đang lắp thật. */
  mau: string | null;
  gram: number;
};

export type ThongTinBanIn = {
  /** Khối lượng nhựa từng filament, theo đúng thứ tự filament 1..N của file. */
  gramTheoFilament: number[];
  /** Tổng khối lượng nhựa của mâm. */
  tongGram: number;
  /** Thời gian in dự kiến do slicer tính, theo giây. */
  giayDuKien: number | null;
  /** Tổng số lớp — dùng để biết in tới đâu. */
  tongLop: number | null;
  /** Các filament có dùng, kèm màu và khối lượng. Đây là đầu vào để ghép với khay AMS. */
  filament: FilamentDung[];
};

/** Đổi "11h 54m 41s" ra giây. */
function docThoiGian(chuoi: string): number | null {
  const g = /(\d+)\s*h/.exec(chuoi);
  const p = /(\d+)\s*m/.exec(chuoi);
  const gi = /(\d+)\s*s/.exec(chuoi);
  if (!g && !p && !gi) return null;
  return (g ? +g[1] * 3600 : 0) + (p ? +p[1] * 60 : 0) + (gi ? +gi[1] : 0);
}

/**
 * Đọc phần tổng kết ở đầu gcode.
 *
 * Slicer ghi sẵn hai dòng này, khỏi phải cộng dồn lệnh đùn — vừa nhanh vừa khớp đúng con số mà
 * Bambu Studio hiện cho người dùng lúc cắt lát.
 */
export function docTongKet(gcode: string): ThongTinBanIn | null {
  const mGram = /;\s*total filament weight \[g\]\s*:\s*([\d.,\s]+)/i.exec(gcode);
  if (!mGram) return null;

  const gramTheoFilament = mGram[1]
    .split(',')
    .map((x) => parseFloat(x.trim()))
    .filter((x) => Number.isFinite(x));
  if (gramTheoFilament.length === 0) return null;

  const mGio = /;\s*total estimated time\s*:\s*([^\n;]+)/i.exec(gcode);
  const mLop = /;\s*total layer number\s*:\s*(\d+)/i.exec(gcode);

  // "; filament: 1,2,3,4" — những filament bản in thật sự dùng. Danh sách màu bên dưới thì liệt kê
  // hết mọi filament đã khai trong slicer (có thể 5, 16...), nên phải lấy đúng các số này.
  const mDung = /;\s*filament:\s*([\d,\s]+)/i.exec(gcode);
  const soDung = mDung
    ? mDung[1].split(',').map((x) => parseInt(x.trim(), 10)).filter(Number.isFinite)
    : gramTheoFilament.map((_, i) => i + 1);

  const mMau = /;\s*filament_colour\s*=\s*([^\n]+)/i.exec(gcode);
  const mauTheoSo = mMau ? mMau[1].split(';').map((x) => x.trim()) : [];

  return {
    gramTheoFilament,
    tongGram: Math.round(gramTheoFilament.reduce((a, b) => a + b, 0) * 100) / 100,
    giayDuKien: mGio ? docThoiGian(mGio[1]) : null,
    tongLop: mLop ? parseInt(mLop[1], 10) : null,
    filament: soDung.map((so, i) => ({
      so,
      mau: mauTheoSo[so - 1] || null,
      gram: gramTheoFilament[i] ?? 0,
    })),
  };
}

/** Bản in nhiều mâm thì tên file có đuôi `_plate_3`; ảnh bên trong đánh số theo đúng mâm đó. */
export function soMam(tenFile: string): number {
  const m = /_plate_(\d+)/i.exec(tenFile);
  return m ? Number(m[1]) : 1;
}

export type KetQuaDoc = { png: Buffer | null; thongTin: ThongTinBanIn | null };

/**
 * Đọc một file bản in trên máy: ảnh preview + khối lượng nhựa + thời gian dự kiến.
 *
 * **Không bao giờ ném lỗi** — thiếu ảnh chỉ là mất đẹp, thiếu số gram thì chỉ là không trừ nhựa tự
 * động được; không đáng làm hỏng cả lời gọi trạng thái.
 */
export async function docBanIn(input: {
  ip: string;
  accessCode: string;
  tenFile: string;
}): Promise<KetQuaDoc> {
  const khoa = `${input.ip}|${input.tenFile}`;
  const cu = cache.get(khoa);
  // Nhớ cả lần thất bại: máy không có file đó thì thử lại mỗi request cũng vô ích.
  if (cu && Date.now() - cu.luc < HAN_CACHE_MS) return { png: cu.png, thongTin: cu.tt };

  let png: Buffer | null = null;
  let tt: ThongTinBanIn | null = null;
  const client = new Client(15_000);
  try {
    await client.access({
      host: input.ip,
      port: 990,
      user: 'bblp',
      password: input.accessCode,
      // Cert tự ký của "BBL CA"; đây là LAN nội bộ, địa chỉ IP do mình tự đặt.
      secure: 'implicit',
      secureOptions: { rejectUnauthorized: false },
    });

    const mam = soMam(input.tenFile);
    const ong = new ChiLayDau();
    try {
      await client.downloadTo(ong, `/cache/${input.tenFile}`);
    } catch (e) {
      // Ngắt giữa chừng là chuyện bình thường — chỉ ném tiếp nếu chưa lấy đủ byte.
      if (!ong.daDu) throw e;
    }

    const d = ong.duLieu;
    png =
      bocAnh(d, `Metadata/plate_${mam}_small.png`) ??
      bocAnh(d, `Metadata/plate_${mam}.png`) ??
      // Có bản in mâm lẻ mà ảnh bên trong vẫn đánh số 1 — thử nốt trước khi chịu thua.
      bocAnh(d, 'Metadata/plate_1_small.png');
    tt = docTongKet(bocGcodeDau(d));
  } catch (e) {
    console.warn(`[Bambu 3MF] ${input.ip} không đọc được "${input.tenFile}":`, e instanceof Error ? e.message : e);
  } finally {
    client.close();
  }

  cache.set(khoa, { png, tt, luc: Date.now() });
  return { png, thongTin: tt };
}

/** Chỉ lấy ảnh — route ảnh preview dùng cái này. */
export async function layAnhPreview(input: {
  ip: string;
  accessCode: string;
  tenFile: string;
}): Promise<Buffer | null> {
  return (await docBanIn(input)).png;
}
