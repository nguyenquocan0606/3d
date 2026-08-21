import tls from 'node:tls';

/**
 * Xem camera trong máy Bambu qua LAN.
 *
 * Máy mở cổng 6000 với một giao thức riêng của Bambu, **không phải RTSP** (cổng 322 chỉ có trên
 * X1; cả 4 máy trong xưởng đều đóng). Bắt tay TLS xong thì gửi một gói 80 byte chứa `bblp` + Access
 * Code, sau đó máy đẩy liên tục: mỗi khung là 16 byte header (4 byte đầu là độ dài payload, LE)
 * rồi tới đúng ngần ấy byte JPEG.
 *
 * Đo trên máy thật: ~0,4 khung/giây, mỗi khung 39-120 KB tuỳ máy. Chậm là bản chất của camera
 * A1/P1, không phải do đường truyền.
 *
 * **Mỗi máy chỉ giữ MỘT kết nối** dù có bao nhiêu người đang xem: firmware giới hạn số client
 * camera, mở nhiều là đá nhau ra. Ai xem thì lấy khung từ bộ nhớ chung này.
 */

/** Không ai xem trong khoảng này thì cắt kết nối — đừng bắt máy in gánh stream 24/7. */
const HAN_RANH_MS = 45_000;

/** Chưa có khung nào thì chờ tối đa ngần này rồi chịu thua. Khung đầu thường về sau ~2,5 giây. */
const CHO_KHUNG_DAU_MS = 12_000;

type NgheKhung = (jpg: Buffer<ArrayBufferLike>) => void;

/** Số byte tối đa cho một khung — vượt ngưỡng này nghĩa là đã lệch khung, không phải ảnh to. */
const KHUNG_TOI_DA = 8_000_000;

export type KetQuaTach = {
  khung: Buffer<ArrayBufferLike>[];
  /** Phần đuôi chưa đủ một khung, để dành ghép với gói sau. */
  con: Buffer<ArrayBufferLike>;
  /** Dòng byte đã hỏng (độ dài vô lý) — phải đóng kết nối chứ đừng cố đọc tiếp. */
  hong: boolean;
};

/**
 * Cắt các khung hoàn chỉnh ra khỏi dòng byte.
 *
 * Mỗi khung = 16 byte header (4 byte đầu là độ dài payload, little-endian) + đúng ngần ấy byte
 * JPEG. TCP không tôn trọng ranh giới khung nên một gói có thể chứa nửa khung, hoặc mấy khung liền.
 */
export function tachKhung(dem: Buffer): KetQuaTach {
  const khung: Buffer<ArrayBufferLike>[] = [];
  let i = 0;

  while (dem.length - i >= 16) {
    const len = dem.readUInt32LE(i);
    // Độ dài vô lý = sai mật khẩu hoặc firmware khác. Đóng còn hơn ngốn RAM vô hạn.
    if (len <= 0 || len > KHUNG_TOI_DA) return { khung, con: dem.subarray(i), hong: true };
    if (dem.length - i < 16 + len) break;
    khung.push(dem.subarray(i + 16, i + 16 + len));
    i += 16 + len;
  }

  return { khung, con: dem.subarray(i), hong: false };
}

class CamBambu {
  private ip: string;
  private accessCode: string;
  private sock: tls.TLSSocket | null = null;
  private dem: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  private nghe = new Set<NgheKhung>();
  private henRanh: NodeJS.Timeout | null = null;

  /** Khung mới nhất, dùng cho ảnh chụp tức thời. */
  khungMoiNhat: Buffer<ArrayBufferLike> | null = null;
  nhanLuc = 0;

  constructor(ip: string, accessCode: string) {
    this.ip = ip;
    this.accessCode = accessCode;
  }

  private goiXacThuc(): Buffer {
    const b = Buffer.alloc(80);
    b.writeUInt32LE(0x40, 0); // độ dài phần payload phía sau
    b.writeUInt32LE(0x3000, 4);
    Buffer.from('bblp').copy(b, 16); // user cố định trong LAN mode
    Buffer.from(this.accessCode).copy(b, 48);
    return b;
  }

  private noi() {
    if (this.sock) return;

    const s = tls.connect(
      {
        host: this.ip,
        port: 6000,
        // Cert tự ký của "BBL CA" — LAN nội bộ, địa chỉ IP do mình tự đặt.
        rejectUnauthorized: false,
      },
      () => s.write(this.goiXacThuc()),
    );

    s.on('data', (d) => this.nhan(d));
    s.on('error', (e) => {
      console.warn(`[Bambu cam] ${this.ip}: ${e.message}`);
      this.dong();
    });
    s.on('close', () => {
      if (this.sock === s) {
        this.sock = null;
        this.dem = Buffer.alloc(0);
      }
    });

    this.sock = s;
  }

  private nhan(d: Buffer) {
    const { khung, con, hong } = tachKhung(Buffer.concat([this.dem, d]));
    this.dem = con;

    for (const jpg of khung) {
      this.khungMoiNhat = jpg;
      this.nhanLuc = Date.now();
      for (const f of this.nghe) {
        try {
          f(jpg);
        } catch {
          /* một người xem lỗi không được làm hỏng những người còn lại */
        }
      }
    }

    if (hong) {
      console.warn(`[Bambu cam] ${this.ip}: dòng dữ liệu lệch khung, đóng kết nối.`);
      this.dong();
    }
  }

  private dong() {
    this.sock?.destroy();
    this.sock = null;
    this.dem = Buffer.alloc(0);
  }

  /** Báo có người đang xem: mở kết nối nếu cần và dời mốc cắt. */
  private danhThuc() {
    this.noi();
    if (this.henRanh) clearTimeout(this.henRanh);
    this.henRanh = setTimeout(() => {
      if (this.nghe.size === 0) this.dong();
    }, HAN_RANH_MS);
    this.henRanh.unref?.();
  }

  /** Đăng ký nhận từng khung. Trả về hàm huỷ đăng ký. */
  theoDoi(f: NgheKhung): () => void {
    this.nghe.add(f);
    this.danhThuc();
    return () => {
      this.nghe.delete(f);
      this.danhThuc();
    };
  }

  /** Một khung mới nhất. Chưa có thì chờ khung đầu tiên về. */
  async anhChup(): Promise<Buffer | null> {
    this.danhThuc();
    // Khung quá cũ thì coi như chưa có: thà chờ ảnh mới còn hơn trả hình của một phút trước.
    if (this.khungMoiNhat && Date.now() - this.nhanLuc < 10_000) return this.khungMoiNhat;

    return new Promise((giaiQuyet) => {
      const xong = (jpg: Buffer | null) => {
        clearTimeout(hen);
        huy();
        giaiQuyet(jpg);
      };
      const hen = setTimeout(() => xong(null), CHO_KHUNG_DAU_MS);
      hen.unref?.();
      const huy = this.theoDoi((jpg) => xong(jpg));
    });
  }
}

declare global {
  var camBambuKho: Map<string, CamBambu> | undefined;
}

// Gắn vào globalThis để sống qua hot-reload của Next — nếu không thì mỗi lần sửa file là mở thêm
// một kết nối camera mồ côi tới máy in.
const kho: Map<string, CamBambu> = (globalThis.camBambuKho ??= new Map());

/** Lấy (hoặc dựng) bộ xem camera dùng chung cho một máy in. */
export function layCam(ip: string, accessCode: string): CamBambu {
  const khoa = `${ip}|${accessCode}`;
  let cam = kho.get(khoa);
  if (!cam) {
    cam = new CamBambu(ip, accessCode);
    kho.set(khoa, cam);
  }
  return cam;
}

export type { CamBambu };
