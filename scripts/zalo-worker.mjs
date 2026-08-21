#!/usr/bin/env node
/**
 * Worker Zalo — giữ phiên đăng nhập của CÁC tài khoản Zalo shop và đẩy tin nhắn vào DB.
 *
 * ── Vì sao là tiến trình riêng, không nhét vào Next server ──
 * Zalo chỉ cho MỘT kết nối websocket trên mỗi tài khoản. Next dev hot-reload chạy lại
 * `instrumentation.ts` liên tục, mỗi lần lại mở một listener mới → Zalo đá phiên cũ ra và
 * việc đăng nhập lại dồn dập rất dễ khiến tài khoản bị khóa. Worker chạy tách nên sửa code
 * web không đụng gì tới phiên Zalo.
 *
 * ── Sơ đồ ──
 *     Zalo  ──websocket──►  worker  ──Prisma──►  Postgres  ◄──đọc──  web
 *                             ▲
 *                             └── web nhờ gửi tin qua cổng điều khiển nội bộ
 *
 * Web KHÔNG bao giờ tự nói chuyện với Zalo; muốn gửi tin thì gọi worker.
 *
 * ── Nhiều tài khoản ──
 * Mỗi dòng ZaloAccount là một tài khoản, mỗi tài khoản một instance `Zalo` + listener riêng trong
 * cùng tiến trình này. `createContext()` của zca-js trả object mới mỗi lần gọi (không có state
 * dùng chung ở tầng module) nên các tài khoản không giẫm chân nhau.
 *
 * ── Cách chạy ──
 *     ZALO_WORKER_TOKEN=<bí mật> node scripts/zalo-worker.mjs
 * hoặc (khuyến nghị) chạy nền bằng Docker: docker compose up -d zalo-worker
 *
 * Yêu cầu Node 18 trở lên.
 *
 * ⚠ zca-js là API không chính thức. Dùng tài khoản phụ của shop, đừng dùng tài khoản cá nhân chính.
 */

import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import { Zalo, ThreadType, LoginQRCallbackEventType } from 'zca-js';

const PORT = Number(process.env.ZALO_WORKER_PORT || 39200);
const TOKEN = process.env.ZALO_WORKER_TOKEN || '';
/** Nơi cất ảnh/file tải về. Để ngoài `public/` để file khách gửi không bị lộ ra Internet. */
const THU_MUC_FILE =
  process.env.ZALO_ATTACHMENT_DIR || path.join(process.cwd(), 'data', 'zalo-attachments');

/**
 * Mặc định BỎ QUA tin nhắn nhóm — hộp thư này để chăm khách, nhóm chat chỉ làm trôi hội thoại
 * thật. Đặt ZALO_NHAN_TIN_NHOM=1 nếu sau này muốn nhận cả nhóm.
 *
 * Lọc ngay từ đây (chứ không chỉ giấu trên web) để nhóm đông người không phình DB và không tốn
 * băng thông tải ảnh của cả nhóm về đĩa.
 */
const NHAN_TIN_NHOM = process.env.ZALO_NHAN_TIN_NHOM === '1';

/**
 * Thoát để được dựng lại chỉ có nghĩa khi có người dựng lại — trong Docker là `restart:
 * unless-stopped`. Chạy tay bằng `node scripts/zalo-worker.mjs` mà thoát thì Zalo tắt hẳn, nên
 * nút "Khởi động lại" trên web bị chặn ở trường hợp đó.
 */
const TRONG_DOCKER = existsSync('/.dockerenv');

/** Vừa dựng lại xong mà bấm tiếp thì chặn — mỗi lần khởi động là đăng nhập lại toàn bộ tài khoản. */
const CHO_TRUOC_KHI_KHOI_DONG_LAI_GIAY = 30;

const prisma = new PrismaClient();

function log(...args) {
  console.log(`[${new Date().toLocaleTimeString('vi-VN')}] [zalo]`, ...args);
}

// ─────────────────────────────────────────────────────────────────────────────
// Trạng thái sống của từng tài khoản (chỉ trong RAM)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * accountId → phiên đang chạy.
 *
 * `qrImage` không lưu vào DB vì mã QR chỉ sống mấy chục giây; web hỏi `/trang-thai` để lấy ra.
 */
const phienTheoTaiKhoan = new Map();

function layPhien(accountId) {
  if (!phienTheoTaiKhoan.has(accountId)) {
    phienTheoTaiKhoan.set(accountId, {
      api: null,
      ownId: null,
      trangThai: 'chua_dang_nhap',
      qrImage: null,
      qrHetHan: false,
      loi: null,
      dangDangNhap: false,
      dangKetNoiLai: false,
    });
  }
  return phienTheoTaiKhoan.get(accountId);
}

