'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Boxes,
  ScanBarcode,
  Plus,
  Trash2,
  Printer as PrinterIcon,
  Tag,
  Play,
  Check,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  Pencil,
  X,
} from 'lucide-react';
import {
  chiaLuotInTheoMay,
  dinhDangThoiLuong,
  canBuBaoNhieu,
  tongSoLoi,
  soHangTot,
} from '@/utils/bulk-production';

type BulkRun = {
  id: string;
  printerId: string | null;
  printerName: string;
  seq: number;
  peiIndex: number;
  quantity: number;
  /** Số con lỗi ghi lúc quẹt "in xong". */
  defectQuantity: number;
  /** Lượt in bù cho hàng lỗi, không nằm trong kế hoạch chia ban đầu. */
  isRework: boolean;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
};

type BulkOrder = {
  id: string;
  orderCode: string | null;
  customerName: string | null;
  productName: string;
  totalQuantity: number;
  perSheetQty: number;
  note: string | null;
  status: string;
  createdAt: string;
  runs: BulkRun[];
};

type Printer = { id: string; name: string; model?: string | null };

const notify = (message: string, type: 'success' | 'error' | 'info' = 'error') => {
  window.dispatchEvent(new CustomEvent('appToast', { detail: { message, type } }));
};

/** "13/08 14:32" — bảng có nhiều dòng nên cắt bớt năm và giây cho đỡ rối. */
const dinhDangMoc = (iso: string | null) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/** Hàng tốt đã ra — lỗi bị trừ ngay, để thanh tiến độ không nói dối. */
const soConDaXong = (runs: BulkRun[]) => soHangTot(runs);

/** Sức chứa mâm của từng máy theo đúng thứ tự chọn: máy khai riêng thì lấy số riêng. */
const sucChuaTheoMay = (
  ids: string[],
  limits: Record<string, string>,
  moiMamChung: number
): number[] =>
  ids.map((id) => {
    const rieng = Number(limits[id]);
    return Number.isFinite(rieng) && rieng > 0 ? Math.floor(rieng) : moiMamChung;
  });

