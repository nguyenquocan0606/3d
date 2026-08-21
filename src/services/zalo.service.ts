import prisma from '@/utils/db';

/**
 * Cầu nối giữa web và worker Zalo (`scripts/zalo-worker.mjs`).
 *
 * Phân vai rõ ràng:
 *   - ĐỌC (danh sách hội thoại, tin nhắn): web đọc thẳng Postgres. Worker tắt thì vẫn xem được
 *     lịch sử chat, chỉ là không có tin mới.
 *   - GHI (gửi tin, đăng nhập QR, thêm/xóa tài khoản): bắt buộc qua worker, vì chỉ worker mới
 *     giữ phiên Zalo.
 */

const WORKER_URL = process.env.ZALO_WORKER_URL || 'http://127.0.0.1:39200';
const WORKER_TOKEN = process.env.ZALO_WORKER_TOKEN || '';
/** Worker chạy cùng máy nên phản hồi phải rất nhanh. Chờ lâu chỉ tổ treo request của web. */
const TIMEOUT_MS = 15000;

export class LoiZalo extends Error {}

/** Ném khi không gọi được worker — tách riêng để UI hiện đúng câu "worker chưa chạy". */
export class LoiWorkerKhongChay extends LoiZalo {}

export type TaiKhoanZalo = {
  id: string;
  nhan: string | null;
  displayName: string | null;
  avatar: string | null;
  trangThai: string;
  qrImage: string | null;
  qrHetHan: boolean;
  loi: string | null;
  daLuuPhien: boolean;
  lastConnectedAt: string | null;
  lastMessageAt: string | null;
};

async function goiWorker<T>(duongDan: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${WORKER_URL}${duongDan}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(WORKER_TOKEN ? { 'x-worker-token': WORKER_TOKEN } : {}),
        ...init?.headers,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch {
    throw new LoiWorkerKhongChay(
      'Không kết nối được worker Zalo. Chạy `docker compose up -d zalo-worker` trên máy chủ rồi thử lại.',
    );
  }

  const duLieu = (await res.json().catch(() => ({}))) as { loi?: string } & T;
  if (!res.ok) throw new LoiZalo(duLieu?.loi || `Worker trả lỗi HTTP ${res.status}`);
  return duLieu;
}

// ─────────────────────────────────────────────────────────────────────────────
// Đọc từ DB
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Trạng thái mọi tài khoản: phần bền (DB) + phần sống (worker).
 *
 * Worker chết thì vẫn trả về danh sách tài khoản từ DB kèm `workerChay: false` — UI cần phân biệt
 * "chưa đăng nhập Zalo" với "worker không chạy".
 */
export async function layTrangThai() {
  try {
    const { taiKhoan } = await goiWorker<{ taiKhoan: TaiKhoanZalo[] }>('/trang-thai');
    return { workerChay: true, taiKhoan };
  } catch (error) {
    if (!(error instanceof LoiWorkerKhongChay)) throw error;

    const dsTaiKhoan = await prisma.zaloAccount.findMany({ orderBy: { updatedAt: 'asc' } });
    return {
      workerChay: false,
      taiKhoan: dsTaiKhoan.map((acc) => ({
        id: acc.id,
        nhan: acc.nhan,
        displayName: acc.displayName,
        avatar: acc.avatar,
        // Worker không chạy thì chắc chắn không có phiên nào sống, bất kể DB ghi gì.
        trangThai: 'mat_ket_noi',
        qrImage: null,
        qrHetHan: false,
        loi: acc.lastError,
        daLuuPhien: Boolean(acc.cookieJson),
        lastConnectedAt: acc.lastConnectedAt?.toISOString() ?? null,
        lastMessageAt: acc.lastMessageAt?.toISOString() ?? null,
      })),
    };
  }
}

/**
 * Mặc định worker không nhận tin nhóm nữa (xem ZALO_NHAN_TIN_NHOM trong `zalo-worker.mjs`), nhưng
 * DB có thể còn nhóm thu được từ trước. Lọc luôn ở tầng đọc để chúng không hiện lên web — giấu
 * chứ không xóa, dữ liệu cũ vẫn nằm nguyên đó nếu sau này cần.
 */