async function ghiTrangThai(accountId, patch) {
  const phien = layPhien(accountId);
  Object.assign(phien, patch);

  const duLieu = { trangThai: phien.trangThai, lastError: phien.loi ?? null };
  if (patch.daKetNoi) duLieu.lastConnectedAt = new Date();

  await prisma.zaloAccount
    .update({ where: { id: accountId }, data: duLieu })
    .catch((e) => log(`Không ghi được trạng thái tài khoản ${accountId}:`, e.message));
}

// ─────────────────────────────────────────────────────────────────────────────
// Đọc tin nhắn từ Zalo
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Zalo nhét đính kèm vào `content` dưới dạng object (text thì `content` là chuỗi). Hàm này quy
 * mọi kiểu về một dạng chung để phần lưu DB không phải phân nhánh theo từng msgType.
 *
 * `params` là chuỗi JSON chứa link chất lượng cao — ưu tiên nó hơn `href` (href có khi là bản nén).
 */
function bocNoiDung(msgType, content) {
  if (typeof content === 'string') return { text: content, dinhKem: null };
  if (!content || typeof content !== 'object') return { text: '', dinhKem: null };

  let params = {};
  try {
    if (typeof content.params === 'string') params = JSON.parse(content.params);
  } catch {
    // params hỏng hoặc không phải JSON — bỏ qua, vẫn còn `href` để tải.
  }

  const url = params.normalUrl || params.hdUrl || content.href || null;
  const caption = typeof content.title === 'string' ? content.title : '';

  switch (msgType) {
    case 'chat.photo':
    case 'chat.gif':
    case 'chat.doodle':
      return {
        // Với ảnh, `title` là chú thích khách gõ kèm ảnh chứ không phải tên file.
        text: caption,
        dinhKem: { kind: 'image', url, fileName: null, size: params.size ?? null },
      };
    case 'chat.video.msg':
      return {
        text: caption,
        dinhKem: { kind: 'video', url, fileName: null, size: params.size ?? null },
      };
    case 'chat.voice':
      return { text: '', dinhKem: { kind: 'voice', url, fileName: null, size: null } };
    case 'share.file':
      return {
        text: '',
        // Ở đây `title` mới thật sự là tên file.
        dinhKem: { kind: 'file', url, fileName: caption || null, size: content.size ?? params.fileSize ?? null },
      };
    case 'chat.sticker':
      // Sticker là ảnh hệ thống của Zalo, không tải về (tốn chỗ mà chẳng có nội dung gì của khách).
      return { text: '[Sticker]', dinhKem: null };
    case 'chat.link':
    case 'chat.recommended':
      return { text: [caption, content.href].filter(Boolean).join('\n'), dinhKem: null };
    case 'chat.location.new':
      return { text: `[Vị trí] ${content.href || ''}`.trim(), dinhKem: null };
    default:
      return { text: caption || '', dinhKem: url ? { kind: 'file', url, fileName: caption || null, size: null } : null };
  }
}

/** Đoạn xem trước ở danh sách hội thoại — không để trống, nếu không danh sách nhìn như lỗi. */
function xemTruoc(text, dinhKem) {
  if (text && text.trim()) return text.slice(0, 200);
  if (!dinhKem) return '[Tin nhắn]';
  return { image: '[Hình ảnh]', video: '[Video]', voice: '[Tin nhắn thoại]' }[dinhKem.kind] || '[Tệp đính kèm]';
}

const DUOI_THEO_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'audio/aac': '.aac',
  'audio/mpeg': '.mp3',
};

/**
 * Tải đính kèm về đĩa. Link CDN Zalo hết hạn sau một thời gian nên chỉ lưu URL là ảnh cũ sẽ chết —
 * phải kéo về ngay lúc nhận tin.
 *
 * Tải hỏng KHÔNG được làm hỏng việc lưu tin nhắn: trả về lý do lỗi để ghi kèm, web sẽ hiện link gốc.
 */
