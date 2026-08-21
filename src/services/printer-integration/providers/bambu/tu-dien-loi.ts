import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Từ điển mã lỗi Bambu **bằng tiếng Việt**.
 *
 * Máy in chỉ đẩy về con số (`hms[].attr/code`, `print_error`), ghép lại thành mã hex kiểu
 * `0500_0400_0001_0044`. Đưa nguyên mã đó cho thợ đứng máy thì vô dụng — phải tra wiki mới biết là
 * chuyện gì.
 *
 * May là Bambu công bố sẵn kho mô tả, **có cả tiếng Việt**: 2077 mã HMS và 500 mã lỗi bản in. Nên
 * không phải tự dịch, cũng không phải nuôi một bảng dịch tay rồi lạc hậu dần theo firmware.
 *
 *     0500040000010044 → "Phần mềm cơ sở của AMS A không khớp với máy in. Hãy nâng cấp trên
 *                         trang «Phần mềm cơ sở»."
 *
 * Tra cứu là **đồng bộ** để chỗ giải mã trạng thái khỏi phải chờ; tải về là bất đồng bộ, chạy lúc
 * khởi động. Chưa tải xong thì chỉ mất phần chữ, mã vẫn hiện như cũ.
 */

const NGUON = 'https://e.bambulab.com/query.php?lang=vi';

/** Kho lỗi hiếm khi đổi (theo firmware), tải lại mỗi tuần là quá đủ. */
const HAN_MS = 7 * 24 * 60 * 60_000;

/** Giữ bản đã tải xuống đĩa để khởi động lại không phải chờ mạng, và vẫn chạy khi mất Internet. */
const TEP = path.join(process.cwd(), 'data', 'bambu-loi-vi.json');

type KhoLoi = { ver?: string; hms: Record<string, string>; banIn: Record<string, string> };

declare global {
  var bambuTuDienLoi: KhoLoi | undefined;
  var bambuTuDienDangTai: Promise<void> | undefined;
}

/** Bỏ gạch dưới và đưa về chữ hoa — kho của Bambu dùng mã liền, VD "0500040000010044". */
function chuanHoa(ma: string): string {
  return ma.replace(/_/g, '').toUpperCase();
}

type PhanHoi = {
  data?: {
    device_hms?: { ver?: string; vi?: Array<{ ecode?: string; intro?: string }> };
    device_error?: { ver?: string; vi?: Array<{ ecode?: string; intro?: string }> };
  };
};

function dungKho(json: PhanHoi): KhoLoi {
  const bang = (ds: Array<{ ecode?: string; intro?: string }> | undefined) => {
    const ra: Record<string, string> = {};
    for (const m of ds ?? []) {
      const ma = String(m.ecode ?? '').toUpperCase();
      const chu = (m.intro ?? '').trim();
      // Một số mã có sẵn trong kho nhưng mô tả rỗng — bỏ qua để chỗ tra cứu trả về null cho đúng,
      // thay vì đưa ra một chuỗi rỗng rồi hiện thành khoảng trắng.
      if (ma && chu) ra[ma] = chu;
    }
    return ra;
  };
  return {
    ver: json.data?.device_hms?.ver,
    hms: bang(json.data?.device_hms?.vi),
    banIn: bang(json.data?.device_error?.vi),
  };
}

/**
 * Nạp từ điển: ưu tiên bản trên đĩa cho nhanh, rồi tải bản mới nếu đã cũ.
 * Gọi lại nhiều lần cũng chỉ tải một lần.
 */
export function napTuDienLoi(): Promise<void> {
  return (globalThis.bambuTuDienDangTai ??= nap());
}

async function nap(): Promise<void> {
  // 1. Bản trên đĩa — dùng được ngay, kể cả khi máy chủ không ra được Internet.
  let cuLuc = 0;
  try {
    const tho = await readFile(TEP, 'utf8');
    const { luc, kho } = JSON.parse(tho) as { luc: number; kho: KhoLoi };
    globalThis.bambuTuDienLoi = kho;
    cuLuc = luc;
    console.log(`[Từ điển lỗi] Dùng bản lưu sẵn: ${Object.keys(kho.hms).length} mã HMS.`);
  } catch {
    /* chưa có bản nào, tải mới */
  }

  if (cuLuc > 0 && Date.now() - cuLuc < HAN_MS) return;

  // 2. Tải bản mới.
  try {
    const res = await fetch(NGUON, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const kho = dungKho((await res.json()) as PhanHoi);
    if (Object.keys(kho.hms).length === 0) throw new Error('kho rỗng');

    globalThis.bambuTuDienLoi = kho;
    await mkdir(path.dirname(TEP), { recursive: true });
    await writeFile(TEP, JSON.stringify({ luc: Date.now(), kho }), 'utf8');
    console.log(`[Từ điển lỗi] Đã tải ${Object.keys(kho.hms).length} mã HMS, ${Object.keys(kho.banIn).length} mã lỗi bản in.`);
  } catch (e) {
    // Mất mạng thì vẫn chạy với bản cũ (hoặc không có chữ) — không đáng làm hỏng gì.
    console.warn('[Từ điển lỗi] Không tải được:', e instanceof Error ? e.message : e);
  }
}

/** Mô tả tiếng Việt của một mã HMS, hoặc null nếu chưa có từ điển / mã lạ. */
export function moTaHms(ma: string): string | null {
  return globalThis.bambuTuDienLoi?.hms[chuanHoa(ma)] ?? null;
}

/** Mô tả tiếng Việt của một mã lỗi bản in (`print_error`). */
export function moTaLoiBanIn(ma: string): string | null {
  return globalThis.bambuTuDienLoi?.banIn[chuanHoa(ma)] ?? null;
}

/** Cho test bơm dữ liệu vào mà không cần gọi mạng. */
export function datTuDienLoi(kho: KhoLoi | undefined) {
  globalThis.bambuTuDienLoi = kho;
  globalThis.bambuTuDienDangTai = kho ? Promise.resolve() : undefined;
}
