'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  MonitorSmartphone,
  PackageMinus,
  RefreshCw,
  ShoppingCart,
  XCircle,
} from 'lucide-react';

type EshopOrderItem = {
  id: string;
  skuCode: string | null;
  itemName: string;
  quantity: number;
  unitName: string | null;
};

type EshopOrder = {
  id: string;
  refNo: string | null;
  ecomOrderNo: string | null;
  channelName: string | null;
  orderStatus: number | null;
  partnerOrderStatus: string | null;
  paymentMethod: string | null;
  shippingPartner: string | null;
  deliveryCode: string | null;
  totalRevenue: number;
  refDate: string | null;
  prepareDueTime: string | null;
  completeDate: string | null;
  daTruTonKhoLuc: string | null;
  items: EshopOrderItem[];
};

type SyncState = {
  lastSyncAt: string | null;
  lastSyncOk: boolean | null;
  lastMessage: string | null;
  lastCount: number;
  agentUrl: string | null;
  agentLastOkAt: string | null;
  lastRunVia: string | null;
} | null;

type DongNhuCauIn = {
  maQR: string;
  ten: string;
  soCanIn: number;
  tonKho: number;
  thieu: number;
  chiTietSku: string[];
};

type NhuCauIn = {
  dong: DongNhuCauIn[];
  skuLa: Array<{ skuCode: string; itemName: string; soLuong: number }>;
};

type ApiResponse<T> = { status?: string; data?: T; message?: string };

const LOP_THE = 'rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#111827]';
const LOP_NHAP =
  'h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900';
const LOP_NUT =
  'inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50';

/** Trạng thái do sàn (TikTok Shop/Shopee) trả về — dịch những giá trị hay gặp, còn lại giữ nguyên. */
const NHAN_TRANG_THAI_SAN: Record<string, string> = {
  UNPAID: 'Chưa thanh toán',
  AWAITING_SHIPMENT: 'Chờ đóng gói',
  AWAITING_COLLECTION: 'Chờ lấy hàng',
  IN_TRANSIT: 'Đang giao',
  DELIVERED: 'Đã giao',
  COMPLETED: 'Hoàn tất',
  CANCELLED: 'Đã hủy',
  CANCEL: 'Đã hủy',
};