async function taiDinhKem(dinhKem) {
  if (!dinhKem?.url) return { localPath: null, taiLoi: 'Tin nhắn không kèm link tải' };

  try {
    const res = await fetch(dinhKem.url);
    if (!res.ok) return { localPath: null, taiLoi: `Tải lỗi HTTP ${res.status}` };

    const buf = Buffer.from(await res.arrayBuffer());
    const mimeType = (res.headers.get('content-type') || '').split(';')[0] || null;

    const duoiTuTen = dinhKem.fileName ? path.extname(dinhKem.fileName) : '';
    const duoi = duoiTuTen || DUOI_THEO_MIME[mimeType] || path.extname(new URL(dinhKem.url).pathname) || '';

    // Chia thư mục theo tháng để một thư mục không phình lên hàng chục nghìn file.
    const thang = new Date().toISOString().slice(0, 7);
    const duongDanTuongDoi = path.join(thang, `${randomUUID()}${duoi}`);

    await mkdir(path.join(THU_MUC_FILE, thang), { recursive: true });
    await writeFile(path.join(THU_MUC_FILE, duongDanTuongDoi), buf);

    return { localPath: duongDanTuongDoi, mimeType, size: buf.length, taiLoi: null };
  } catch (error) {
    return { localPath: null, taiLoi: error.message };
  }
}

/**
 * Xếp hàng xử lý theo TỪNG hội thoại: các tin trong cùng một hội thoại chạy nối đuôi nhau, còn
 * hội thoại khác nhau vẫn chạy song song.
 *
 * Vì sao cần: listener gọi `luuTinNhan` mà không chờ, nên khi Zalo bắn trùng một tin (rất hay xảy
 * ra — tin mình gửi vọng về do `selfListen`, hoặc frame lặp lúc reconnect) thì hai lượt chạy chen
 * vào giữa bước "kiểm tra đã có chưa" và bước "ghi", cả hai cùng thấy chưa có rồi cùng ghi →
 * vỡ ràng buộc duy nhất. Xếp hàng còn giữ đúng thứ tự tin trong một cuộc trò chuyện.
 *
 * Khóa phải kèm accountId: hai tài khoản shop cùng nhận tin từ một khách thì threadId Zalo trùng
 * nhau nhưng là hai hội thoại độc lập, không có lý do gì phải chờ nhau.
 */
const hangDoi = new Map();

function xepHang(khoa, viec) {
  const truocDo = hangDoi.get(khoa) ?? Promise.resolve();
  const lanNay = truocDo.then(viec, viec);
  hangDoi.set(khoa, lanNay);

  // Dọn để Map không phình mãi: chỉ xóa khi mình là việc cuối cùng của khóa này.
  // `.catch` ở cuối vì nhánh này là promise riêng — việc lỗi thì người gọi mới là nơi xử lý,
  // không bắt ở đây sẽ thành unhandled rejection làm sập cả worker.
  lanNay
    .finally(() => {
      if (hangDoi.get(khoa) === lanNay) hangDoi.delete(khoa);
    })
    .catch(() => {});

  return lanNay;
}

/** Postgres báo vỡ ràng buộc duy nhất — với ta nghĩa là "đã có rồi", không phải lỗi thật. */
function laTrungKhoa(error) {
  return error?.code === 'P2002';
}

/**
 * Lưu một tin nhắn (đến hoặc đi) vào DB, kèm cập nhật hội thoại.
 *
 * Luôn gọi qua `xepHang()` để hai lượt chạy cùng một hội thoại không giẫm chân nhau.
 */