/** Chọn máy + khai số con/mâm riêng cho máy đó. Dùng chung cho form tạo và form chia lại. */
function MayPicker({
  printers,
  selectedIds,
  limits,
  moiMamChung,
  onToggle,
  onLimit,
}: {
  printers: Printer[];
  selectedIds: string[];
  limits: Record<string, string>;
  moiMamChung: string;
  onToggle: (id: string) => void;
  onLimit: (id: string, value: string) => void;
}) {
  if (printers.length === 0) {
    return <div className="text-xs text-slate-500 py-3">Chưa có máy in nào trong hệ thống</div>;
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
      {printers.map((p) => {
        const idx = selectedIds.indexOf(p.id);
        const chon = idx >= 0;
        return (
          <div
            key={p.id}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-all ${
              chon
                ? 'bg-indigo-500/10 border-indigo-500'
                : 'bg-slate-100 dark:bg-slate-900 border-slate-300 dark:border-slate-700'
            }`}
          >
            <button
              type="button"
              onClick={() => onToggle(p.id)}
              className={`flex items-center gap-2 flex-1 min-w-0 text-left ${
                chon ? 'text-indigo-600 dark:text-indigo-300' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <span
                className={`w-5 h-5 shrink-0 rounded-full text-[10px] font-bold flex items-center justify-center ${
                  chon ? 'bg-indigo-600 text-white' : 'bg-slate-300 dark:bg-slate-700 text-slate-500'
                }`}
              >
                {chon ? idx + 1 : '·'}
              </span>
              <span className="truncate">{p.name}</span>
            </button>
            {chon && (
              <div className="flex items-center gap-1 shrink-0">
                <input
                  type="number"
                  min={1}
                  value={limits[p.id] ?? ''}
                  onChange={(e) => onLimit(p.id, e.target.value)}
                  placeholder={moiMamChung || '—'}
                  title="Số con mỗi mâm PEI của riêng máy này (bỏ trống = dùng số chung)"
                  className="w-16 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs text-slate-900 dark:text-white"
                />
                <span className="text-[10px] text-slate-500">con/mâm</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function BulkProductionTab() {
  const [orders, setOrders] = useState<BulkOrder[]>([]);
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [loading, setLoading] = useState(true);
  const [scannedId, setScannedId] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [collapsedPrinters, setCollapsedPrinters] = useState<string[]>([]);

  // Form tạo đơn
  const [form, setForm] = useState({
    orderCode: '',
    customerName: '',
    productName: '',
    totalQuantity: '',
    perSheetQty: '',
    note: '',
  });
  // Thứ tự trong mảng = thứ tự chia lượt, nên giữ nguyên trình tự người dùng bấm chọn
  const [selectedPrinterIds, setSelectedPrinterIds] = useState<string[]>([]);
  // printerId → số con mỗi mâm của riêng máy đó; bỏ trống là dùng số chung của đơn.
  const [printerLimits, setPrinterLimits] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);

  // Sửa đơn: chỉ phần thông tin, KHÔNG đụng tới số lượng / máy in vì lượt đã chia
  // xong và đã in tem mã vạch — muốn chia lại thì xóa đơn rồi tạo lại.
  const [editing, setEditing] = useState<BulkOrder | null>(null);
  const [editForm, setEditForm] = useState({
    orderCode: '',
    customerName: '',
    productName: '',
    note: '',
    status: 'pending',
  });
  const [saving, setSaving] = useState(false);

  // Khối "chia lại lượt in" trong form sửa — tách riêng vì nó phá hủy dữ liệu cũ.
  const [chiaLai, setChiaLai] = useState(false);
  const [editSplit, setEditSplit] = useState({ totalQuantity: '', perSheetQty: '' });
  const [editPrinterIds, setEditPrinterIds] = useState<string[]>([]);
  const [editLimits, setEditLimits] = useState<Record<string, string>>({});

  // Lượt đang chờ quẹt tem máy in để bắt đầu (bước 2 của check-in).
  const [choMay, setChoMay] = useState<{ run: BulkRun; productName: string } | null>(null);
  // Lượt vừa quẹt xong, đang hỏi mâm này có miếng lỗi nào không.
  const [hoiLoi, setHoiLoi] = useState<{ run: BulkRun; productName: string } | null>(null);
  const [soLoi, setSoLoi] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [orderRes, printerRes] = await Promise.all([
        fetch('/api/bulk-orders'),
        fetch('/api/printers'),
      ]);
      const orderData = await orderRes.json();
      const printerData = await printerRes.json();
      if (orderData.status === 'success') {
        setOrders(orderData.data);
        setSelectedOrderId((hienTai) =>
          hienTai && orderData.data.some((o: BulkOrder) => o.id === hienTai)
            ? hienTai
            : orderData.data[0]?.id ?? null
        );
      }
      if (printerData.status === 'success') setPrinters(printerData.data);
    } catch {
      notify('Không tải được dữ liệu sản xuất SLL');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      fetchData();
    });
  }, [fetchData]);

  // ── Quẹt mã check-in / check-out ──
  //
  // Bắt đầu in là **2 bước**: quẹt mã lượt rồi quẹt tem máy in. Máy chạy thật hay
  // khác máy được chia lúc tạo đơn (máy kẹt nhựa, dồn mâm sang máy đang rảnh), nên
  // máy nào được quẹt thì lượt gán về đúng máy đó. Chốt in xong chỉ cần mã lượt.
  const guiQuetMa = useCallback(
    async (runId: string, printerId?: string, defectQuantity?: number) => {
      try {
        const res = await fetch('/api/bulk-runs/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: runId,
            ...(printerId ? { printerId } : {}),
            ...(defectQuantity ? { defectQuantity } : {}),
          }),
        });
        const data = await res.json();
        if (data.status === 'success') {
          notify(data.message, 'success');
          setSelectedOrderId(data.data.run.orderId);
          setChoMay(null);
          setHoiLoi(null);
          setSoLoi('');
          fetchData();
        } else {
          notify(data.message || 'Lỗi khi quẹt mã');
        }
      } catch {
        notify('Lỗi kết nối khi quẹt mã');
      }
    },
    [fetchData]
  );

  const timLuot = useCallback(
    (ma: string) => {
      for (const order of orders) {
        const run = order.runs.find((r) => r.id === ma);
        if (run) return { run, productName: order.productName };
      }
      return null;
    },
    [orders]
  );

  const xuLyQuetMa = useCallback(
    async (code: string) => {
      const ma = code.trim();
      if (!ma) return;
      setScannedId('');

      // Bước 2: đang đợi tem máy in.
      if (choMay) {
        const chuanHoa = ma.replace(/-/g, '').toUpperCase();
        const may = printers.find((p) => p.id.replace(/-/g, '').toUpperCase() === chuanHoa);
        if (!may) {
          notify(`"${ma}" không phải mã máy in. Quẹt tem máy để bắt đầu, hoặc bấm Hủy.`);
          return;
        }
        await guiQuetMa(choMay.run.id, may.id);
        return;
      }

      // Bước 1: mã lượt.
      const found = timLuot(ma);
      if (found && found.run.status === 'pending') {
        setChoMay(found);
        notify(`Lượt PEI ${found.run.peiIndex} (${found.run.quantity} con) — quẹt tiếp tem MÁY IN`, 'info');
        return;
      }

      // Lượt đang in: hỏi số miếng lỗi trước khi chốt xong.
      if (found && found.run.status === 'printing') {
        setHoiLoi(found);
        setSoLoi('');
        return;
      }

      // Mã lạ hoặc lượt đã xong — để backend trả lời cho đúng câu.
      await guiQuetMa(ma);
    },
    [choMay, guiQuetMa, printers, timLuot]
  );

  // Máy quét HID toàn cục: page.tsx bắn event này khi đang ở tab Sản xuất và mã toàn số
  useEffect(() => {
    const handler = (event: Event) => {
      const code = (event as CustomEvent<string>).detail;
      if (code) xuLyQuetMa(code);
    };
    window.addEventListener('productionNumericScanned', handler);
    window.addEventListener('productionCodeScanned', handler);
    return () => {
      window.removeEventListener('productionNumericScanned', handler);
      window.removeEventListener('productionCodeScanned', handler);
    };
  }, [xuLyQuetMa]);

  // ── Tạo đơn ──
  const previewLuots = useMemo(() => {
    const tong = Number(form.totalQuantity);
    const moiMam = Number(form.perSheetQty);
    if (!tong || !moiMam || selectedPrinterIds.length === 0) return null;
    const luots = chiaLuotInTheoMay(tong, sucChuaTheoMay(selectedPrinterIds, printerLimits, moiMam));
    if (luots.length === 0) return null;
    const theoMay = selectedPrinterIds.map((id, idx) => ({
      ten: printers.find((p) => p.id === id)?.name ?? id,
      soLuot: luots.filter((l) => l.printerIndex === idx).length,
      moiMam: sucChuaTheoMay(selectedPrinterIds, printerLimits, moiMam)[idx],
    }));
    return { soLuot: luots.length, theoMay, duCuoi: luots[luots.length - 1].quantity };
  }, [form.totalQuantity, form.perSheetQty, selectedPrinterIds, printerLimits, printers]);

  const previewChiaLai = useMemo(() => {
    const tong = Number(editSplit.totalQuantity);
    const moiMam = Number(editSplit.perSheetQty);
    if (!tong || !moiMam || editPrinterIds.length === 0) return null;
    const sucChua = sucChuaTheoMay(editPrinterIds, editLimits, moiMam);
    const luots = chiaLuotInTheoMay(tong, sucChua);
    if (luots.length === 0) return null;
    return {
      soLuot: luots.length,
      theoMay: editPrinterIds.map((id, idx) => ({
        ten: printers.find((p) => p.id === id)?.name ?? id,
        soLuot: luots.filter((l) => l.printerIndex === idx).length,
        moiMam: sucChua[idx],
      })),
    };
  }, [editSplit, editPrinterIds, editLimits, printers]);

  const toggleMay = (id: string) => {
    setSelectedPrinterIds((cu) => (cu.includes(id) ? cu.filter((x) => x !== id) : [...cu, id]));
  };

  const handleCreate = async () => {
    if (!form.productName.trim()) return notify('Vui lòng nhập tên sản phẩm');
    if (!Number(form.totalQuantity)) return notify('Vui lòng nhập tổng số con');
    if (!Number(form.perSheetQty)) return notify('Vui lòng nhập số con mỗi mâm PEI');
    if (selectedPrinterIds.length === 0) return notify('Vui lòng chọn ít nhất 1 máy in');

    setCreating(true);
    try {
      const res = await fetch('/api/bulk-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          totalQuantity: Number(form.totalQuantity),
          perSheetQty: Number(form.perSheetQty),
          printerIds: selectedPrinterIds,
          printerLimits: Object.fromEntries(
            selectedPrinterIds
              .filter((id) => Number(printerLimits[id]) > 0)
              .map((id) => [id, Number(printerLimits[id])])
          ),
        }),
      });
      const data = await res.json();
      if (data.status === 'success') {
        notify(data.message, 'success');
        setForm({ orderCode: '', customerName: '', productName: '', totalQuantity: '', perSheetQty: '', note: '' });
        setSelectedPrinterIds([]);
        setPrinterLimits({});
        setShowForm(false);
        await fetchData();
        setSelectedOrderId(data.data.id);
      } else {
        notify(data.message || 'Lỗi tạo đơn');
      }
    } catch {
      notify('Lỗi kết nối khi tạo đơn');
    }
    setCreating(false);
  };

  // ── Sửa đơn ──
  const batDauSua = (order: BulkOrder) => {
    setEditing(order);
    setShowForm(false);
    setChiaLai(false);
    setEditSplit({
      totalQuantity: String(order.totalQuantity),
      perSheetQty: String(order.perSheetQty),
    });

    // Thứ tự máy và sức chứa mâm không được lưu riêng ở DB, nhưng suy lại được từ
    // chính các lượt: máy xuất hiện lần đầu ở đâu là thứ tự đó, lượt đầy nhất của
    // máy chính là số con/mâm của nó (lượt cuối có thể lẻ nên phải lấy max).
    const thuTu: string[] = [];
    const sucChua: Record<string, string> = {};
    for (const run of order.runs) {
      if (!run.printerId) continue;
      if (!thuTu.includes(run.printerId)) thuTu.push(run.printerId);
      const cu = Number(sucChua[run.printerId] || 0);
      if (run.quantity > cu) sucChua[run.printerId] = String(run.quantity);
    }
    setEditPrinterIds(thuTu);
    setEditLimits(sucChua);

    setEditForm({
      orderCode: order.orderCode || '',
      customerName: order.customerName || '',
      productName: order.productName,
      note: order.note || '',
      status: order.status,
    });
  };

  const handleUpdate = async () => {
    if (!editing) return;
    if (!editForm.productName.trim()) return notify('Vui lòng nhập tên sản phẩm');

    setSaving(true);
    try {
      const res = await fetch(`/api/bulk-orders/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderCode: editForm.orderCode.trim(),
          customerName: editForm.customerName.trim() || 'Khách lẻ',
          productName: editForm.productName.trim(),
          note: editForm.note.trim() || null,
          status: editForm.status,
        }),
      });
      const data = await res.json();
      if (data.status === 'success') {
        notify('Đã lưu thay đổi', 'success');
        setEditing(null);
        fetchData();
      } else notify(data.message || 'Lỗi lưu đơn');
    } catch {
      notify('Lỗi kết nối khi lưu đơn');
    }
    setSaving(false);
  };

  const handleChiaLai = () => {
    if (!editing) return;
    const tong = Number(editSplit.totalQuantity);
    const moiMam = Number(editSplit.perSheetQty);
    if (!tong) return notify('Vui lòng nhập tổng số con');
    if (!moiMam) return notify('Vui lòng nhập số con mỗi mâm PEI');
    if (editPrinterIds.length === 0) return notify('Vui lòng chọn ít nhất 1 máy in');

    const daChay = editing.runs.filter((r) => r.status !== 'pending').length;
    window.dispatchEvent(
      new CustomEvent('appConfirm', {
        detail: {
          title: 'Chia lại lượt in',
          message:
            `Toàn bộ ${editing.runs.length} lượt hiện tại sẽ bị xóa và cấp mã vạch mới. ` +
            `Tem đã in ra thành rác, phải in lại` +
            (daChay > 0 ? ` — kể cả ${daChay} lượt đã quẹt (mốc giờ mất hết).` : '.'),
          onConfirm: async () => {
            setSaving(true);
            try {
              const res = await fetch(`/api/bulk-orders/${editing.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  totalQuantity: tong,
                  perSheetQty: moiMam,
                  printerIds: editPrinterIds,
                  printerLimits: Object.fromEntries(
                    editPrinterIds
                      .filter((id) => Number(editLimits[id]) > 0)
                      .map((id) => [id, Number(editLimits[id])])
                  ),
                }),
              });
              const data = await res.json();
              if (data.status === 'success') {
                notify(data.message || 'Đã chia lại lượt in', 'success');
                setEditing(null);
                fetchData();
              } else notify(data.message || 'Lỗi chia lại lượt in');
            } catch {
              notify('Lỗi kết nối khi chia lại lượt in');
            }
            setSaving(false);
          },
        },
      })
    );
  };

  // ── In miếng lỗi: sinh lượt bù cho toàn bộ số lỗi chưa bù, rồi in tem luôn ──
  const handleInMiengLoi = async (order: BulkOrder) => {
    const canBu = canBuBaoNhieu(order.runs);
    if (canBu <= 0) return notify('Đơn này chưa có miếng lỗi nào cần in bù');

    const idCu = new Set(order.runs.map((r) => r.id));
    try {
      const res = await fetch(`/api/bulk-orders/${order.id}/rework`, { method: 'POST' });
      const data = await res.json();
      if (data.status !== 'success') return notify(data.message || 'Lỗi tạo lượt in bù');

      notify(data.message, 'success');
      const luotMoi: BulkRun[] = (data.data.runs as BulkRun[]).filter((r) => !idCu.has(r.id));
      await inTem(luotMoi, data.data as BulkOrder);
      fetchData();
    } catch {
      notify('Lỗi kết nối khi tạo lượt in bù');
    }
  };

  const handleDeleteOrder = (order: BulkOrder) => {
    window.dispatchEvent(
      new CustomEvent('appConfirm', {
        detail: {
          title: 'Xóa đơn sản xuất SLL',
          message: `Bạn có chắc muốn xóa đơn "${order.productName}" cùng ${order.runs.length} lượt in? Toàn bộ mốc check-in/check-out đã ghi sẽ mất.`,
          onConfirm: async () => {
            const res = await fetch(`/api/bulk-orders/${order.id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.status === 'success') {
              notify('Đã xóa đơn', 'success');
              fetchData();
            } else notify(data.message || 'Lỗi xóa đơn');
          },
        },
      })
    );
  };

  // ── Sửa tay 1 lượt (quẹt nhầm / máy hỏng) ──
  const capNhatLuot = async (run: BulkRun, body: Record<string, unknown>, thongBao: string) => {
    const res = await fetch(`/api/bulk-runs/${run.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.status === 'success') {
      notify(thongBao, 'success');
      fetchData();
    } else notify(data.message || 'Lỗi cập nhật lượt in');
  };

  // ── In tem lượt ──
  const inTem = async (runs: BulkRun[], order: BulkOrder) => {
    if (runs.length === 0) return;
    const jobs = runs.map((r) => ({
      qrCode: r.id,
      labelData: {
        line1: r.id,
        line2: order.productName,
        line3: `${r.printerName} PEI ${r.peiIndex} - ${r.quantity} con`,
      },
    }));
    try {
      const res = await fetch('/api/print-jobs/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobs }),
      });
      const data = await res.json();
      if (data.status === 'success') notify(`Đã gửi lệnh in ${jobs.length} tem`, 'success');
      else notify(data.message || 'Lỗi in tem');
    } catch {
      notify('Lỗi khi gửi lệnh in');
    }
  };

  const selectedOrder = orders.find((o) => o.id === selectedOrderId) || null;

  // Gom lượt theo máy, giữ thứ tự máy xuất hiện lần đầu (= thứ tự chọn lúc tạo đơn)
  const runsTheoMay = useMemo(() => {
    if (!selectedOrder) return [];
    const nhom = new Map<string, { printerName: string; runs: BulkRun[] }>();
    for (const run of selectedOrder.runs) {
      const key = run.printerId || run.printerName;
      if (!nhom.has(key)) nhom.set(key, { printerName: run.printerName, runs: [] });
      nhom.get(key)!.runs.push(run);
    }
    return Array.from(nhom.entries()).map(([key, v]) => ({ key, ...v }));
  }, [selectedOrder]);

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Boxes className="text-indigo-400" />
          Sản Xuất Số Lượng Lớn (theo lượt PEI)
        </h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-indigo-500/20"
        >
          <Plus size={16} /> {showForm ? 'Đóng form' : 'Tạo đơn SLL'}
        </button>
      </div>

      {/* Ô quẹt mã check-in / check-out */}
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
          Quẹt mã lượt in — lần 1 là <span className="text-amber-500 font-semibold">bắt đầu in</span>{' '}
          (quẹt tiếp tem máy in), lần 2 là <span className="text-emerald-500 font-semibold">in xong</span>
        </label>

        {choMay && (
          <div className="mb-3 flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
            <PrinterIcon size={18} className="text-amber-500 shrink-0" />
            <div className="text-sm text-amber-600 dark:text-amber-300 flex-1">
              Đang chờ <span className="font-semibold">tem MÁY IN</span> cho lượt PEI{' '}
              {choMay.run.peiIndex} · {choMay.run.quantity} con ({choMay.productName}). Quẹt tem máy
              nào thì lượt được gán về máy đó.
            </div>
            <button
              onClick={() => setChoMay(null)}
              className="text-xs text-slate-500 hover:text-rose-500 shrink-0"
            >
              Hủy
            </button>
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            xuLyQuetMa(scannedId);
          }}
          className="flex gap-2"
        >
          <div className="relative flex-1">
            <ScanBarcode className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <input
              autoFocus
              type="text"
              value={scannedId}
              onChange={(e) => setScannedId(e.target.value)}
              placeholder={choMay ? 'Quẹt tem máy in...' : 'Nhập hoặc quét mã lượt in (VD: 12345678)...'}
              className="w-full bg-slate-50 dark:bg-[#1f2937] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-sm rounded-xl pl-10 pr-4 py-3 focus:outline-hidden focus:border-indigo-500"
            />
          </div>
          <button type="submit" className="px-6 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl">
            Ghi nhận
          </button>
        </form>
      </div>

      {/* Hỏi miếng lỗi khi chốt "in xong" */}
      {hoiLoi && (
        <div className="bg-white dark:bg-[#111827] border border-emerald-500/40 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Mâm {hoiLoi.run.printerName} · PEI {hoiLoi.run.peiIndex} ({hoiLoi.run.quantity} con) —
              có miếng nào lỗi không?
            </h3>
            <button onClick={() => setHoiLoi(null)} className="text-slate-500 hover:text-rose-500">
              <X size={18} />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => guiQuetMa(hoiLoi.run.id)}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl"
            >
              Không lỗi — xong {hoiLoi.run.quantity} con
            </button>

            <div className="flex items-center gap-2 ml-auto">
              <input
                autoFocus
                type="number"
                min={1}
                max={hoiLoi.run.quantity}
                value={soLoi}
                onChange={(e) => setSoLoi(e.target.value)}
                placeholder="Số con lỗi"
                className="w-32 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white"
              />
              <button
                onClick={() => {
                  const n = Math.floor(Number(soLoi));
                  if (!n || n <= 0) return notify('Nhập số con lỗi lớn hơn 0');
                  if (n > hoiLoi.run.quantity)
                    return notify(`Lượt này chỉ có ${hoiLoi.run.quantity} con`);
                  guiQuetMa(hoiLoi.run.id, undefined, n);
                }}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold rounded-xl"
              >
                Ghi nhận lỗi
              </button>
            </div>
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-400">
            Số lỗi bị trừ khỏi hàng tốt của đơn. In bù bằng nút &quot;In miếng lỗi&quot; ở phần chi
            tiết bên dưới.
          </div>
        </div>
      )}

      {/* Form tạo đơn */}
      {showForm && (
        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Thông tin đơn</h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Mã đơn (tùy chọn)</label>
              <input
                value={form.orderCode}
                onChange={(e) => setForm({ ...form, orderCode: e.target.value })}
                placeholder="VD: SLL-001"
                className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Khách hàng</label>
              <input
                value={form.customerName}
                onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                placeholder="Khách lẻ"
                className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Tên sản phẩm *</label>
              <input
                value={form.productName}
                onChange={(e) => setForm({ ...form, productName: e.target.value })}
                placeholder="VD: Móc khóa rồng"
                className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Tổng số con *</label>
              <input
                type="number"
                min={1}
                value={form.totalQuantity}
                onChange={(e) => setForm({ ...form, totalQuantity: e.target.value })}
                placeholder="VD: 5000"
                className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Số con mỗi mâm PEI *</label>
              <input
                type="number"
                min={1}
                value={form.perSheetQty}
                onChange={(e) => setForm({ ...form, perSheetQty: e.target.value })}
                placeholder="VD: 50"
                className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Ghi chú</label>
              <input
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                placeholder="Màu nhựa, yêu cầu riêng..."
                className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-2">
              Chọn máy in chạy đơn này * (số thứ tự = thứ tự nhận lượt · ô bên phải là số
              con/mâm riêng của máy đó, bỏ trống thì dùng số chung ở trên)
            </label>
            <MayPicker
              printers={printers}
              selectedIds={selectedPrinterIds}
              limits={printerLimits}
              moiMamChung={form.perSheetQty}
              onToggle={toggleMay}
              onLimit={(id, value) => setPrinterLimits((cu) => ({ ...cu, [id]: value }))}
            />
          </div>

          {previewLuots && (
            <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-sm text-slate-600 dark:text-slate-300">
              Sẽ chia thành{' '}
              <span className="font-bold text-indigo-600 dark:text-indigo-300">{previewLuots.soLuot} lượt in</span> trên{' '}
              {selectedPrinterIds.length} máy —{' '}
              {previewLuots.theoMay
                .map((m) => `${m.ten}: ${m.soLuot} lượt × ${m.moiMam} con`)
                .join(' · ')}
              {previewLuots.duCuoi !== Number(form.perSheetQty) && (
                <span className="text-amber-500"> (lượt cuối chỉ {previewLuots.duCuoi} con)</span>
              )}
            </div>
          )}

          <button
            onClick={handleCreate}
            disabled={creating}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-indigo-500/20 disabled:opacity-50"
          >
            {creating ? 'Đang tạo...' : 'Tạo đơn & chia lượt'}
          </button>
        </div>
      )}

      {/* Form sửa đơn */}
      {editing && (
        <div className="bg-white dark:bg-[#111827] border border-indigo-500/40 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Sửa đơn — {editing.productName}
            </h3>
            <button onClick={() => setEditing(null)} className="text-slate-500 hover:text-rose-500">
              <X size={18} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Mã đơn</label>
              <input
                value={editForm.orderCode}
                onChange={(e) => setEditForm({ ...editForm, orderCode: e.target.value })}
                placeholder="VD: SLL-001"
                className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Khách hàng</label>
              <input
                value={editForm.customerName}
                onChange={(e) => setEditForm({ ...editForm, customerName: e.target.value })}
                placeholder="Khách lẻ"
                className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Tên sản phẩm *</label>
              <input
                value={editForm.productName}
                onChange={(e) => setEditForm({ ...editForm, productName: e.target.value })}
                className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Ghi chú</label>
              <input
                value={editForm.note}
                onChange={(e) => setEditForm({ ...editForm, note: e.target.value })}
                placeholder="Màu nhựa, yêu cầu riêng..."
                className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Trạng thái</label>
              <select
                value={editForm.status}
                onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white"
              >
                <option value="pending">Chờ in</option>
                <option value="printing">Đang chạy</option>
                <option value="completed">Xong</option>
              </select>
            </div>
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Trạng thái đơn sẽ tự tính lại theo các lượt mỗi khi quẹt mã.
          </div>

          {/* Chia lại lượt: tách khỏi nút Lưu vì nó xóa sạch lượt cũ + mã vạch cũ */}
          <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
            {!chiaLai ? (
              <button
                onClick={() => setChiaLai(true)}
                className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 hover:underline"
              >
                <RotateCcw size={14} /> Đổi số lượng / máy in (chia lại lượt in)
              </button>
            ) : (
              <div className="space-y-3">
                <div className="text-xs text-rose-500 leading-relaxed">
                  Chia lại sẽ xóa toàn bộ {editing.runs.length} lượt hiện tại và cấp mã vạch mới:
                  tem đã in ra thành rác, mốc check-in/check-out đã ghi mất hết. Chỉ làm khi đơn
                  chưa chạy hoặc chấp nhận in lại tem.
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                      Tổng số con *
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={editSplit.totalQuantity}
                      onChange={(e) => setEditSplit({ ...editSplit, totalQuantity: e.target.value })}
                      className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                      Số con mỗi mâm PEI (dùng chung) *
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={editSplit.perSheetQty}
                      onChange={(e) => setEditSplit({ ...editSplit, perSheetQty: e.target.value })}
                      className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-2">
                    Máy in chạy đơn (số thứ tự = thứ tự nhận lượt · ô bên phải là số con/mâm
                    riêng của máy đó)
                  </label>
                  <MayPicker
                    printers={printers}
                    selectedIds={editPrinterIds}
                    limits={editLimits}
                    moiMamChung={editSplit.perSheetQty}
                    onToggle={(id) =>
                      setEditPrinterIds((cu) =>
                        cu.includes(id) ? cu.filter((x) => x !== id) : [...cu, id]
                      )
                    }
                    onLimit={(id, value) => setEditLimits((cu) => ({ ...cu, [id]: value }))}
                  />
                </div>

                {previewChiaLai && (
                  <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-sm text-slate-600 dark:text-slate-300">
                    Sẽ chia lại thành{' '}
                    <span className="font-bold text-indigo-600 dark:text-indigo-300">
                      {previewChiaLai.soLuot} lượt in
                    </span>{' '}
                    — {previewChiaLai.theoMay.map((m) => `${m.ten}: ${m.soLuot} lượt × ${m.moiMam} con`).join(' · ')}
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={handleChiaLai}
                    disabled={saving}
                    className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold rounded-xl disabled:opacity-50"
                  >
                    {saving ? 'Đang chia lại...' : 'Chia lại lượt in'}
                  </button>
                  <button
                    onClick={() => setChiaLai(false)}
                    className="px-6 py-2.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-semibold rounded-xl"
                  >
                    Bỏ
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleUpdate}
              disabled={saving}
              className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-indigo-500/20 disabled:opacity-50"
            >
              {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
            </button>
            <button
              onClick={() => setEditing(null)}
              className="px-6 py-2.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-semibold rounded-xl"
            >
              Hủy
            </button>
          </div>
        </div>
      )}

      {/* Danh sách đơn */}
      {loading ? (
        <div className="text-center text-slate-500 py-10">Đang tải...</div>
      ) : orders.length === 0 ? (
        <div className="text-center text-slate-500 py-10 bg-white dark:bg-[#111827] rounded-2xl border border-slate-200 dark:border-slate-800">
          Chưa có đơn sản xuất số lượng lớn nào
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {orders.map((order) => {
            const xong = soConDaXong(order.runs);
            const phanTram = order.totalQuantity > 0 ? Math.round((xong / order.totalQuantity) * 100) : 0;
            const dangChon = order.id === selectedOrderId;
            return (
              <button
                key={order.id}
                onClick={() => setSelectedOrderId(order.id)}
                className={`text-left bg-white dark:bg-[#111827] border rounded-2xl p-5 transition-all ${
                  dangChon
                    ? 'border-indigo-500 shadow-lg shadow-indigo-500/10'
                    : 'border-slate-200 dark:border-slate-800 hover:border-indigo-400'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 dark:text-white truncate">{order.productName}</div>
                    <div className="text-xs text-slate-500 truncate">
                      {order.orderCode ? `${order.orderCode} · ` : ''}
                      {order.customerName || 'Khách lẻ'}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 px-2 py-1 rounded text-xs border ${
                      order.status === 'completed'
                        ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                        : order.status === 'printing'
                          ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-500 border-slate-300 dark:border-slate-700'
                    }`}
                  >
                    {order.status === 'completed' ? 'Xong' : order.status === 'printing' ? 'Đang chạy' : 'Chờ in'}
                  </span>
                </div>

                <div className="text-xs text-slate-500 mb-2">
                  {order.runs.length} lượt · {order.perSheetQty} con/mâm
                  {tongSoLoi(order.runs) > 0 && (
                    <span className="text-rose-500"> · lỗi {tongSoLoi(order.runs)}</span>
                  )}
                </div>

                <div className="h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden mb-1">
                  <div
                    className={`h-full rounded-full transition-all ${phanTram === 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                    style={{ width: `${phanTram}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600 dark:text-slate-300 font-semibold">
                    {xong.toLocaleString('vi-VN')} / {order.totalQuantity.toLocaleString('vi-VN')} con
                  </span>
                  <span className="text-slate-500">{phanTram}%</span>
                </div>

                <div className="flex gap-2 mt-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      inTem(order.runs, order);
                    }}
                    className="flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-500 cursor-pointer"
                  >
                    <Tag size={13} /> In toàn bộ tem
                  </span>
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      batDauSua(order);
                    }}
                    className="flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-500 cursor-pointer"
                  >
                    <Pencil size={13} /> Sửa
                  </span>
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteOrder(order);
                    }}
                    className="flex items-center gap-1 text-xs text-slate-500 hover:text-rose-500 cursor-pointer ml-auto"
                  >
                    <Trash2 size={13} /> Xóa
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Bảng chi tiết theo máy / lượt PEI */}
      {selectedOrder && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              Chi tiết lượt in — {selectedOrder.productName}
              {selectedOrder.note && <span className="ml-2 text-xs font-normal text-slate-500">({selectedOrder.note})</span>}
            </h3>

            {tongSoLoi(selectedOrder.runs) > 0 && (
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm text-rose-500">
                  Lỗi: {tongSoLoi(selectedOrder.runs)} con
                  {canBuBaoNhieu(selectedOrder.runs) > 0
                    ? ` · cần in bù ${canBuBaoNhieu(selectedOrder.runs)}`
                    : ' · đã có lượt bù đủ'}
                </span>
                <button
                  onClick={() => handleInMiengLoi(selectedOrder)}
                  disabled={canBuBaoNhieu(selectedOrder.runs) === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:hover:bg-rose-600 text-white text-sm font-semibold rounded-xl"
                >
                  <RotateCcw size={15} /> In miếng lỗi
                </button>
              </div>
            )}
          </div>

          {runsTheoMay.map(({ key, printerName, runs }) => {
            const dongLai = collapsedPrinters.includes(key);
            const xongMay = runs.filter((r) => r.status === 'completed').length;
            return (
              <div
                key={key}
                className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden"
              >
                <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
                  <button
                    onClick={() =>
                      setCollapsedPrinters((cu) =>
                        cu.includes(key) ? cu.filter((k) => k !== key) : [...cu, key]
                      )
                    }
                    className="text-slate-500 hover:text-indigo-500"
                  >
                    {dongLai ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
                  </button>
                  <PrinterIcon size={16} className="text-indigo-400" />
                  <span className="font-semibold text-slate-900 dark:text-white">{printerName}</span>
                  <span className="text-xs text-slate-500">
                    {xongMay}/{runs.length} lượt xong ·{' '}
                    {runs.reduce((s, r) => s + r.quantity, 0).toLocaleString('vi-VN')} con
                  </span>
                  <button
                    onClick={() => inTem(runs, selectedOrder)}
                    className="ml-auto flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-500"
                  >
                    <Tag size={13} /> In tem máy này
                  </button>
                </div>

                {!dongLai && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
                          <th className="px-4 py-2.5">Mã lượt</th>
                          <th className="px-4 py-2.5">PEI</th>
                          <th className="px-4 py-2.5">Số con</th>
                          <th className="px-4 py-2.5">Lỗi</th>
                          <th className="px-4 py-2.5">Trạng thái</th>
                          <th className="px-4 py-2.5">Bắt đầu in</th>
                          <th className="px-4 py-2.5">In xong</th>
                          <th className="px-4 py-2.5">Thời lượng</th>
                          <th className="px-4 py-2.5 text-right">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {runs.map((run) => (
                          <tr
                            key={run.id}
                            className="text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/30"
                          >
                            <td className="px-4 py-2.5 font-mono font-bold text-slate-900 dark:text-white">
                              {run.id}
                              {run.isRework && (
                                <span className="ml-2 px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-500 text-[10px] font-sans border border-rose-500/20">
                                  BÙ
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="px-2 py-0.5 bg-slate-200 dark:bg-slate-800 rounded text-xs font-semibold">
                                PEI {run.peiIndex}
                              </span>
                            </td>
                            <td className="px-4 py-2.5">{run.quantity}</td>
                            <td className="px-4 py-2.5">
                              {run.defectQuantity > 0 ? (
                                <span className="text-rose-500 font-semibold">{run.defectQuantity}</span>
                              ) : (
                                <span className="text-slate-500">—</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5">
                              {run.status === 'completed' && (
                                <span className="px-2 py-1 bg-emerald-500/10 text-emerald-500 rounded text-xs border border-emerald-500/20">
                                  Xong
                                </span>
                              )}
                              {run.status === 'printing' && (
                                <span className="px-2 py-1 bg-amber-500/10 text-amber-500 rounded text-xs border border-amber-500/20">
                                  Đang in
                                </span>
                              )}
                              {run.status === 'pending' && (
                                <span className="px-2 py-1 bg-slate-200 dark:bg-slate-800 text-slate-500 rounded text-xs border border-slate-300 dark:border-slate-700">
                                  Chờ in
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-xs">{dinhDangMoc(run.startedAt)}</td>
                            <td className="px-4 py-2.5 text-xs">{dinhDangMoc(run.finishedAt)}</td>
                            <td className="px-4 py-2.5 text-xs font-semibold">
                              {dinhDangThoiLuong(run.startedAt, run.finishedAt)}
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => inTem([run], selectedOrder)}
                                  title="In tem lượt này"
                                  className="p-1.5 text-slate-500 hover:text-indigo-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
                                >
                                  <Tag size={14} />
                                </button>
                                {run.status !== 'completed' && (
                                  <button
                                    onClick={() => {
                                      const ctx = { run, productName: selectedOrder.productName };
                                      if (run.status === 'pending') setChoMay(ctx);
                                      else {
                                        setSoLoi('');
                                        setHoiLoi(ctx);
                                      }
                                    }}
                                    title={
                                      run.status === 'pending'
                                        ? 'Bắt đầu in — quẹt tiếp tem máy in'
                                        : 'Ghi nhận in xong'
                                    }
                                    className={`p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 ${
                                      run.status === 'pending'
                                        ? 'text-amber-500 hover:text-amber-400'
                                        : 'text-emerald-500 hover:text-emerald-400'
                                    }`}
                                  >
                                    {run.status === 'pending' ? <Play size={14} /> : <Check size={14} />}
                                  </button>
                                )}
                                {run.status !== 'pending' && (
                                  <button
                                    onClick={() =>
                                      capNhatLuot(run, { status: 'pending' }, `Đã đặt lại lượt ${run.id} về chờ in`)
                                    }
                                    title="Đặt lại về chờ in (quẹt nhầm)"
                                    className="p-1.5 text-slate-500 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
                                  >
                                    <RotateCcw size={14} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