function ngayYYYYMMDD(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function dinhDangNgay(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function dinhDangTien(so: number) {
  return so.toLocaleString('vi-VN', { maximumFractionDigits: 0 });
}

function thongBao(message: string, type: 'success' | 'error' | 'info') {
  window.dispatchEvent(new CustomEvent('appToast', { detail: { message, type } }));
}

/** Các khoảng thời gian dựng sẵn — mặc định 24 giờ qua (VD 12h hôm qua → 12h hôm nay). */
const KHOANG_GIO: Record<string, { nhan: string; gio: number }> = {
  '24h': { nhan: '24 giờ qua', gio: 24 },
  '3d': { nhan: '3 ngày qua', gio: 72 },
  '7d': { nhan: '7 ngày qua', gio: 168 },
};

export default function EshopTab() {
  const homNay = useMemo(() => new Date(), []);
  const [khoang, setKhoang] = useState<string>('24h');
  const [tuNgay, setTuNgay] = useState(() => ngayYYYYMMDD(new Date(homNay.getTime() - 86400000)));
  const [denNgay, setDenNgay] = useState(() => ngayYYYYMMDD(homNay));

  const [orders, setOrders] = useState<EshopOrder[]>([]);
  const [syncState, setSyncState] = useState<SyncState>(null);
  const [dangTai, setDangTai] = useState(true);
  const [dangDongBo, setDangDongBo] = useState(false);
  const [dangTruKho, setDangTruKho] = useState(false);
  const [dangGom, setDangGom] = useState(false);
  const [daChon, setDaChon] = useState<Set<string>>(new Set());
  const [nhuCau, setNhuCau] = useState<NhuCauIn | null>(null);

  const [agentUrl, setAgentUrl] = useState('');
  const [dangKiemTraAgent, setDangKiemTraAgent] = useState(false);

  /**
   * Khoảng dựng sẵn tính lùi từ thời điểm hiện tại (24 giờ qua = đúng giờ này hôm qua tới bây giờ).
   * Chế độ "Tùy chọn" thì lấy trọn ngày theo giờ địa phương.
   */
  const khoangNgay = useCallback(() => {
    const preset = KHOANG_GIO[khoang];
    if (preset) {
      const den = new Date();
      return {
        tuNgay: new Date(den.getTime() - preset.gio * 3600000).toISOString(),
        denNgay: den.toISOString(),
      };
    }
    return {
      tuNgay: new Date(`${tuNgay}T00:00:00`).toISOString(),
      denNgay: new Date(`${denNgay}T23:59:59`).toISOString(),
    };
  }, [khoang, tuNgay, denNgay]);

  const taiDon = useCallback(async () => {
    setDangTai(true);
    try {
      const { tuNgay: tu, denNgay: den } = khoangNgay();
      const res = await fetch(`/api/eshop/orders?tuNgay=${encodeURIComponent(tu)}&denNgay=${encodeURIComponent(den)}`);
      const data = (await res.json()) as ApiResponse<{ orders: EshopOrder[]; syncState: SyncState }>;
      if (data.status === 'success' && data.data) {
        setOrders(data.data.orders);
        setSyncState(data.data.syncState);
        setAgentUrl(data.data.syncState?.agentUrl || '');
      } else {
        thongBao(data.message || 'Không tải được danh sách đơn.', 'error');
      }
    } catch {
      thongBao('Lỗi kết nối máy chủ.', 'error');
    } finally {
      setDangTai(false);
    }
  }, [khoangNgay]);

  useEffect(() => {
    // queueMicrotask: tránh setState đồng bộ ngay trong thân effect (quy ước dùng chung với các tab khác)
    queueMicrotask(() => {
      void taiDon();
    });
  }, [taiDon]);

  const dongBo = async () => {
    setDangDongBo(true);
    try {
      const res = await fetch('/api/eshop/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(khoangNgay()),
      });
      const data = (await res.json()) as ApiResponse<{ soDon: number; tonKho: { boQua: string[] } }>;
      thongBao(data.message || 'Đã đồng bộ.', data.status === 'success' ? 'success' : 'error');
      if (data.data?.tonKho?.boQua?.length) {
        thongBao(`${data.data.tonKho.boQua.length} dòng hàng chưa trừ được kho vì SKU chưa khai báo.`, 'info');
      }
      await taiDon();
    } catch {
      thongBao('Lỗi kết nối máy chủ.', 'error');
    } finally {
      setDangDongBo(false);
    }
  };

  const truTonKho = async () => {
    setDangTruKho(true);
    try {
      const res = await fetch('/api/eshop/stock', { method: 'POST' });
      const data = (await res.json()) as ApiResponse<{ boQua: string[] }>;
      thongBao(data.message || 'Đã trừ tồn kho.', data.status === 'success' ? 'success' : 'error');
      if (data.data?.boQua?.length) {
        thongBao(`${data.data.boQua.length} dòng hàng bị bỏ qua vì chưa khai báo SKU.`, 'info');
      }
      await taiDon();
    } catch {
      thongBao('Lỗi kết nối máy chủ.', 'error');
    } finally {
      setDangTruKho(false);
    }
  };

  const gomNhuCau = async () => {
    setDangGom(true);
    try {
      const res = await fetch('/api/eshop/demand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds: [...daChon] }),
      });
      const data = (await res.json()) as ApiResponse<NhuCauIn>;
      if (data.status === 'success' && data.data) setNhuCau(data.data);
      else thongBao(data.message || 'Không gom được nhu cầu in.', 'error');
    } catch {
      thongBao('Lỗi kết nối máy chủ.', 'error');
    } finally {
      setDangGom(false);
    }
  };

  const luuDiaChiMayChinh = async () => {
    try {
      const res = await fetch('/api/eshop/agent', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentUrl: agentUrl.trim() || null }),
      });
      const data = (await res.json()) as ApiResponse<unknown>;
      thongBao(data.message || 'Đã lưu.', data.status === 'success' ? 'success' : 'error');
      await taiDon();
    } catch {
      thongBao('Lỗi kết nối máy chủ.', 'error');
    }
  };

  const kiemTraMayChinh = async () => {
    setDangKiemTraAgent(true);
    try {
      const res = await fetch('/api/eshop/agent', { method: 'POST' });
      const data = (await res.json()) as ApiResponse<{ ok: boolean; message: string }>;
      if (data.data) thongBao(data.data.message, data.data.ok ? 'success' : 'error');
      else thongBao(data.message || 'Không kiểm tra được.', 'error');
    } catch {
      thongBao('Lỗi kết nối máy chủ.', 'error');
    } finally {
      setDangKiemTraAgent(false);
    }
  };

  const doiChon = (id: string) => {
    setDaChon((cu) => {
      const moi = new Set(cu);
      if (moi.has(id)) moi.delete(id);
      else moi.add(id);
      return moi;
    });
  };

  const chonTatCa = () => {
    setDaChon((cu) => (cu.size === orders.length ? new Set() : new Set(orders.map((o) => o.id))));
  };

  return (
    <div className="space-y-4">
      {/* Thanh điều khiển: khoảng ngày + các hành động */}
      <div className={`${LOP_THE} p-4`}>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-500">Khoảng thời gian</label>
            <select value={khoang} onChange={(e) => setKhoang(e.target.value)} className={LOP_NHAP}>
              {Object.entries(KHOANG_GIO).map(([key, { nhan }]) => (
                <option key={key} value={key}>
                  {nhan}
                </option>
              ))}
              <option value="tuy-chon">Tùy chọn ngày</option>
            </select>
          </div>

          {!KHOANG_GIO[khoang] && (
            <>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-500">Từ ngày</label>
                <input type="date" value={tuNgay} onChange={(e) => setTuNgay(e.target.value)} className={LOP_NHAP} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-500">Đến ngày</label>
                <input type="date" value={denNgay} onChange={(e) => setDenNgay(e.target.value)} className={LOP_NHAP} />
              </div>
            </>
          )}

          <button
            type="button"
            onClick={dongBo}
            disabled={dangDongBo}
            title="Kéo đơn từ MISA về và trừ tồn kho luôn"
            className={`${LOP_NUT} bg-indigo-600 text-white hover:bg-indigo-500`}
          >
            {dangDongBo ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Đồng bộ + trừ kho
          </button>

          <button
            type="button"
            onClick={truTonKho}
            disabled={dangTruKho}
            title="Chạy bù phần trừ tồn kho cho các đơn đã đồng bộ mà chưa trừ"
            className={`${LOP_NUT} border border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800`}
          >
            {dangTruKho ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageMinus className="h-4 w-4" />}
            Trừ kho bù
          </button>

          <button
            type="button"
            onClick={gomNhuCau}
            disabled={dangGom || daChon.size === 0}
            className={`${LOP_NUT} border border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800`}
          >
            {dangGom ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
            Gom nhu cầu in ({daChon.size})
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
          {syncState?.lastSyncOk === false ? (
            <XCircle className="h-4 w-4 text-rose-500" />
          ) : syncState?.lastSyncOk ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          ) : null}
          <span>
            {syncState?.lastSyncAt
              ? `Đồng bộ gần nhất: ${new Date(syncState.lastSyncAt).toLocaleString('vi-VN')} — ${syncState.lastMessage}`
              : 'Chưa đồng bộ lần nào. Bấm “Đồng bộ + trừ kho” để kéo đơn về.'}
          </span>
          <span className="ml-auto">Tự động chạy 00:00 và 12:00 hằng ngày.</span>
        </div>
      </div>

      {/* Định tuyến request MISA qua máy chính — MISA chỉ cho 1 phiên đăng nhập cùng lúc */}
      <div className={`${LOP_THE} p-4`}>
        <div className="mb-2 flex items-center gap-2">
          <MonitorSmartphone className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-bold">Gọi MISA qua máy chính</h3>
          {syncState?.lastRunVia && (
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                syncState.lastRunVia === 'agent'
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400'
              }`}
            >
              Lần gần nhất: {syncState.lastRunVia === 'agent' ? 'qua máy chính' : 'server gọi thẳng'}
            </span>
          )}
        </div>
        <p className="mb-3 text-xs text-slate-500">
          MISA eShop chỉ cho 1 phiên đăng nhập. Khai địa chỉ script agent trên máy chính để server nhờ máy đó gọi hộ,
          nhờ vậy phiên eShop của bạn không bị đá ra. Máy chính không phản hồi thì server tự gọi thẳng — đơn vẫn về
          nhưng bạn sẽ phải dán token mới.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={agentUrl}
            onChange={(e) => setAgentUrl(e.target.value)}
            placeholder="http://192.168.1.5:39100 (để trống = server gọi thẳng)"
            className={`${LOP_NHAP} min-w-[320px] flex-1`}
          />
          <button
            type="button"
            onClick={luuDiaChiMayChinh}
            className={`${LOP_NUT} border border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800`}
          >
            Lưu địa chỉ
          </button>
          <button
            type="button"
            onClick={kiemTraMayChinh}
            disabled={dangKiemTraAgent}
            className={`${LOP_NUT} border border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800`}
          >
            {dangKiemTraAgent ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Kiểm tra máy chính
          </button>
        </div>
        {syncState?.agentLastOkAt && (
          <p className="mt-2 text-xs text-slate-500">
            Lần cuối gọi qua máy chính thành công: {new Date(syncState.agentLastOkAt).toLocaleString('vi-VN')}
          </p>
        )}
      </div>

      {/* Bảng nhu cầu in — chỉ hiện sau khi bấm gom */}
      {nhuCau && (
        <div className={`${LOP_THE} p-4`}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold">Nhu cầu in từ {daChon.size} đơn đã chọn</h3>
            <button type="button" onClick={() => setNhuCau(null)} className="text-xs text-slate-500 hover:underline">
              Đóng
            </button>
          </div>

          {nhuCau.dong.length === 0 ? (
            <p className="text-sm text-slate-500">Không có dòng hàng nào khớp hàng hóa cửa hàng.</p>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2">Mã hàng</th>
                  <th className="py-2">Tên</th>
                  <th className="py-2 text-right">Cần</th>
                  <th className="py-2 text-right">Tồn</th>
                  <th className="py-2 text-right">Thiếu (phải in)</th>
                  <th className="py-2">Chi tiết SKU</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {nhuCau.dong.map((d) => (
                  <tr key={d.maQR}>
                    <td className="py-2 font-mono text-xs">{d.maQR}</td>
                    <td className="py-2">{d.ten}</td>
                    <td className="py-2 text-right font-semibold">{d.soCanIn}</td>
                    <td className="py-2 text-right">{d.tonKho}</td>
                    <td className={`py-2 text-right font-bold ${d.thieu > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {d.thieu}
                    </td>
                    <td className="py-2 text-xs text-slate-500">{d.chiTietSku.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {nhuCau.skuLa.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs dark:border-amber-700 dark:bg-amber-950/40">
              <div className="mb-1 flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                {nhuCau.skuLa.length} SKU chưa có trong Hàng hóa cửa hàng
              </div>
              <ul className="list-inside list-disc text-amber-800 dark:text-amber-300">
                {nhuCau.skuLa.map((s, i) => (
                  <li key={`${s.skuCode}-${i}`}>
                    <span className="font-mono">{s.skuCode}</span> — {s.itemName} (x{s.soLuong})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Danh sách đơn */}
      <div className={`${LOP_THE} overflow-hidden`}>
        {dangTai ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Đang tải đơn...
          </div>
        ) : orders.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            Chưa có đơn nào trong khoảng thời gian này. Bấm “Đồng bộ + trừ kho” để kéo về.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-900/60">
                <tr>
                  <th className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={orders.length > 0 && daChon.size === orders.length}
                      onChange={chonTatCa}
                      aria-label="Chọn tất cả đơn"
                    />
                  </th>
                  <th className="px-3 py-2">Mã đơn</th>
                  <th className="px-3 py-2">Sàn</th>
                  <th className="px-3 py-2">Ngày</th>
                  <th className="px-3 py-2">Hạn chuẩn bị</th>
                  <th className="px-3 py-2">Trạng thái</th>
                  <th className="px-3 py-2">Vận đơn</th>
                  <th className="px-3 py-2 text-right">Doanh thu</th>
                  <th className="px-3 py-2">Hàng hóa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {orders.map((don) => (
                  <tr key={don.id} className={daChon.has(don.id) ? 'bg-indigo-50 dark:bg-indigo-950/30' : ''}>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={daChon.has(don.id)}
                        onChange={() => doiChon(don.id)}
                        aria-label={`Chọn đơn ${don.refNo || don.id}`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-semibold">{don.refNo || '—'}</div>
                      <div className="font-mono text-[11px] text-slate-500">{don.ecomOrderNo}</div>
                    </td>
                    <td className="px-3 py-2">{don.channelName || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{dinhDangNgay(don.refDate)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{dinhDangNgay(don.prepareDueTime)}</td>
                    <td className="px-3 py-2">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800">
                        {don.partnerOrderStatus
                          ? NHAN_TRANG_THAI_SAN[don.partnerOrderStatus] || don.partnerOrderStatus
                          : `Mã ${don.orderStatus ?? '?'}`}
                      </span>
                      {don.daTruTonKhoLuc && (
                        <span className="ml-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                          đã trừ kho
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div>{don.shippingPartner || '—'}</div>
                      <div className="font-mono text-[11px] text-slate-500">{don.deliveryCode}</div>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">{dinhDangTien(don.totalRevenue)}</td>
                    <td className="px-3 py-2">
                      <ul className="space-y-0.5">
                        {don.items.map((item) => (
                          <li key={item.id} className="text-xs">
                            <span className="font-mono">{item.skuCode || '(không SKU)'}</span>
                            <span className="text-slate-500"> x{item.quantity}</span>
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