async function luuTinNhan(accountId, message, ownId) {
  const data = message.data || {};
  const threadIdZalo = message.threadId;
  if (!threadIdZalo || !data.msgId) return;

  const { text, dinhKem } = bocNoiDung(data.msgType, data.content);
  const isSelf = message.isSelf === true || (ownId != null && data.uidFrom === ownId);
  // `ts` là mili-giây dạng chuỗi. Rác thì lùi về "bây giờ" — thà lệch giờ còn hơn mất tin.
  const moc = Number(data.ts);
  const sentAt = Number.isFinite(moc) && moc > 0 ? new Date(moc) : new Date();

  // Hội thoại phải có trước vì ZaloMessage tham chiếu tới nó.
  // Chỉ lấy `dName` làm tên hội thoại khi tin do NGƯỜI KHÁC gửi: tin mình gửi mang tên của mình,
  // dùng nhầm thì mọi hội thoại đều mang tên shop.
  const tenHoiThoai = !isSelf && message.type === ThreadType.User ? data.dName || null : null;
  const xemTruocMoi = xemTruoc(text, dinhKem);

  const napHoiThoai = () =>
    prisma.zaloThread.upsert({
      where: { accountId_threadId: { accountId, threadId: threadIdZalo } },
      create: {
        accountId,
        threadId: threadIdZalo,
        type: message.type === ThreadType.Group ? 1 : 0,
        name: tenHoiThoai,
        lastMessageAt: sentAt,
        lastMessageText: xemTruocMoi,
        unreadCount: isSelf ? 0 : 1,
      },
      update: {
        ...(tenHoiThoai ? { name: tenHoiThoai } : {}),
        lastMessageAt: sentAt,
        lastMessageText: xemTruocMoi,
        // Tin mình gửi không làm tăng số chưa đọc.
        ...(isSelf ? {} : { unreadCount: { increment: 1 } }),
      },
    });

  // `upsert` của Prisma là "xem rồi ghi", không nguyên tử: hai tin đầu tiên của một hội thoại mới
  // đến sát nhau thì cả hai cùng thấy chưa có và cùng tạo. Lần hai chạy lại sẽ rơi vào nhánh
  // update vì lúc đó dòng đã tồn tại.
  let thread;
  try {
    thread = await napHoiThoai();
  } catch (error) {
    if (!laTrungKhoa(error)) throw error;
    thread = await napHoiThoai();
  }

  // Chốt chặn cuối: xếp hàng lo được các lượt chạy trong CÙNG tiến trình, nhưng `guiTin()` cũng
  // ghi tin mình vừa gửi. Ràng buộc duy nhất dưới DB mới là trọng tài thật — trùng thì coi như
  // đã lưu xong, bỏ qua chứ không kêu lỗi.
  let banGhi;
  try {
    banGhi = await prisma.zaloMessage.create({
      data: {
        msgId: String(data.msgId),
        cliMsgId: data.cliMsgId != null ? String(data.cliMsgId) : null,
        threadId: thread.id,
        senderId: data.uidFrom || null,
        senderName: data.dName || null,
        isSelf,
        msgType: data.msgType || 'webchat',
        content: text || null,
        rawJson: JSON.stringify(data),
        quoteMsgId: data.quote ? String(data.quote.globalMsgId) : null,
        sentAt,
      },
    });
  } catch (error) {
    if (laTrungKhoa(error)) return;
    throw error;
  }

  if (dinhKem) {
    const ketQua = await taiDinhKem(dinhKem);
    await prisma.zaloAttachment.create({
      data: {
        messageId: banGhi.id,
        kind: dinhKem.kind,
        fileName: dinhKem.fileName,
        mimeType: ketQua.mimeType ?? null,
        size: ketQua.size ?? dinhKem.size ?? null,
        url: dinhKem.url,
        localPath: ketQua.localPath,
        taiLoi: ketQua.taiLoi,
      },
    });
    if (ketQua.taiLoi) log(`Tải đính kèm lỗi (${dinhKem.kind}): ${ketQua.taiLoi}`);
  }

  await prisma.zaloAccount
    .update({ where: { id: accountId }, data: { lastMessageAt: new Date() } })
    .catch(() => {});
}

