'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  LogOut,
  MessageSquare,
  Paperclip,
  Plus,
  Power,
  QrCode,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Trash2,
  Users,
} from 'lucide-react';

import ThongBaoMayIn from './thong-bao-may-in';

type TaiKhoanZalo = {
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

type ZaloThread = {
  id: string;
  accountId: string;
  threadId: string;
  type: number; // 0 = chat riêng, 1 = nhóm
  name: string | null;
  avatar: string | null;
  lastMessageAt: string | null;
  lastMessageText: string | null;
  unreadCount: number;
  account: { id: string; nhan: string | null; displayName: string | null };
};

type ZaloAttachment = {
  id: string;
  kind: string;
  fileName: string | null;
  mimeType: string | null;
  size: number | null;
  url: string | null;
  localPath: string | null;
  taiLoi: string | null;
};

type ZaloMessage = {
  id: string;
  msgId: string;
  senderName: string | null;
  isSelf: boolean;
  msgType: string;
  content: string | null;
  isUndone: boolean;
  sentAt: string;
  attachments: ZaloAttachment[];
};

type ApiResponse<T> = { status?: string; data?: T; message?: string };

const LOP_THE = 'rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#111827]';
const LOP_NHAP =
  'h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900';
const LOP_NUT =
  'inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50';

/** Tin mới chỉ vào DB qua worker nên web phải hỏi lại theo nhịp — không có kênh đẩy từ server. */
const NHIP_TAI_LAI_MS = 5000;
/** Lúc chờ quét QR thì hỏi dày hơn, vì mã QR chỉ sống mấy chục giây. */
const NHIP_QR_MS = 2000;

const NHAN_TRANG_THAI: Record<string, { nhan: string; mau: string }> = {
  chua_dang_nhap: { nhan: 'Chưa đăng nhập', mau: 'text-slate-500' },
  dang_cho_quet: { nhan: 'Đang chờ quét QR', mau: 'text-amber-500' },
  dang_chay: { nhan: 'Đang nhận tin', mau: 'text-emerald-500' },
  dang_ket_noi: { nhan: 'Đang kết nối lại...', mau: 'text-sky-500' },
  mat_ket_noi: { nhan: 'Mất kết nối', mau: 'text-amber-500' },
  loi: { nhan: 'Lỗi', mau: 'text-rose-500' },
};

function thongBao(message: string, type: 'success' | 'error' | 'info') {
  window.dispatchEvent(new CustomEvent('appToast', { detail: { message, type } }));
}

function gioTin(iso: string) {
  return new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** Danh sách hội thoại chỉ cần "mấy giờ" cho tin hôm nay, ngày/tháng cho tin cũ — cho đỡ rối mắt. */
function gioNgan(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const homNay = new Date().toDateString() === d.toDateString();
  return homNay
    ? d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

function dinhDangDungLuong(byte: number | null) {
  if (!byte) return '';
  if (byte < 1024) return `${byte} B`;
  if (byte < 1024 * 1024) return `${(byte / 1024).toFixed(0)} KB`;
  return `${(byte / 1024 / 1024).toFixed(1)} MB`;
}

function tenTaiKhoan(acc: { nhan: string | null; displayName: string | null }) {
  return acc.nhan || acc.displayName || 'Chưa đặt tên';
}

/**
 * Mỗi tài khoản một màu cố định, dùng thống nhất ở thẻ tài khoản, danh sách hội thoại và khung
 * chat — nhìn màu là biết ngay tin của tài khoản nào mà không cần đọc chữ.
 *
 * Màu suy ra từ accountId chứ không phải từ vị trí trong danh sách: thêm/xóa tài khoản khác
 * không làm đổi màu những tài khoản còn lại.
 *
 * Class phải viết đủ chuỗi (không ghép chuỗi động) vì Tailwind quét mã nguồn ở dạng tĩnh.
 */
const MAU_TAI_KHOAN = [
  { cham: 'bg-indigo-500', vien: 'border-l-indigo-500', the: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' },
  { cham: 'bg-emerald-500', vien: 'border-l-emerald-500', the: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' },
  { cham: 'bg-amber-500', vien: 'border-l-amber-500', the: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
  { cham: 'bg-rose-500', vien: 'border-l-rose-500', the: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' },
  { cham: 'bg-sky-500', vien: 'border-l-sky-500', the: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300' },
  { cham: 'bg-violet-500', vien: 'border-l-violet-500', the: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300' },
];

function mauTaiKhoan(accountId: string) {
  let tong = 0;
  for (let i = 0; i < accountId.length; i += 1) tong = (tong + accountId.charCodeAt(i)) % 997;
  return MAU_TAI_KHOAN[tong % MAU_TAI_KHOAN.length];
}

/** Chấm màu + tên tài khoản — dùng lại ở mọi chỗ cần chỉ rõ "tin này thuộc tài khoản nào". */
function NhanTaiKhoan({
  acc,
  co = 'nho',
}: {
  acc: { id: string; nhan: string | null; displayName: string | null };
  co?: 'nho' | 'vua';
}) {
  const mau = mauTaiKhoan(acc.id);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded font-semibold ${mau.the} ${
        co === 'vua' ? 'px-2 py-1 text-xs' : 'px-1.5 py-0.5 text-[10px]'
      }`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${mau.cham}`} />
      {tenTaiKhoan(acc)}
    </span>
  );
}

function tenHoiThoai(thread: ZaloThread) {
  // Zalo hay chặn tra cứu người lạ nên có hội thoại không lấy được tên — hiện id để còn phân biệt.
  return thread.name || (thread.type === 1 ? 'Nhóm chưa rõ tên' : `Khách ${thread.threadId.slice(-6)}`);
}

/** Ảnh/file hiển thị qua API route (file nằm ngoài `public/`). Tải lỗi thì rơi về link Zalo gốc. */
function DinhKem({ dinhKem }: { dinhKem: ZaloAttachment }) {
  const src = dinhKem.localPath ? `/api/zalo/attachments/${dinhKem.id}` : dinhKem.url;
  if (!src) return <p className="text-xs italic opacity-70">[Đính kèm không tải được: {dinhKem.taiLoi}]</p>;

  if (dinhKem.kind === 'image') {
    return (
      <a href={src} target="_blank" rel="noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={dinhKem.fileName || 'Ảnh khách gửi'} className="max-h-64 rounded-lg" />
      </a>
    );
  }
  if (dinhKem.kind === 'video') return <video src={src} controls className="max-h-64 rounded-lg" />;
  if (dinhKem.kind === 'voice') return <audio src={src} controls className="h-10" />;

  return (
    <a href={src} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm underline">
      <Paperclip className="h-4 w-4" />
      {dinhKem.fileName || 'Tệp đính kèm'}
      <span className="opacity-70">{dinhDangDungLuong(dinhKem.size)}</span>
    </a>
  );
}

/** Một dòng tài khoản trong thanh quản lý phía trên. */
function TheTaiKhoan({
  acc,
  onDangNhap,
  onKetNoiLai,
  onDangXuat,
  onXoa,
}: {
  acc: TaiKhoanZalo;
  onDangNhap: () => void;
  onKetNoiLai: () => void;
  onDangXuat: () => void;
  onXoa: () => void;
}) {
  const nhan = NHAN_TRANG_THAI[acc.trangThai] || NHAN_TRANG_THAI.chua_dang_nhap;
  const dangChay = acc.trangThai === 'dang_chay';
  const mau = mauTaiKhoan(acc.id);

  return (
    // Viền trái tô màu riêng của tài khoản — cùng màu với nhãn ở danh sách hội thoại bên dưới.
    <div className={`flex items-center gap-2 rounded-xl border border-l-4 border-slate-200 px-3 py-2 dark:border-slate-800 ${mau.vien}`}>
      {dangChay ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
      ) : (
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
      )}
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{tenTaiKhoan(acc)}</p>
        <p className={`text-xs ${nhan.mau}`}>{nhan.nhan}</p>
        {/* Tên Zalo thật, hiện khi khác với tên tự đặt — để biết thẻ này ứng với số điện thoại nào. */}
        {acc.displayName && acc.nhan && acc.displayName !== acc.nhan && (
          <p className="truncate text-[11px] text-slate-400">Zalo: {acc.displayName}</p>
        )}
      </div>

      <div className="ml-2 flex items-center gap-1">
        {/* Chỉ có phiên đã lưu mới nối lại được — chưa quét QR bao giờ thì không có gì để nối. */}
        {acc.daLuuPhien && (
          <button
            type="button"
            onClick={onKetNoiLai}
            disabled={acc.trangThai === 'dang_ket_noi'}
            title="Kết nối lại tài khoản này (không ảnh hưởng tài khoản khác)"
            className="rounded-lg p-2 text-sky-600 hover:bg-sky-50 disabled:opacity-40 dark:hover:bg-sky-950/40"
          >
            <RotateCcw className={`h-4 w-4 ${acc.trangThai === 'dang_ket_noi' ? 'animate-spin' : ''}`} />
          </button>
        )}
        {dangChay || acc.daLuuPhien ? (
          <button
            type="button"
            onClick={onDangXuat}
            title="Đăng xuất tài khoản này"
            className="rounded-lg p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
          >
            <LogOut className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onDangNhap}
            title="Đăng nhập bằng QR"
            className="rounded-lg p-2 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
          >
            <QrCode className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={onXoa}
          title="Xóa tài khoản khỏi web"
          className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default function ZaloTab() {
  const [workerChay, setWorkerChay] = useState(true);
  const [taiKhoan, setTaiKhoan] = useState<TaiKhoanZalo[]>([]);
  const [threads, setThreads] = useState<ZaloThread[]>([]);
  const [threadDangMo, setThreadDangMo] = useState<ZaloThread | null>(null);
  const [messages, setMessages] = useState<ZaloMessage[]>([]);
  const [tuKhoa, setTuKhoa] = useState('');
  /** '' = hộp thư gộp (mọi tài khoản). */
  const [locTaiKhoan, setLocTaiKhoan] = useState('');
  const [noiDung, setNoiDung] = useState('');
  const [dangGui, setDangGui] = useState(false);
  const [dangTai, setDangTai] = useState(true);
  const [dangKhoiDongLai, setDangKhoiDongLai] = useState(false);

  const cuoiKhungChat = useRef<HTMLDivElement>(null);
  /** Chỉ tự cuộn khi có tin MỚI — cuộn mỗi nhịp poll sẽ giật màn hình lúc đang đọc tin cũ. */
  const soTinTruoc = useRef(0);

  const taiTrangThai = useCallback(async () => {
    try {
      const res = await fetch('/api/zalo/status', { cache: 'no-store' });
      const data = (await res.json()) as ApiResponse<{ workerChay: boolean; taiKhoan: TaiKhoanZalo[] }>;
      if (data.status === 'success' && data.data) {
        setWorkerChay(data.data.workerChay);
        setTaiKhoan(data.data.taiKhoan);
      }
    } catch {
      // Nhịp poll — lỗi mạng vặt không cần báo, nhịp sau tự khỏi.
    }
  }, []);

  const taiThreads = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/zalo/threads?q=${encodeURIComponent(tuKhoa)}&accountId=${encodeURIComponent(locTaiKhoan)}`,
        { cache: 'no-store' },
      );
      const data = (await res.json()) as ApiResponse<{ threads: ZaloThread[] }>;
      if (data.status === 'success' && data.data) setThreads(data.data.threads);
    } catch {
      // Như trên.
    } finally {
      setDangTai(false);
    }
  }, [tuKhoa, locTaiKhoan]);

  const taiTinNhan = useCallback(async (threadId: string) => {
    try {
      const res = await fetch(`/api/zalo/threads/${threadId}/messages`, { cache: 'no-store' });
      const data = (await res.json()) as ApiResponse<{ messages: ZaloMessage[] }>;
      if (data.status === 'success' && data.data) setMessages(data.data.messages);
    } catch {
      // Như trên.
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void taiTrangThai();
      void taiThreads();
    });
  }, [taiTrangThai, taiThreads]);

  // Có tài khoản nào đang chờ quét QR thì poll dày hơn để mã hiện ra ngay và kịp bắt lúc hết hạn.
  const dangQR = taiKhoan.some((a) => a.trangThai === 'dang_cho_quet');

  useEffect(() => {
    const id = window.setInterval(() => {
      void taiTrangThai();
      if (!dangQR) {
        void taiThreads();
        if (threadDangMo) void taiTinNhan(threadDangMo.id);
      }
    }, dangQR ? NHIP_QR_MS : NHIP_TAI_LAI_MS);
    return () => window.clearInterval(id);
  }, [dangQR, threadDangMo, taiTrangThai, taiThreads, taiTinNhan]);

  useEffect(() => {
    if (messages.length > soTinTruoc.current) cuoiKhungChat.current?.scrollIntoView({ behavior: 'smooth' });
    soTinTruoc.current = messages.length;
  }, [messages]);

  const moHoiThoai = async (thread: ZaloThread) => {
    setThreadDangMo(thread);
    setMessages([]);
    soTinTruoc.current = 0;
    await taiTinNhan(thread.id);
    // Mở là coi như đã đọc — cập nhật ngay trên UI, không chờ nhịp poll kế tiếp.
    setThreads((cu) => cu.map((t) => (t.id === thread.id ? { ...t, unreadCount: 0 } : t)));
  };

  const goiHanhDong = async (body: Record<string, unknown>) => {
    try {
      const res = await fetch('/api/zalo/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as ApiResponse<unknown>;
      thongBao(data.message || 'Đã xử lý.', data.status === 'success' ? 'success' : 'error');
      await taiTrangThai();
      await taiThreads();
    } catch {
      thongBao('Lỗi kết nối máy chủ.', 'error');
    }
  };

  const themTaiKhoan = async () => {
    const nhan = window.prompt('Tên gợi nhớ cho tài khoản Zalo này (VD: Shop chính, CSKH):');
    if (nhan === null) return;
    await goiHanhDong({ hanhDong: 'them', nhan });
  };

  /**
   * Khởi động lại cả worker: mọi tài khoản đứt rồi đăng nhập lại. Hỏi trước vì trong lúc đó shop
   * không nhận được tin nào, và vì đăng nhập Zalo dồn dập dễ bị khóa tài khoản.
   */
  const khoiDongLaiWorker = async () => {
    if (
      !window.confirm(
        'Khởi động lại worker Zalo?\n\nTất cả tài khoản sẽ đứt kết nối rồi tự đăng nhập lại bằng phiên đã lưu (khoảng 10 giây). Nếu chỉ một tài khoản bị lỗi, hãy bấm "Kết nối lại" trên thẻ của tài khoản đó thay vì cái này.',
      )
    ) {
      return;
    }
    setDangKhoiDongLai(true);
    await goiHanhDong({ hanhDong: 'khoi-dong-lai' });
    // Worker cần vài giây để dựng lại — hỏi lại trạng thái sau đó, không thì UI đứng ở "chưa chạy".
    window.setTimeout(() => {
      void taiTrangThai();
      setDangKhoiDongLai(false);
    }, 10000);
  };

  const xoaTaiKhoan = async (acc: TaiKhoanZalo) => {
    // Xóa tài khoản kéo theo toàn bộ hội thoại và tin nhắn (cascade) — phải hỏi cho chắc.
    if (!window.confirm(`Xóa tài khoản "${tenTaiKhoan(acc)}"?\n\nToàn bộ hội thoại và tin nhắn đã lưu của tài khoản này sẽ mất.`)) {
      return;
    }
    if (threadDangMo?.accountId === acc.id) setThreadDangMo(null);
    await goiHanhDong({ hanhDong: 'xoa', accountId: acc.id });
  };

  const gui = async () => {
    if (!threadDangMo || !noiDung.trim()) return;
    setDangGui(true);
    // Xóa ô nhập ngay cho gõ tiếp được; gửi lỗi thì trả chữ về để khỏi mất công gõ lại.
    const banGoc = noiDung;
    setNoiDung('');

    try {
      const res = await fetch('/api/zalo/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: threadDangMo.id, text: banGoc }),
      });
      const data = (await res.json()) as ApiResponse<unknown>;
      if (data.status === 'success') {
        await taiTinNhan(threadDangMo.id);
      } else {
        setNoiDung(banGoc);
        thongBao(data.message || 'Không gửi được tin.', 'error');
      }
    } catch {
      setNoiDung(banGoc);
      thongBao('Lỗi kết nối máy chủ.', 'error');
    } finally {
      setDangGui(false);
    }
  };

  // Chỉ gửi được khi TÀI KHOẢN CỦA hội thoại đang mở còn sống — tài khoản khác chạy không giúp gì.
  const taiKhoanCuaThread = taiKhoan.find((a) => a.id === threadDangMo?.accountId);
  const guiDuoc = taiKhoanCuaThread?.trangThai === 'dang_chay';
  const qrDangCho = taiKhoan.filter((a) => a.trangThai === 'dang_cho_quet');

  return (
    <div className="space-y-4">
      {/* ── Quản lý tài khoản ── */}
      <div className={`${LOP_THE} p-4`}>
        <div className="mb-3 flex items-center gap-2">
          <h3 className="text-sm font-semibold">Tài khoản Zalo ({taiKhoan.length})</h3>
          {!workerChay && (
            <span className="text-xs text-rose-500">
              {dangKhoiDongLai
                ? 'Đang dựng lại worker, chờ vài giây...'
                : 'Worker chưa chạy — trên máy chủ chạy '}
              {!dangKhoiDongLai && <code>docker compose up -d zalo-worker</code>}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => void taiTrangThai()}
              className={`${LOP_NUT} border border-slate-300 dark:border-slate-700`}
            >
              <RefreshCw className="h-4 w-4" /> Làm mới
            </button>
            {/* Worker chết hẳn thì nút này vô dụng (lệnh đi qua chính worker) — Docker lo phần dựng lại. */}
            <button
              type="button"
              onClick={() => void khoiDongLaiWorker()}
              disabled={!workerChay || dangKhoiDongLai}
              title="Thoát worker để Docker dựng lại — dùng khi worker treo"
              className={`${LOP_NUT} border border-slate-300 dark:border-slate-700`}
            >
              {dangKhoiDongLai ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
              Khởi động lại worker
            </button>
            <button
              type="button"
              onClick={() => void themTaiKhoan()}
              disabled={!workerChay}
              className={`${LOP_NUT} bg-indigo-600 text-white`}
            >
              <Plus className="h-4 w-4" /> Thêm tài khoản
            </button>
          </div>
        </div>

        {taiKhoan.length === 0 ? (
          <p className="text-sm text-slate-500">
            Chưa có tài khoản nào. Bấm &quot;Thêm tài khoản&quot; rồi quét QR bằng app Zalo của shop.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {taiKhoan.map((acc) => (
              <TheTaiKhoan
                key={acc.id}
                acc={acc}
                onDangNhap={() => void goiHanhDong({ hanhDong: 'dang-nhap', accountId: acc.id })}
                onKetNoiLai={() => void goiHanhDong({ hanhDong: 'ket-noi-lai', accountId: acc.id })}
                onDangXuat={() => void goiHanhDong({ hanhDong: 'dang-xuat', accountId: acc.id })}
                onXoa={() => void xoaTaiKhoan(acc)}
              />
            ))}
          </div>
        )}

        {/* Lỗi của từng tài khoản gom xuống dưới cho khỏi chật thẻ. */}
        {taiKhoan.filter((a) => a.loi).map((a) => (
          <p key={a.id} className="mt-2 text-xs text-rose-500">
            {tenTaiKhoan(a)}: {a.loi}
          </p>
        ))}
      </div>

      {/* ── Thông báo máy in: dùng chính danh sách hội thoại ở đây để chọn nơi nhận ── */}
      <ThongBaoMayIn threads={threads} />

      {/* ── Mã QR: hiện cho từng tài khoản đang chờ quét ── */}
      {qrDangCho.map((acc) => (
        <div key={acc.id} className={`${LOP_THE} flex flex-col items-center gap-3 p-6`}>
          <p className="text-sm font-semibold">Quét QR cho: {tenTaiKhoan(acc)}</p>
          {acc.qrImage ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`data:image/png;base64,${acc.qrImage}`}
                alt={`Mã QR đăng nhập Zalo cho ${tenTaiKhoan(acc)}`}
                className="h-56 w-56 rounded-lg bg-white p-2"
              />
              <p className="text-sm text-slate-500">Mở app Zalo trên điện thoại → Thêm → Mã QR → quét mã này.</p>
            </>
          ) : acc.qrHetHan ? (
            <p className="text-sm text-amber-500">Mã QR đã hết hạn. Bấm nút QR ở thẻ tài khoản để lấy mã mới.</p>
          ) : (
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Đang tạo mã QR...
            </p>
          )}
        </div>
      ))}

      {/* ── Hộp thư: danh sách hội thoại bên trái, khung chat bên phải ── */}
      <div className={`${LOP_THE} grid h-[calc(100vh-22rem)] min-h-[28rem] grid-cols-1 overflow-hidden md:grid-cols-[20rem_1fr]`}>
        <aside className="flex flex-col border-slate-200 md:border-r dark:border-slate-800">
          <div className="space-y-2 p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={tuKhoa}
                onChange={(e) => setTuKhoa(e.target.value)}
                placeholder="Tìm khách..."
                className={`${LOP_NHAP} w-full pl-9`}
              />
            </div>
            {/* Nhiều tài khoản thì mới cần lọc; một tài khoản mà hiện ô này chỉ tổ rối. */}
            {taiKhoan.length > 1 && (
              <select value={locTaiKhoan} onChange={(e) => setLocTaiKhoan(e.target.value)} className={`${LOP_NHAP} w-full`}>
                <option value="">Tất cả tài khoản</option>
                {taiKhoan.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {tenTaiKhoan(acc)}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {dangTai ? (
              <p className="flex items-center justify-center gap-2 p-6 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Đang tải...
              </p>
            ) : threads.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-500">
                Chưa có hội thoại nào. Tin nhắn sẽ tự hiện ở đây khi khách nhắn tới.
              </p>
            ) : (
              threads.map((thread) => (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => void moHoiThoai(thread)}
                  // Viền trái mang màu của tài khoản: lướt danh sách là phân được nhóm tin theo
                  // tài khoản mà không phải đọc từng nhãn.
                  className={`flex w-full items-start gap-3 border-b border-l-4 border-slate-100 p-3 text-left hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50 ${
                    mauTaiKhoan(thread.accountId).vien
                  } ${threadDangMo?.id === thread.id ? 'bg-indigo-50 dark:bg-indigo-950/40' : ''}`}
                >
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700">
                    {thread.type === 1 ? <Users className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold">{tenHoiThoai(thread)}</span>
                      <span className="ml-auto shrink-0 text-[11px] text-slate-400">
                        {gioNgan(thread.lastMessageAt)}
                      </span>
                    </div>
                    <p className="truncate text-xs text-slate-500">{thread.lastMessageText || ''}</p>
                    {/* Luôn hiện, kể cả khi mới có 1 tài khoản: thêm tài khoản thứ hai lúc nào
                        cũng được, mà thói quen đọc nhãn thì cần có sẵn từ đầu. */}
                    <span className="mt-1 inline-block">
                      <NhanTaiKhoan acc={thread.account} />
                    </span>
                  </div>
                  {thread.unreadCount > 0 && (
                    <span className="mt-1 shrink-0 rounded-full bg-rose-500 px-1.5 text-[11px] font-semibold text-white">
                      {thread.unreadCount}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="flex min-h-0 flex-col">
          {!threadDangMo ? (
            <p className="m-auto text-sm text-slate-500">Chọn một hội thoại để xem tin nhắn.</p>
          ) : (
            <>
              {/* Viền trái đậm màu tài khoản chạy dọc cả khung chat — chống nhầm khi mở nhiều
                  hội thoại của các tài khoản khác nhau liên tiếp. */}
              <header
                className={`flex items-center gap-3 border-b border-l-4 border-slate-200 p-3 dark:border-slate-800 ${
                  mauTaiKhoan(threadDangMo.accountId).vien
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{tenHoiThoai(threadDangMo)}</p>
                  <p className="text-xs text-slate-500">
                    {threadDangMo.type === 1 ? 'Nhóm' : 'Chat riêng'} · ID Zalo {threadDangMo.threadId}
                  </p>
                </div>
                <div className="ml-auto shrink-0 text-right">
                  <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">Đang trả lời bằng</p>
                  <NhanTaiKhoan acc={threadDangMo.account} co="vua" />
                </div>
              </header>

              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.isSelf ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[75%] space-y-1 rounded-2xl px-3 py-2 text-sm ${
                        msg.isSelf ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'
                      }`}
                    >
                      {/* Trong nhóm cần biết ai nói; chat riêng thì thừa. */}
                      {!msg.isSelf && threadDangMo.type === 1 && msg.senderName && (
                        <p className="text-xs font-semibold opacity-70">{msg.senderName}</p>
                      )}

                      {msg.isUndone ? (
                        <p className="text-sm italic opacity-60">Tin nhắn đã thu hồi</p>
                      ) : (
                        <>
                          {msg.attachments.map((dk) => (
                            <DinhKem key={dk.id} dinhKem={dk} />
                          ))}
                          {msg.content && <p className="whitespace-pre-wrap break-words">{msg.content}</p>}
                        </>
                      )}

                      <p className={`text-[11px] ${msg.isSelf ? 'text-indigo-200' : 'text-slate-400'}`}>
                        {gioTin(msg.sentAt)}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={cuoiKhungChat} />
              </div>

              <footer
                className={`flex items-end gap-2 border-t border-l-4 border-slate-200 p-3 dark:border-slate-800 ${
                  mauTaiKhoan(threadDangMo.accountId).vien
                }`}
              >
                <textarea
                  value={noiDung}
                  onChange={(e) => setNoiDung(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter gửi, Shift+Enter xuống dòng — thói quen từ mọi app chat.
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void gui();
                    }
                  }}
                  rows={2}
                  placeholder={
                    guiDuoc
                      ? 'Nhập tin nhắn... (Enter để gửi)'
                      : `Tài khoản "${tenTaiKhoan(threadDangMo.account)}" chưa đăng nhập — không gửi được`
                  }
                  disabled={!guiDuoc}
                  className="flex-1 resize-none rounded-lg border border-slate-300 bg-white p-2 text-sm outline-none focus:border-indigo-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900"
                />
                <button
                  type="button"
                  onClick={() => void gui()}
                  disabled={!guiDuoc || dangGui || !noiDung.trim()}
                  className={`${LOP_NUT} bg-indigo-600 text-white`}
                >
                  {dangGui ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Gửi
                </button>
              </footer>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