const CHI_CHAT_RIENG = process.env.ZALO_NHAN_TIN_NHOM !== '1';

/** `accountId` rỗng = hộp thư gộp, thấy hội thoại của mọi tài khoản. */
export async function layDanhSachHoiThoai(tuKhoa?: string, accountId?: string) {
  return prisma.zaloThread.findMany({
    where: {
      ...(CHI_CHAT_RIENG ? { type: 0 } : {}),
      ...(accountId ? { accountId } : {}),
      ...(tuKhoa ? { name: { contains: tuKhoa, mode: 'insensitive' as const } } : {}),
    },
    // Cần nhãn tài khoản để hộp thư gộp chỉ rõ tin này đến từ tài khoản nào.
    include: { account: { select: { id: true, nhan: true, displayName: true } } },
    orderBy: { lastMessageAt: 'desc' },
    take: 200,
  });
}

/**
 * Lấy tin nhắn của một hội thoại, MỚI NHẤT TRƯỚC rồi đảo lại — để `take` cắt đúng phần đuôi
 * cuộc trò chuyện (lấy từ đầu thì hội thoại dài sẽ chỉ thấy tin từ đời nào).
 */
export async function layTinNhan(threadId: string, gioiHan = 100) {
  const messages = await prisma.zaloMessage.findMany({
    where: { threadId },
    include: { attachments: true },
    orderBy: { sentAt: 'desc' },
    take: gioiHan,
  });
  return messages.reverse();
}

/** Mở hội thoại trên web = đã đọc. Chỉ tính riêng cho web, không đụng tới app Zalo. */
export async function danhDauDaDoc(threadId: string) {
  await prisma.zaloThread.update({ where: { id: threadId }, data: { unreadCount: 0 } });
}

// ─────────────────────────────────────────────────────────────────────────────
// Nhờ worker làm
// ─────────────────────────────────────────────────────────────────────────────

export async function themTaiKhoan(nhan?: string) {
  return goiWorker<{ id: string; nhan: string }>('/them-tai-khoan', {
    method: 'POST',
    body: JSON.stringify({ nhan }),
  });
}

export async function batDauDangNhapQR(accountId: string) {
  return goiWorker<{ ok: boolean }>('/dang-nhap-qr', {
    method: 'POST',
    body: JSON.stringify({ accountId }),
  });
}

/**
 * Đóng rồi mở lại kết nối Zalo của MỘT tài khoản, dùng phiên đã lưu.
 *
 * Đây mới là thứ nên bấm trước khi nghĩ tới khởi động lại worker: tài khoản rớt mạng thì chỉ mình
 * nó phải nối lại, các tài khoản còn lại vẫn nhận tin bình thường.
 */
export async function ketNoiLai(accountId: string) {
  return goiWorker<{ ok: boolean }>('/ket-noi-lai', {
    method: 'POST',
    body: JSON.stringify({ accountId }),
  });
}

/**
 * Bảo worker tự thoát để Docker (`restart: unless-stopped`) dựng lại — cách khởi động lại từ web
 * mà không cần cho Next quyền chạy lệnh docker trên máy chủ.
 *
 * Chỉ dùng được khi worker CÒN trả lời (treo, chứ chưa chết). Chết hẳn thì Docker đã tự dựng lại
 * rồi; nếu vẫn không lên thì phải vào máy chủ xem log.
 */
export async function khoiDongLaiWorker() {
  return goiWorker<{ ok: boolean }>('/khoi-dong-lai', { method: 'POST', body: '{}' });
}

export async function dangXuat(accountId: string) {
  return goiWorker<{ ok: boolean }>('/dang-xuat', {
    method: 'POST',
    body: JSON.stringify({ accountId }),
  });
}

export async function xoaTaiKhoan(accountId: string) {
  return goiWorker<{ ok: boolean }>('/xoa-tai-khoan', {
    method: 'POST',
    body: JSON.stringify({ accountId }),
  });
}

/** `threadId` là khóa nội bộ của hội thoại — worker tự tra ra tài khoản nào phải gửi. */
export async function guiTinNhan(input: { threadId: string; text: string; quoteMsgId?: string }) {
  return goiWorker<{ msgId: string | null }>('/gui-tin', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
