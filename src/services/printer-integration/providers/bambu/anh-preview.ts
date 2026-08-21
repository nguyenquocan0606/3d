import { Client } from 'basic-ftp';
import { Writable } from 'node:stream';

/**
 * Lấy ảnh preview của bản in đang chạy, thẳng từ máy in — không qua Home Assistant.
 *
 * Máy Bambu mở sẵn FTPS ngầm ở cổng 990 (user `bblp`, mật khẩu chính là Access Code). File bản in
 * nằm ở `/cache/<tên>`, bản thân nó là một file ZIP, và may mắn là **ảnh preview nằm ngay đầu**:
 * đã đo trên A1-1, `Metadata/plate_1_small.png` bắt đầu ở byte 68.648 của một file 8 MB. Nên chỉ
 * kéo vài trăm KB đầu rồi ngắt, không tải cả file.
 *
 * Ảnh trong 3MF được lưu dạng **stored** (không nén) nên bóc ra chỉ là cắt byte — không phải giải
 * nén, cũng không cần đọc central directory ở cuối file.
 */

/** Đủ để chứa toàn bộ cụm ảnh ở đầu file, đo trên bản in thật thì `pick_1.png` kết thúc quanh 260 KB. */
const SO_BYTE_DAU = 320_000;

/** Ảnh chỉ đổi khi đổi bản in, mà bản in thì hàng giờ mới xong — giữ lâu cho đỡ phiền máy in. */
const HAN_CACHE_MS = 60 * 60_000;

type BanGhi = { png: Buffer | null; luc: number };

declare global {
  var anhPreviewCache: Map<string, BanGhi> | undefined;
}

const cache: Map<string, BanGhi> = (globalThis.anhPreviewCache ??= new Map());

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

/** Bản in nhiều mâm thì tên file có đuôi `_plate_3`; ảnh bên trong đánh số theo đúng mâm đó. */
export function soMam(tenFile: string): number {
  const m = /_plate_(\d+)/i.exec(tenFile);
  return m ? Number(m[1]) : 1;
}

/**
 * Trả về PNG preview, hoặc null nếu không lấy được. **Không bao giờ ném lỗi** — thiếu ảnh chỉ là
 * mất đẹp, không đáng làm hỏng cả lời gọi trạng thái.
 */
export async function layAnhPreview(input: {
  ip: string;
  accessCode: string;
  tenFile: string;
}): Promise<Buffer | null> {
  const khoa = `${input.ip}|${input.tenFile}`;
  const cu = cache.get(khoa);
  // Nhớ cả lần thất bại: máy không có file đó thì thử lại mỗi request cũng vô ích.
  if (cu && Date.now() - cu.luc < HAN_CACHE_MS) return cu.png;

  let png: Buffer | null = null;
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
  } catch (e) {
    console.warn(`[Bambu ảnh] ${input.ip} không lấy được "${input.tenFile}":`, e instanceof Error ? e.message : e);
  } finally {
    client.close();
  }

  cache.set(khoa, { png, luc: Date.now() });
  return png;
}