/** Lấp tên/ảnh cho các hội thoại còn trống — tin nhắn không phải lúc nào cũng kèm đủ thông tin. */
async function boSungTenHoiThoai(accountId, api) {
  const thieuTen = await prisma.zaloThread.findMany({
    // Không tra tên cho nhóm cũ còn sót lại trong DB: web không hiện chúng nữa, tra chỉ tổ
    // gọi Zalo thừa.
    where: { accountId, name: null, ...(NHAN_TIN_NHOM ? {} : { type: 0 }) },
    take: 30,
  });

  for (const thread of thieuTen) {
    try {
      if (thread.type === 1) {
        const info = await api.getGroupInfo(thread.threadId);
        const g = info?.gridInfoMap?.[thread.threadId];
        if (g?.name) {
          await prisma.zaloThread.update({
            where: { id: thread.id },
            data: { name: g.name, avatar: g.avt || g.fullAvt || null },
          });
        }
      } else {
        const info = await api.getUserInfo(thread.threadId);
        const u = info?.changed_profiles?.[thread.threadId];
        if (u?.displayName || u?.zaloName) {
          await prisma.zaloThread.update({
            where: { id: thread.id },
            data: { name: u.displayName || u.zaloName, avatar: u.avatar || null },
          });
        }
      }
    } catch (error) {
      // Zalo hay chặn tra cứu người lạ. Bỏ qua, hội thoại vẫn dùng được, chỉ thiếu tên.
      log(`Không lấy được tên hội thoại ${thread.threadId}: ${error.message}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Đăng nhập & listener
// ─────────────────────────────────────────────────────────────────────────────

/** `selfListen` để tin shop trả lời từ điện thoại cũng hiện trên web — nếu không, khung chat chỉ
 *  có một nửa câu chuyện. `checkUpdate: false` để worker không gọi mạng ra ngoài lúc khởi động. */
function taoZalo() {
  return new Zalo({ selfListen: true, checkUpdate: false, logging: false });
}

async function ganListener(accountId, api) {
  // getOwnId() đồng bộ (trả thẳng chuỗi), không phải Promise — đừng await/catch như hàm async.
  const ownId = api.getOwnId();
  const phien = layPhien(accountId);
  phien.api = api;
  phien.ownId = ownId;

  api.listener.on('connected', async () => {
    log(`[${accountId}] Đã kết nối Zalo.`);
    await ghiTrangThai(accountId, { trangThai: 'dang_chay', loi: null, qrImage: null, daKetNoi: true });
    await boSungTenHoiThoai(accountId, api).catch(() => {});
  });

  api.listener.on('message', (message) => {
    if (!message?.threadId) return;
    // Bỏ tin nhóm ngay tại cửa: không ghi DB, không tải đính kèm.
    if (!NHAN_TIN_NHOM && message.type === ThreadType.Group) return;

    xepHang(`${accountId}:${message.threadId}`, () =>
      luuTinNhan(accountId, message, ownId).catch((e) => log(`[${accountId}] Lưu tin nhắn lỗi:`, e.message)),
    );
  });

  // Khách thu hồi tin: giữ lại dòng và đánh dấu, xóa hẳn thì mất ngữ cảnh cuộc trò chuyện.
  api.listener.on('undo', async (undo) => {
    // `data.msgId` là id của chính hành động thu hồi; tin BỊ thu hồi nằm ở `data.content.globalMsgId`.
    const msgId = undo?.data?.content?.globalMsgId;
    if (!msgId || !undo.threadId) return;

    const thread = await prisma.zaloThread
      .findUnique({ where: { accountId_threadId: { accountId, threadId: undo.threadId } }, select: { id: true } })
      .catch(() => null);
    if (!thread) return;

    await prisma.zaloMessage
      .updateMany({ where: { threadId: thread.id, msgId: String(msgId) }, data: { isUndone: true } })
      .catch((e) => log(`[${accountId}] Đánh dấu thu hồi lỗi:`, e.message));
  });

  api.listener.on('closed', async (code, reason) => {
    log(`[${accountId}] Mất kết nối (code ${code}): ${reason}`);
    await ghiTrangThai(accountId, {
      trangThai: 'mat_ket_noi',
      loi: `Mất kết nối (${code}) ${reason || ''}`.trim(),
    });
  });

  api.listener.on('error', (error) => {
    log(`[${accountId}] Lỗi listener:`, error?.message || error);
  });

  // `retryOnClose` để rớt mạng vặt thì tự nối lại, không phải vào web bấm tay.
  api.listener.start({ retryOnClose: true });
}

/** Đăng nhập lại bằng cookie đã lưu. Trả false nếu chưa có phiên hoặc phiên đã chết. */
async function dangNhapBangCookie(acc) {
  if (!acc?.cookieJson || !acc.imei || !acc.userAgent) return false;

  try {
    const api = await taoZalo().login({
      cookie: JSON.parse(acc.cookieJson),
      imei: acc.imei,
      userAgent: acc.userAgent,
    });
    await ganListener(acc.id, api);
    log(`[${acc.id}] Đăng nhập bằng phiên đã lưu (${acc.nhan || acc.displayName || 'chưa đặt tên'}).`);
    return true;
  } catch (error) {
    // Cookie hết hạn hoặc bị Zalo thu hồi (đăng xuất từ điện thoại) — phải quét QR lại.
    log(`[${acc.id}] Phiên cũ không dùng được:`, error.message);
    await ghiTrangThai(acc.id, { trangThai: 'chua_dang_nhap', loi: `Phiên cũ hết hạn: ${error.message}` });
    return false;
  }
}

/**
 * Đóng listener hiện tại rồi đăng nhập lại bằng phiên đã lưu.
 *
 * Dùng khi một tài khoản rơi vào 'mat_ket_noi' hoặc listener treo (không thấy tin mới dù khách có
 * nhắn). Chỉ động tới đúng tài khoản đó — những tài khoản khác đang chạy ngon không việc gì phải
 * đứt theo như khi khởi động lại cả worker.
 */
async function ketNoiLai(accountId) {
  const acc = await prisma.zaloAccount.findUnique({ where: { id: accountId } });
  if (!acc) throw new Error('Không tìm thấy tài khoản');
  if (!acc.cookieJson) throw new Error('Tài khoản chưa có phiên đã lưu — bấm Đăng nhập để quét QR.');

  const phien = layPhien(accountId);
  if (phien.dangDangNhap) throw new Error('Tài khoản đang chờ quét QR — quét xong đã.');
  if (phien.dangKetNoiLai) throw new Error('Đang kết nối lại, chờ chút.');

  phien.dangKetNoiLai = true;
  try {
    dungListener(accountId);
    await ghiTrangThai(accountId, { trangThai: 'dang_ket_noi', loi: null, qrImage: null });
    log(`[${accountId}] Kết nối lại theo yêu cầu từ web.`);

    // `dangNhapBangCookie` đã tự ghi trạng thái khi phiên cũ chết; ở đây chỉ dịch ra câu cho web.
    const vaoDuoc = await dangNhapBangCookie(acc);
    if (!vaoDuoc) throw new Error('Phiên đã lưu không dùng được nữa — bấm Đăng nhập để quét QR lại.');
  } finally {
    phien.dangKetNoiLai = false;
  }
}

/**
 * Bắt đầu luồng quét QR cho một tài khoản. Chạy nền: hàm trả về ngay, ảnh QR xuất hiện dần ở
 * `phien.qrImage` để web poll lấy. Không chờ được vì `loginQR` chỉ kết thúc khi quét xong.
 */
async function batDauQuetQR(accountId) {
  const phien = layPhien(accountId);
  if (phien.dangDangNhap) return;
  phien.dangDangNhap = true;

  await ghiTrangThai(accountId, { trangThai: 'dang_cho_quet', qrImage: null, qrHetHan: false, loi: null });

  taoZalo()
    .loginQR({}, async (event) => {
      switch (event.type) {
        case LoginQRCallbackEventType.QRCodeGenerated:
          // `image` là PNG base64 (không kèm tiền tố data:) — web tự ghép khi hiển thị.
          phien.qrImage = event.data.image;
          phien.qrHetHan = false;
          log(`[${accountId}] Đã tạo mã QR, chờ quét.`);
          break;

        case LoginQRCallbackEventType.QRCodeExpired:
          phien.qrHetHan = true;
          phien.qrImage = null;
          log(`[${accountId}] Mã QR hết hạn.`);
          break;

        case LoginQRCallbackEventType.QRCodeScanned:
          log(`[${accountId}] Đã quét bởi ${event.data.display_name}. Chờ xác nhận trên điện thoại.`);
          break;

        case LoginQRCallbackEventType.QRCodeDeclined:
          log(`[${accountId}] Người dùng từ chối đăng nhập trên điện thoại.`);
          break;

        case LoginQRCallbackEventType.GotLoginInfo:
          // Đây mới là thứ cần giữ: có bộ này thì lần sau khởi động không phải quét QR nữa.
          await prisma.zaloAccount.update({
            where: { id: accountId },
            data: {
              cookieJson: JSON.stringify(event.data.cookie),
              imei: event.data.imei,
              userAgent: event.data.userAgent,
            },
          });
          log(`[${accountId}] Đã lưu phiên đăng nhập.`);
          break;
      }
    })
    .then(async (api) => {
      phien.qrImage = null;

      const me = await api.fetchAccountInfo().catch(() => null);
      await prisma.zaloAccount.update({
        where: { id: accountId },
        data: {
          ownId: String(api.getOwnId()),
          displayName: me?.profile?.displayName || null,
          avatar: me?.profile?.avatar || null,
        },
      });

      await ganListener(accountId, api);
    })
    .catch(async (error) => {
      log(`[${accountId}] Đăng nhập QR thất bại:`, error.message);
      await ghiTrangThai(accountId, { trangThai: 'loi', qrImage: null, loi: error.message });
    })
    .finally(() => {
      phien.dangDangNhap = false;
    });
}

function dungListener(accountId) {
  const phien = phienTheoTaiKhoan.get(accountId);
  try {
    phien?.api?.listener?.stop();
  } catch {
    // Listener chưa chạy hoặc đã đóng — không có gì để dừng.
  }
  if (phien) {
    phien.api = null;
    phien.ownId = null;
  }
}

async function dangXuat(accountId) {
  dungListener(accountId);
  await prisma.zaloAccount.update({
    where: { id: accountId },
    data: { cookieJson: null, imei: null, userAgent: null, trangThai: 'chua_dang_nhap', lastError: null },
  });
  Object.assign(layPhien(accountId), { trangThai: 'chua_dang_nhap', qrImage: null, loi: null });
  log(`[${accountId}] Đã đăng xuất, xóa phiên đã lưu.`);
}

async function xoaTaiKhoan(accountId) {
  dungListener(accountId);
  phienTheoTaiKhoan.delete(accountId);
  // Hội thoại và tin nhắn của tài khoản này cũng đi theo (onDelete: Cascade trong schema).
  await prisma.zaloAccount.delete({ where: { id: accountId } });
  log(`[${accountId}] Đã xóa tài khoản cùng toàn bộ hội thoại.`);
}

async function themTaiKhoan(nhan) {
  const acc = await prisma.zaloAccount.create({ data: { nhan: nhan?.trim() || 'Tài khoản mới' } });
  log(`[${acc.id}] Đã thêm tài khoản "${acc.nhan}".`);
  return { id: acc.id, nhan: acc.nhan };
}

/**
 * Gửi tin từ web ra Zalo, rồi ghi luôn vào DB để khung chat hiện ngay — không chờ tin vọng về
 * qua listener (có thể trễ hoặc không về).
 *
 * Web chỉ truyền khóa nội bộ của hội thoại; worker tự tra ra tài khoản nào phải gửi. Nhờ vậy web
 * không cần biết tin này thuộc tài khoản Zalo nào.
 */
async function guiTin({ threadId, text, quoteMsgId }) {
  if (!threadId || !text?.trim()) throw new Error('Thiếu hội thoại hoặc nội dung');

  const thread = await prisma.zaloThread.findUnique({ where: { id: threadId } });
  if (!thread) throw new Error('Không tìm thấy hội thoại');

  const phien = phienTheoTaiKhoan.get(thread.accountId);
  if (!phien?.api) throw new Error('Tài khoản Zalo của hội thoại này chưa đăng nhập');

  const loai = thread.type === 1 ? ThreadType.Group : ThreadType.User;

  // Trả lời một tin cụ thể thì Zalo cần cả payload gốc của tin đó, không chỉ mỗi id.
  let quote;
  if (quoteMsgId) {
    const goc = await prisma.zaloMessage.findUnique({
      where: { threadId_msgId: { threadId: thread.id, msgId: String(quoteMsgId) } },
    });
    if (goc?.rawJson) {
      try {
        quote = JSON.parse(goc.rawJson);
      } catch {
        // rawJson hỏng — gửi thường, không trích dẫn.
      }
    }
  }

  const ketQua = await phien.api.sendMessage({ msg: text, quote }, thread.threadId, loai);
  const msgId = ketQua?.message?.msgId;

  const sentAt = new Date();
  // Zalo không trả msgId trong vài trường hợp — sinh id tạm để tin vẫn hiện trên web. Phải tính
  // MỘT lần rồi dùng lại: gọi randomUUID() ở cả `where` lẫn `create` thì ra hai id khác nhau.
  const khoaTin = String(msgId ?? `local-${randomUUID()}`);

  // Đi qua hàng đợi của hội thoại để không đua với tin vọng về từ listener (`selfListen`).
  await xepHang(`${thread.accountId}:${thread.threadId}`, async () => {
    await prisma.zaloThread.update({
      where: { id: thread.id },
      data: { lastMessageAt: sentAt, lastMessageText: text.slice(0, 200), unreadCount: 0 },
    });

    try {
      await prisma.zaloMessage.create({
        data: {
          msgId: khoaTin,
          threadId: thread.id,
          isSelf: true,
          msgType: 'webchat',
          content: text,
          quoteMsgId: quoteMsgId ? String(quoteMsgId) : null,
          sentAt,
        },
      });
    } catch (error) {
      // Listener kịp ghi trước — tin đã nằm trong DB rồi, không có gì phải làm.
      if (!laTrungKhoa(error)) throw error;
    }
  });

  return { msgId: msgId ?? null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cổng điều khiển — web gọi vào đây
// ─────────────────────────────────────────────────────────────────────────────

function traLoi(res, status, duLieu) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(duLieu));
}

function docBody(req) {
  return new Promise((resolve, reject) => {
    const phan = [];
    req.on('data', (c) => phan.push(c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(phan).toString('utf8') || '{}'));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

/** Gộp phần bền (DB) với phần sống (RAM) cho mọi tài khoản. */
async function trangThaiTatCa() {
  const dsTaiKhoan = await prisma.zaloAccount.findMany({ orderBy: { updatedAt: 'asc' } });

  return dsTaiKhoan.map((acc) => {
    const phien = phienTheoTaiKhoan.get(acc.id);
    return {
      id: acc.id,
      nhan: acc.nhan,
      displayName: acc.displayName,
      avatar: acc.avatar,
      // Ưu tiên trạng thái trong RAM: DB có thể còn ghi 'dang_chay' của lần chạy trước đã chết.
      trangThai: phien?.trangThai ?? (acc.cookieJson ? 'mat_ket_noi' : 'chua_dang_nhap'),
      qrImage: phien?.qrImage ?? null,
      qrHetHan: phien?.qrHetHan ?? false,
      loi: phien?.loi ?? acc.lastError,
      daLuuPhien: Boolean(acc.cookieJson),
      lastConnectedAt: acc.lastConnectedAt,
      lastMessageAt: acc.lastMessageAt,
    };
  });
}

const server = createServer(async (req, res) => {
  // Cổng này gửi được tin nhắn dưới danh nghĩa shop nên phải có token, kể cả khi chỉ nghe localhost.
  if (TOKEN && req.headers['x-worker-token'] !== TOKEN) return traLoi(res, 401, { loi: 'Sai token' });

  const duongDan = new URL(req.url, 'http://localhost').pathname;

  try {
    if (req.method === 'GET' && duongDan === '/trang-thai') {
      return traLoi(res, 200, { taiKhoan: await trangThaiTatCa() });
    }

    if (req.method === 'POST') {
      const body = await docBody(req);

      if (duongDan === '/them-tai-khoan') return traLoi(res, 200, await themTaiKhoan(body.nhan));
      if (duongDan === '/gui-tin') return traLoi(res, 200, await guiTin(body));

      if (duongDan === '/khoi-dong-lai') {
        if (!TRONG_DOCKER) {
          return traLoi(res, 409, {
            loi: 'Worker không chạy trong Docker — thoát ra sẽ không có ai dựng lại. Hãy khởi động lại bằng tay trên máy chủ.',
          });
        }
        if (process.uptime() < CHO_TRUOC_KHI_KHOI_DONG_LAI_GIAY) {
          return traLoi(res, 429, {
            loi: `Worker vừa khởi động ${Math.round(process.uptime())} giây trước. Chờ chút rồi thử lại — đăng nhập Zalo dồn dập dễ bị khóa tài khoản.`,
          });
        }

        // Trả lời XONG rồi mới thoát: thoát ngay thì web nhận đứt kết nối và tưởng là lỗi.
        // Docker (`restart: unless-stopped`) dựng lại tiến trình sau vài giây.
        traLoi(res, 200, { ok: true });
        res.on('finish', () => {
          log('Có lệnh khởi động lại từ web — thoát để Docker dựng lại.');
          void dungHan();
        });
        return;
      }

      // Các endpoint còn lại đều thao tác trên một tài khoản cụ thể.
      if (!body.accountId) return traLoi(res, 400, { loi: 'Thiếu accountId' });

      if (duongDan === '/ket-noi-lai') {
        await ketNoiLai(body.accountId);
        return traLoi(res, 200, { ok: true });
      }

      if (duongDan === '/dang-nhap-qr') {
        await batDauQuetQR(body.accountId);
        return traLoi(res, 200, { ok: true });
      }
      if (duongDan === '/dang-xuat') {
        await dangXuat(body.accountId);
        return traLoi(res, 200, { ok: true });
      }
      if (duongDan === '/xoa-tai-khoan') {
        await xoaTaiKhoan(body.accountId);
        return traLoi(res, 200, { ok: true });
      }
    }

    return traLoi(res, 404, { loi: 'Không có endpoint này' });
  } catch (error) {
    log('Lỗi xử lý request:', error.message);
    return traLoi(res, 500, { loi: error.message });
  }
});

// Nghe mọi giao diện vì trong Docker web gọi vào từ ngoài container; chặn truy cập trái phép bằng
// token và bằng việc compose chỉ publish cổng ra 127.0.0.1 của máy chủ.
server.listen(PORT, '0.0.0.0', async () => {
  log(`Cổng điều khiển: http://0.0.0.0:${PORT}`);
  if (!TOKEN) log('⚠ Chưa đặt ZALO_WORKER_TOKEN — cổng điều khiển đang không kiểm tra token.');
  log(`Thư mục lưu đính kèm: ${THU_MUC_FILE}`);

  const dsTaiKhoan = await prisma.zaloAccount.findMany();
  if (dsTaiKhoan.length === 0) {
    log('Chưa có tài khoản nào. Vào tab Zalo trên web bấm "Thêm tài khoản".');
    return;
  }

  // Đăng nhập lần lượt chứ không song song: nhiều phiên bật cùng lúc dễ bị Zalo coi là bất thường.
  for (const acc of dsTaiKhoan) {
    const vaoDuoc = await dangNhapBangCookie(acc);
    if (!vaoDuoc) log(`[${acc.id}] Chưa có phiên — vào web quét QR cho tài khoản này.`);
  }
});

async function dungHan() {
  log('Đang dừng...');
  for (const accountId of phienTheoTaiKhoan.keys()) dungListener(accountId);
  await prisma.$disconnect().catch(() => {});
  process.exit(0);
}

process.on('SIGINT', dungHan);
process.on('SIGTERM', dungHan);
