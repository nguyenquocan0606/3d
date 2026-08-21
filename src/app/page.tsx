'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Database,
  Archive,
  Edit2,
  FlaskConical,
  FolderOpen,
  LayoutDashboard,
  ListOrdered,
  MessageSquare,
  PackageOpen,
  PackageSearch,
  Palette,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  Scale,
  Search,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Store,
  Tag,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { colorCodeFor, colorKey, findColorByCode, isColorCode, scannedColorKey } from '@/utils/color-code';
import { CloudPrinterCard } from '@/components/Printer/CloudPrinterCard';
import { TuongCamera } from '@/components/Printer/tuong-camera';
import AddSpoolModal from '@/components/Filament/add-spool-modal';
import UpdateWeightModal from '@/components/Filament/update-weight-modal';
import EditSpoolModal from '@/components/Filament/edit-spool-modal';
import PrintBarcodeModal from '@/components/Filament/print-barcode-modal';
import AddLocationModal from '@/components/Filament/add-location-modal';
import ManageLocationModal from '@/components/Filament/manage-location-modal';
import AddPrinterModal from '@/components/Filament/add-printer-modal';
import ManagePrinterModal from '@/components/Filament/manage-printer-modal';
import ColorDetailModal from '@/components/Filament/color-detail-modal';
import EshopPickModal from '@/components/Eshop/eshop-pick-modal';
import PrintQrTab from '@/components/Filament/print-qr-tab';
import PrintLabelTab from '@/components/Filament/print-label-tab';
import CreateJobTab from '@/components/Filament/create-job-tab';
import CheckInventoryTab from '@/components/Filament/check-inventory-tab';
import DashboardTab from '@/components/Dashboard/dashboard-tab';
import ProductionTab from '@/components/Orders/production-tab';
import MisaSettingsTab from '@/components/Settings/misa-settings-tab';
import EshopTab from '@/components/Eshop/eshop-tab';
import ZaloTab from '@/components/Zalo/zalo-tab';
import ScaleCalibrationModal from '@/components/Filament/scale-calibration-modal';
import { useScale } from '@/components/scale-provider';
import { Filament, FilamentWithSpools, Printer as PrinterType, Spool } from '@/types/filament.types';

type TabKey =
  | 'dashboard'
  | 'spools'
  | 'filaments'
  | 'locations'
  | 'printers'
  | 'cameras'
  | 'production'
  | 'eshop'
  | 'eshop-api-test' // liên kết ra /eshop-api-test
  | 'zalo'
  | 'print-qr'
  | 'print-label'
  | 'create-job'
  | 'check-inventory'
  | 'store-products' // không còn render nội bộ — chỉ giữ làm key ổn định cho mục menu liên kết ra /hang-hoa-cua-hang
  | 'counter' // liên kết ra /counter/camera
  | 'settings';

type ApiResponse<T> = {
  status?: string;
  success?: boolean;
  data?: T;
  message?: string;
};

type LocationItem = {
  id: string;
  name: string;
  spools?: EnrichedSpool[];
};

type PrinterItem = PrinterType & {
  cloudAccountId?: string | null;
  cloudAccount?: Record<string, unknown> | null;
  spools?: EnrichedSpool[];
};

type EnrichedSpool = Spool & {
  filamentType: string;
  filamentColorName: string;
  filamentColorHex: string | null;
  filamentBrand: string | null;
  locationName: string | null;
  printerName: string | null;
};

type Toast = {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
};

type ScanMode = {
  type: 'location' | 'printer';
  id: string;
  name: string;
  action: 'add' | 'remove';
  slot?: number;
} | null;

type ScanPopup =
  | { type: 'location'; title: string; subtitle: string; modeText?: string }
  | { type: 'printer'; title: string; subtitle: string; modeText?: string }
  | { type: 'spool'; title: string; subtitle: string; spool: EnrichedSpool }
  | { type: 'action'; title: string; subtitle: string; tone: 'success' | 'error' | 'info' }
  | { type: 'unknown'; title: string; subtitle: string };

const navigation: Array<{ key: TabKey; label: string; icon: React.ElementType; href?: string }> = [
  { key: 'dashboard', label: 'Tổng quan', icon: LayoutDashboard },
  { key: 'spools', label: 'Cuộn nhựa', icon: Database },
  { key: 'filaments', label: 'Loại nhựa', icon: Palette },
  { key: 'locations', label: 'Kho lưu trữ', icon: FolderOpen },
  { key: 'printers', label: 'Máy in', icon: Printer },
  { key: 'cameras', label: 'Camera', icon: Video },
  { key: 'production', label: 'Sản xuất', icon: ShoppingBag },
  { key: 'eshop', label: 'eShop', icon: ShoppingCart },
  // Công cụ kỹ thuật, có URL riêng (/eshop-api-test) — bắn thử API Open Platform bằng App ID/App Key.
  { key: 'eshop-api-test', label: 'eShop API test', icon: FlaskConical, href: '/eshop-api-test' },
  { key: 'zalo', label: 'Tin nhắn Zalo', icon: MessageSquare },
  // Có URL riêng (/hang-hoa-cua-hang) — chuyển trang thật thay vì chỉ đổi tab nội bộ.
  { key: 'store-products', label: 'Hàng hóa cửa hàng', icon: Store, href: '/hang-hoa-cua-hang' },
  { key: 'print-qr', label: 'In QR', icon: QrCode },
  { key: 'print-label', label: 'In Tem', icon: Tag },
  { key: 'create-job', label: 'Tạo job in', icon: ListOrdered },
  { key: 'check-inventory', label: 'Kiểm kho', icon: PackageSearch },
  { key: 'counter', label: 'Đếm sản phẩm', icon: Camera, href: '/counter/camera' },
  { key: 'settings', label: 'Cài đặt', icon: Settings },
];

export default function Home() {
  const { weight: liveWeight, rawWeight, offset: scaleOffset, setOffset: setScaleOffset, isConnected: isScaleConnected } = useScale();

  const [filaments, setFilaments] = useState<FilamentWithSpools[]>([]);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [printers, setPrinters] = useState<PrinterItem[]>([]);
  const [liveStatuses, setLiveStatuses] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [materialFilter, setMaterialFilter] = useState('ALL');
  const [globalScannedCode, setGlobalScannedCode] = useState<{ code: string; timestamp: number } | null>(null);
  const [scanMode, setScanMode] = useState<ScanMode>(null);
  const [scanPopup, setScanPopup] = useState<ScanPopup | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const scanBufferRef = useRef('');
  const lastKeyTimeRef = useRef(0);

  const [isAddSpoolOpen, setIsAddSpoolOpen] = useState(false);
  const [isUpdateWeightOpen, setIsUpdateWeightOpen] = useState(false);
  const [isEditSpoolOpen, setIsEditSpoolOpen] = useState(false);
  const [isPrintBarcodeOpen, setIsPrintBarcodeOpen] = useState(false);
  const [isAddLocationOpen, setIsAddLocationOpen] = useState(false);
  const [isManageLocationOpen, setIsManageLocationOpen] = useState(false);
  const [isAddPrinterOpen, setIsAddPrinterOpen] = useState(false);
  const [isManagePrinterOpen, setIsManagePrinterOpen] = useState(false);
  const [isColorDetailOpen, setIsColorDetailOpen] = useState(false);

  const [eshopPickingOrder, setEshopPickingOrder] = useState<any>(null);
  const eshopPickingOrderRef = useRef<any>(null);
  useEffect(() => {
    eshopPickingOrderRef.current = eshopPickingOrder;
  }, [eshopPickingOrder]);
  const [isScaleCalibrationOpen, setIsScaleCalibrationOpen] = useState(false);

  const [selectedFilamentForSpool, setSelectedFilamentForSpool] = useState<Filament | null>(null);
  const [selectedSpoolForWeight, setSelectedSpoolForWeight] = useState<EnrichedSpool | null>(null);
  const [selectedSpoolForEdit, setSelectedSpoolForEdit] = useState<EnrichedSpool | null>(null);
  const [selectedSpoolForPrint, setSelectedSpoolForPrint] = useState<EnrichedSpool | null>(null);
  const [selectedLocationForManage, setSelectedLocationForManage] = useState<LocationItem | null>(null);
  const [selectedPrinterForManage, setSelectedPrinterForManage] = useState<PrinterItem | null>(null);
  const [selectedColorName, setSelectedColorName] = useState('');
  const [selectedColorHex, setSelectedColorHex] = useState('');
  const [prefilledSpoolId, setPrefilledSpoolId] = useState('');
  const [prefilledLocationId, setPrefilledLocationId] = useState('');
  const [autoPrintSpool, setAutoPrintSpool] = useState(false);

  const showToast = useCallback((message: string, type: Toast['type'] = 'success') => {
    const id = Math.random().toString(36).slice(2, 9);
    setToasts((current) => [...current, { id, message, type }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 3000);
  }, []);

  const requestConfirm = useCallback((title: string, message: string, onConfirm: () => void) => {
    setConfirmAction({ title, message, onConfirm });
  }, []);

  const allSpools = useMemo<EnrichedSpool[]>(() => {
    return filaments.flatMap((filament) =>
      filament.spools.map((spool) => {
        const loc = spool.locationId ? locations.find((l) => l.id === spool.locationId) : null;
        const prn = spool.printerId ? printers.find((p) => p.id === spool.printerId) : null;
        return {
          ...spool,
          filamentType: filament.type,
          filamentColorName: filament.colorName,
          filamentColorHex: filament.colorHex || null,
          filamentBrand: filament.brand || null,
          locationName: loc ? loc.name : null,
          printerName: prn ? prn.name : null,
        };
      }),
    );
  }, [filaments, locations, printers]);

  const materialTypes = useMemo(() => {
    return ['ALL', ...Array.from(new Set(filaments.map((item) => item.type))).sort()];
  }, [filaments]);

  // Gõ/quét thẳng mã tem màu (`CLR-...`) vào ô tìm kiếm thì lọc theo tên màu,
  // bất kể tem ghi dấu cách hay gạch nối giữa các chữ.
  const colorQueryKey = useMemo(
    () => (isColorCode(searchQuery) ? scannedColorKey(searchQuery) : ''),
    [searchQuery],
  );

  const filteredFilaments = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return filaments.filter((filament) => {
      const matchesMaterial = materialFilter === 'ALL' || filament.type === materialFilter;
      if (colorQueryKey) return matchesMaterial && colorKey(filament.colorName) === colorQueryKey;
      const text = [filament.type, filament.colorName, filament.brand, ...filament.spools.map((spool) => spool.id)].join(' ').toLowerCase();
      return matchesMaterial && (!query || text.includes(query));
    });
  }, [filaments, materialFilter, searchQuery, colorQueryKey]);

  const filteredSpools = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return allSpools.filter((spool) => {
      const matchesMaterial = materialFilter === 'ALL' || spool.filamentType === materialFilter;
      if (colorQueryKey) return matchesMaterial && colorKey(spool.filamentColorName) === colorQueryKey;
      const text = [spool.id, spool.filamentType, spool.filamentColorName, spool.filamentBrand, spool.status].join(' ').toLowerCase();
      return matchesMaterial && (!query || text.includes(query));
    });
  }, [allSpools, materialFilter, searchQuery, colorQueryKey]);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError('');
    }

    try {
      // Tab Tổng quan tự gọi /api/dashboard/* của riêng nó, nên ở đây không tải
      // /api/dashboard/stats nữa — endpoint cũ giữ lại chỉ để app Flutter còn dùng.
      const [filamentRes, locationRes, printerRes] = await Promise.all([
        fetch('/api/filaments'),
        fetch('/api/locations'),
        fetch('/api/printers'),
      ]);

      const [filamentData, locationData, printerData] = (await Promise.all([
        filamentRes.json(),
        locationRes.json(),
        printerRes.json(),
      ])) as [ApiResponse<FilamentWithSpools[]>, ApiResponse<LocationItem[]>, ApiResponse<PrinterItem[]>];

      if (filamentData.status === 'success') setFilaments(filamentData.data || []);
      if (locationData.status === 'success') setLocations(locationData.data || []);
      if (printerData.status === 'success') setPrinters(printerData.data || []);

      if (filamentData.status !== 'success' && !silent) {
        setError(filamentData.message || 'Không tải được dữ liệu nhựa.');
      }
    } catch {
      if (!silent) setError('Lỗi kết nối máy chủ.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      fetchData();
    });
  }, [fetchData]);

  useEffect(() => {
    const fetchLiveStatuses = async () => {
      try {
        const res = await fetch('/api/printers/cloud/status');
        const data = (await res.json()) as ApiResponse<Record<string, unknown>>;
        if (data.status === 'success' && data.data) setLiveStatuses(data.data);
      } catch {
        // Cloud printers are optional; keep the rest of the app usable.
      }
    };

    fetchLiveStatuses();
    const interval = window.setInterval(fetchLiveStatuses, activeTab === 'printers' ? 5000 : 300000);
    return () => window.clearInterval(interval);
  }, [activeTab]);

  const handleDeleteFilament = async (id: string, name: string) => {
    requestConfirm('Xóa loại nhựa', `Bạn có chắc chắn muốn xóa loại nhựa "${name}"?`, async () => {
      try {
        const res = await fetch(`/api/filaments/${id}`, { method: 'DELETE' });
        const data = (await res.json()) as ApiResponse<unknown>;
        if (data.status === 'success') {
          showToast('Đã xóa loại nhựa.');
          fetchData(true);
        } else {
          showToast(data.message || 'Không xóa được loại nhựa.', 'error');
        }
      } catch {
        showToast('Lỗi kết nối máy chủ.', 'error');
      }
    });
  };

  const handleDeleteSpool = async (id: string) => {
    requestConfirm('Xóa cuộn nhựa', `Bạn có chắc chắn muốn xóa cuộn nhựa "${id}"?`, async () => {
      try {
        const res = await fetch(`/api/spools/${id}`, { method: 'DELETE' });
        const data = (await res.json()) as ApiResponse<unknown>;
        if (data.status === 'success') {
          showToast('Đã xóa cuộn nhựa.');
          fetchData(true);
        } else {
          showToast(data.message || 'Không xóa được cuộn nhựa.', 'error');
        }
      } catch {
        showToast('Lỗi kết nối máy chủ.', 'error');
      }
    });
  };

  const openAddSpool = (filament: Filament | null = null, options?: { spoolId?: string; locationId?: string }) => {
    setSelectedFilamentForSpool(filament);
    setPrefilledSpoolId(options?.spoolId || '');
    setPrefilledLocationId(options?.locationId || '');
    setIsAddSpoolOpen(true);
  };

  const openPrintForLocation = (location: LocationItem) => {
    setSelectedSpoolForPrint({
      id: location.id,
      filamentId: '',
      initialWeightG: 0,
      emptySpoolWeightG: 0,
      remainingWeightG: 0,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      filamentType: 'VỊ TRÍ KHO',
      filamentColorName: location.name,
    } as EnrichedSpool);
    setAutoPrintSpool(false);
    setIsPrintBarcodeOpen(true);
  };

  const openPrintForPrinter = (printer: PrinterItem) => {
    setSelectedSpoolForPrint({
      id: printer.id,
      filamentId: '',
      initialWeightG: 0,
      emptySpoolWeightG: 0,
      remainingWeightG: 0,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      filamentType: 'MÁY IN 3D',
      filamentColorName: printer.name,
    } as EnrichedSpool);
    setAutoPrintSpool(false);
    setIsPrintBarcodeOpen(true);
  };

  const openPrintForColor = (colorName: string) => {
    setSelectedSpoolForPrint({
      id: colorCodeFor(colorName),
      filamentId: '',
      initialWeightG: 0,
      emptySpoolWeightG: 0,
      remainingWeightG: 0,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      filamentType: 'MÃ MÀU NHỰA',
      filamentColorName: colorName,
    } as EnrichedSpool);
    setAutoPrintSpool(false);
    setIsPrintBarcodeOpen(true);
  };

  // In hàng loạt tem mã màu (CLR-) cho toàn bộ màu đang hiển thị trong tab Loại nhựa
  const printAllColorLabels = () => {
    const uniqueColors = Array.from(
      new Map(filteredFilaments.map((f) => [f.colorName.toUpperCase(), f.colorName])).values(),
    ).sort((a, b) => a.localeCompare(b, 'vi'));

    if (uniqueColors.length === 0) {
      showToast('Không có mã màu nào để in.', 'error');
      return;
    }

    requestConfirm(
      'In tất cả mã màu',
      `Gửi lệnh in ${uniqueColors.length} tem mã màu (CLR-...)?`,
      async () => {
        let ok = 0;
        for (const colorName of uniqueColors) {
          const qrCode = colorCodeFor(colorName);
          try {
            const res = await fetch('/api/print-jobs', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                qrCode,
                label: JSON.stringify({ line1: qrCode, line2: 'MÃ MÀU NHỰA', line3: colorName }),
              }),
            });
            const data = await res.json();
            if (data.status === 'success') ok += 1;
          } catch {
            // bỏ qua, báo tổng kết ở cuối
          }
        }
        if (ok === uniqueColors.length) {
          showToast(`Đã gửi lệnh in ${ok} tem mã màu.`);
        } else {
          showToast(`Chỉ gửi được ${ok}/${uniqueColors.length} tem mã màu.`, 'error');
        }
      },
    );
  };

  const updateSpoolBinding = useCallback(async (spool: EnrichedSpool, binding: { locationId?: string | null; printerId?: string | null; printerSlot?: number | null }, successMessage: string) => {
    try {
      const res = await fetch(`/api/spools/${spool.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(binding),
      });
      const data = (await res.json()) as ApiResponse<EnrichedSpool>;
      if (data.status === 'success') {
        setScanPopup({ type: 'action', title: 'Đã cập nhật', subtitle: successMessage, tone: 'success' });
        showToast(successMessage);
        fetchData(true);
      } else {
        setScanPopup({ type: 'action', title: 'Không cập nhật được', subtitle: data.message || 'Lỗi cập nhật cuộn nhựa.', tone: 'error' });
      }
    } catch {
      setScanPopup({ type: 'action', title: 'Lỗi kết nối', subtitle: 'Không thể cập nhật cuộn nhựa lúc này.', tone: 'error' });
    }
  }, [fetchData, showToast]);

  const handleScannedCode = useCallback(
    (rawCode: string) => {
      const code = rawCode.trim();
      if (!code) return;

      setGlobalScannedCode({ code, timestamp: Date.now() });

      if (activeTab === 'print-qr') {
        return;
      }

      if (activeTab === 'production') {
        if (/^\d+$/.test(code)) {
          window.dispatchEvent(new CustomEvent('productionNumericScanned', { detail: code }));
        } else {
          // Mã không phải barcode (VD tem máy in): tab Sản xuất SLL cần nó cho bước
          // quẹt máy khi bắt đầu 1 lượt PEI.
          window.dispatchEvent(new CustomEvent('productionCodeScanned', { detail: code }));
        }
        return;
      }

      if (activeTab === 'create-job' || activeTab === 'check-inventory') {
        return;
      }

      const normalized = code.replace(/-/g, '').toUpperCase();
      const location = locations.find((item) => item.id.replace(/-/g, '').toUpperCase() === normalized);
      let printer = printers.find((item) => item.id.replace(/-/g, '').toUpperCase() === normalized);
      const spool = allSpools.find((item) => item.id.replace(/-/g, '').toUpperCase() === normalized);

      if (isColorCode(code)) {
        // So bằng khóa chuẩn hóa: tem cũ có thể ghi "CLR-FOREST GREEN",
        // "CLR-FOREST-GREEN" hay "CLRFORESTGREEN" — tất cả đều là một màu.
        const colorFilament = findColorByCode(filaments, code, (f) => f.colorName);
        if (colorFilament) {
          setSelectedColorName(colorFilament.colorName);
          setSelectedColorHex(colorFilament.colorHex || '#4f46e5');
          setIsColorDetailOpen(true);
          return;
        }
      }

      // 4. Eshop picking overlay
      if (eshopPickingOrderRef.current) {
        // modal is open, let modal use globalScannedCode
        return;
      }

      let scannedSlot: number | null = null;
      if (!printer && !location && !spool) {
        const slotMatch = normalized.match(/^(.*)L([1-4])$/);
        if (slotMatch) {
          const possiblePrinterId = slotMatch[1];
          printer = printers.find((item) => item.id.replace(/-/g, '').toUpperCase() === possiblePrinterId);
          if (printer) {
            scannedSlot = parseInt(slotMatch[2]);
          }
        }
      }

      if (spool && scanMode) {
        if (scanMode.type === 'location') {
          const binding = scanMode.action === 'add' ? { locationId: scanMode.id } : { locationId: null };
          updateSpoolBinding(
            spool,
            binding,
            scanMode.action === 'add'
              ? `Đã thêm cuộn ${spool.id} vào kho ${scanMode.name}.`
              : `Đã xóa cuộn ${spool.id} khỏi kho ${scanMode.name}.`,
          );
          return;
        }

        const binding = scanMode.action === 'add' ? { printerId: scanMode.id, printerSlot: scanMode.slot || null } : { printerId: null, printerSlot: null };
        updateSpoolBinding(
          spool,
          binding,
          scanMode.action === 'add'
            ? `Đã gắn cuộn ${spool.id} vào máy ${scanMode.name}.`
            : `Đã tháo cuộn ${spool.id} khỏi máy ${scanMode.name}.`,
        );
        return;
      }

      if (location) {
        setSelectedLocationForManage(location);
        setIsManageLocationOpen(true);
        return;
      }

      if (printer) {
        if (scannedSlot !== null) {
          // Bật chế độ quét cuộn nhựa để gán vào Line này
          setScanMode({ type: 'printer', id: printer.id, name: `${printer.name} (Line ${scannedSlot})`, action: 'add', slot: scannedSlot });
          setScanPopup({
            type: 'printer',
            title: `${printer.name} - Line ${scannedSlot}`,
            subtitle: `${printer.id}-L${scannedSlot}`,
            modeText: `Đang Bật: Quét QR cuộn nhựa để gắn vào Line ${scannedSlot}.`,
          });
          return;
        }

        setSelectedPrinterForManage(printer);
        setIsManagePrinterOpen(true);
        return;
      }

      if (spool) {
        setSelectedSpoolForWeight(spool);
        setIsUpdateWeightOpen(true);
        return;
      }

      // Thử tìm Eshop Order
      fetch(`/api/eshop/orders/scan?code=${encodeURIComponent(code)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.status === 'success' && data.data) {
            setEshopPickingOrder(data.data);
          } else {
            setScanPopup({ type: 'unknown', title: 'Không tìm thấy mã', subtitle: code });
          }
        })
        .catch(() => {
          setScanPopup({ type: 'unknown', title: 'Không tìm thấy mã', subtitle: code });
        });
    },
    [activeTab, allSpools, filaments, locations, printers, scanMode, updateSpoolBinding],
  );

  useEffect(() => {
    queueMicrotask(() => {
      setScanMode(null);
    });
  }, [activeTab]);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if (isTyping) return;

      const now = Date.now();
      if (now - lastKeyTimeRef.current > 120) scanBufferRef.current = '';
      lastKeyTimeRef.current = now;

      if (event.key === 'Enter') {
        const code = scanBufferRef.current.trim();
        scanBufferRef.current = '';
        if (code.length >= 3) {
          handleScannedCode(code);
        }
        return;
      }

      if (event.key.length === 1) scanBufferRef.current += event.key;
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleScannedCode]);

  useEffect(() => {
    const handleAppToast = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string; type?: Toast['type'] }>).detail;
      if (!detail?.message) return;
      showToast(detail.message, detail.type || 'info');
    };
    window.addEventListener('appToast', handleAppToast);
    return () => window.removeEventListener('appToast', handleAppToast);
  }, [showToast]);

  useEffect(() => {
    const handleAppConfirm = (event: Event) => {
      const detail = (event as CustomEvent<{ title?: string; message?: string; onConfirm?: () => void }>).detail;
      if (!detail?.message || !detail.onConfirm) return;
      requestConfirm(detail.title || 'Xác nhận', detail.message, detail.onConfirm);
    };
    window.addEventListener('appConfirm', handleAppConfirm);
    return () => window.removeEventListener('appConfirm', handleAppConfirm);
  }, [requestConfirm]);

  const title = navigation.find((item) => item.key === activeTab)?.label || 'Tổng quan';

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#090d16] dark:text-white">
      <div className="fixed right-4 top-4 z-[60] space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`rounded-lg border px-4 py-3 text-sm shadow-xl ${
              toast.type === 'error'
                ? 'border-red-500/30 bg-red-950 text-red-100'
                : toast.type === 'info'
                  ? 'border-cyan-500/30 bg-cyan-950 text-cyan-100'
                  : 'border-emerald-500/30 bg-emerald-950 text-emerald-100'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-slate-200 bg-white transition-all duration-300 dark:border-slate-800 dark:bg-[#0f1729] ${
          isSidebarCollapsed ? 'w-20' : 'w-72'
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-4 dark:border-slate-800">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white">
              <PackageOpen size={22} />
            </div>
            {!isSidebarCollapsed && (
              <div className="min-w-0">
                <h1 className="truncate text-sm font-bold">3D Print Manager</h1>
                <p className="truncate text-xs text-slate-500">Nhựa, máy in, sản xuất, hàng hóa</p>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setIsSidebarCollapsed((value) => !value)}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Thu gọn menu"
          >
            {isSidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.key;
            const className = `flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
              active
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800/70'
            } ${isSidebarCollapsed ? 'justify-center' : ''}`;

            if (item.href) {
              return (
                <Link key={item.key} href={item.href} className={className} title={item.label}>
                  <Icon size={19} />
                  {!isSidebarCollapsed && <span>{item.label}</span>}
                </Link>
              );
            }

            return (
              <button key={item.key} type="button" onClick={() => setActiveTab(item.key)} className={className} title={item.label}>
                <Icon size={19} />
                {!isSidebarCollapsed && <span>{item.label}</span>}
              </button>
            );
          })}
        </nav>
      </aside>

      <section className={`transition-all duration-300 ${isSidebarCollapsed ? 'pl-20' : 'pl-72'}`}>
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 px-5 py-4 backdrop-blur dark:border-slate-800 dark:bg-[#090d16]/90">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-500">Hệ thống quản lý</p>
              <h2 className="text-2xl font-bold">{title}</h2>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900 sm:w-72"
                  placeholder="Tìm kiếm nhanh..."
                />
              </div>
              <select
                value={materialFilter}
                onChange={(event) => setMaterialFilter(event.target.value)}
                className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900"
              >
                {materialTypes.map((type) => (
                  <option key={type} value={type}>
                    {type === 'ALL' ? 'Tất cả vật liệu' : type}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => fetchData()}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
              >
                <RefreshCw size={16} />
                Tải lại
              </button>
              <button
                type="button"
                onClick={() => openAddSpool()}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                <Plus size={16} />
                Thêm cuộn
              </button>

              {/* Widget Trạm Cân Nhỏ Ở Header */}
              <button 
                type="button"
                className="inline-flex h-10 items-center gap-2.5 rounded-lg border border-slate-300 bg-slate-100 px-3 dark:border-slate-700 dark:bg-slate-800/80 shadow-sm cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors" 
                title="Click để hiệu chuẩn cân (bù trừ)" 
                onClick={() => {
                  console.log('Opening calibration modal...');
                  setIsScaleCalibrationOpen(true);
                }}
              >
                <div className={`w-2 h-2 rounded-full ${isScaleConnected ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-slate-400'}`} />
                <Scale size={16} className={isScaleConnected ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500"} />
                <span className={`text-sm font-bold font-mono ${isScaleConnected ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}`}>
                  {isScaleConnected ? `${Math.round(liveWeight)} g` : '---'}
                </span>
              </button>
            </div>
          </div>
        </header>

        <div className="p-5">
          {error && <div className="mb-4 rounded-xl border border-red-500/30 bg-red-950/40 p-4 text-sm text-red-100">{error}</div>}
          {loading ? (
            <div className="flex min-h-96 items-center justify-center text-slate-500">Đang tải dữ liệu...</div>
          ) : (
            <>
              {activeTab === 'dashboard' && (
                <DashboardTab setActiveTab={(tab) => setActiveTab(tab as TabKey)} />
              )}
              {activeTab === 'filaments' && (
                <FilamentsView
                  filaments={filteredFilaments}
                  onAddSpool={(filament) => openAddSpool(filament)}
                  onDelete={handleDeleteFilament}
                  onPrintAllColors={printAllColorLabels}
                  onOpenColor={(colorName, colorHex) => {
                    setSelectedColorName(colorName);
                    setSelectedColorHex(colorHex || '#4f46e5');
                    setIsColorDetailOpen(true);
                  }}
                />
              )}
              {activeTab === 'spools' && (
                <SpoolsView
                  spools={filteredSpools}
                  onUpdate={(spool) => {
                    setSelectedSpoolForWeight(spool);
                    setIsUpdateWeightOpen(true);
                  }}
                  onEdit={(spool) => {
                    setSelectedSpoolForEdit(spool);
                    setIsEditSpoolOpen(true);
                  }}
                  onPrint={(spool) => {
                    setSelectedSpoolForPrint(spool);
                    setAutoPrintSpool(false);
                    setIsPrintBarcodeOpen(true);
                  }}
                  onDelete={handleDeleteSpool}
                />
              )}
              {activeTab === 'locations' && (
                <LocationsView
                  locations={locations}
                  onAdd={() => setIsAddLocationOpen(true)}
                  onManage={(location) => {
                    setSelectedLocationForManage(location);
                    setIsManageLocationOpen(true);
                  }}
                  onPrint={openPrintForLocation}
                />
              )}
              {activeTab === 'printers' && (
                <PrintersView
                  printers={printers}
                  liveStatuses={liveStatuses}
                  onAdd={() => setIsAddPrinterOpen(true)}
                  onManage={(printer) => {
                    setSelectedPrinterForManage(printer);
                    setIsManagePrinterOpen(true);
                  }}
                  onPrint={openPrintForPrinter}
                />
              )}
              {activeTab === 'cameras' && <TuongCamera printers={printers} />}
              {activeTab === 'production' && <ProductionTab />}
              {activeTab === 'eshop' && <EshopTab />}
              {activeTab === 'zalo' && <ZaloTab />}
              {activeTab === 'print-qr' && (
                <PrintQrTab allSpools={allSpools} locations={locations} printers={printers} filaments={filaments} globalScannedCode={globalScannedCode} />
              )}
              {activeTab === 'print-label' && (
                <PrintLabelTab allSpools={allSpools} locations={locations} printers={printers} filaments={filaments} />
              )}
              {activeTab === 'create-job' && <CreateJobTab printers={printers} allSpools={allSpools} onJobCreated={() => fetchData(true)} />}
              {activeTab === 'check-inventory' && (
                <CheckInventoryTab
                  allSpools={allSpools}
                  onEditSpool={(spool) => {
                    setSelectedSpoolForEdit(spool as EnrichedSpool);
                    setIsEditSpoolOpen(true);
                  }}
                  onDeleteSpool={handleDeleteSpool}
                  onSuccess={() => fetchData(true)}
                  globalScannedCode={globalScannedCode}
                />
              )}
              {activeTab === 'settings' && <MisaSettingsTab />}
            </>
          )}
        </div>
      </section>

      <ScanInfoPopup
        popup={scanPopup}
        mode={scanMode}
        onClose={() => setScanPopup(null)}
        onClearMode={() => {
          setScanMode(null);
          setScanPopup(null);
        }}
      />

      <ConfirmPopup
        confirm={confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => {
          const action = confirmAction?.onConfirm;
          setConfirmAction(null);
          action?.();
        }}
      />

      <AddSpoolModal
        isOpen={isAddSpoolOpen}
        onClose={() => setIsAddSpoolOpen(false)}
        onSuccess={(spool) => {
          showToast('Đã thêm cuộn nhựa.');
          setIsAddSpoolOpen(false);
          fetchData(true);
          if (spool) {
            setSelectedSpoolForPrint(spool as EnrichedSpool);
            setAutoPrintSpool(true);
            setIsPrintBarcodeOpen(true);
          }
        }}
        selectedFilament={selectedFilamentForSpool}
        allSpools={allSpools}
        prefilledSpoolId={prefilledSpoolId}
        prefilledLocationId={prefilledLocationId}
      />
      <UpdateWeightModal
        isOpen={isUpdateWeightOpen}
        onClose={() => setIsUpdateWeightOpen(false)}
        onSuccess={() => {
          showToast('Đã cập nhật khối lượng.');
          setIsUpdateWeightOpen(false);
          fetchData(true);
        }}
        selectedSpool={selectedSpoolForWeight}
        globalScannedCode={globalScannedCode}
      />
      <EditSpoolModal
        isOpen={isEditSpoolOpen}
        onClose={() => setIsEditSpoolOpen(false)}
        onSuccess={() => {
          showToast('Đã cập nhật cuộn nhựa.');
          setIsEditSpoolOpen(false);
          fetchData(true);
        }}
        selectedSpool={selectedSpoolForEdit}
      />
      <PrintBarcodeModal
        isOpen={isPrintBarcodeOpen}
        onClose={() => {
          setIsPrintBarcodeOpen(false);
          setAutoPrintSpool(false);
        }}
        spool={selectedSpoolForPrint}
        autoPrint={autoPrintSpool}
      />
      <AddLocationModal
        isOpen={isAddLocationOpen}
        onClose={() => setIsAddLocationOpen(false)}
        onSuccess={() => {
          showToast('Đã thêm kho.');
          fetchData(true);
        }}
      />
      <ManageLocationModal
        isOpen={isManageLocationOpen}
        onClose={() => setIsManageLocationOpen(false)}
        location={locations.find((l) => l.id === selectedLocationForManage?.id) || selectedLocationForManage}
        onSuccess={() => fetchData(true)}
        onStartAssignSpool={(locationId) => {
          setIsManageLocationOpen(false);
          const location = locations.find((l) => l.id === locationId);
          if (location) {
            setScanMode({ type: 'location', id: location.id, name: location.name, action: 'add' });
            setScanPopup({
              type: 'location',
              title: location.name,
              subtitle: location.id,
              modeText: 'Đang Bật: Quét QR cuộn nhựa để đưa cuộn vào kho này.',
            });
          }
        }}
        onStartUnassignSpool={(locationId) => {
          setIsManageLocationOpen(false);
          const location = locations.find((l) => l.id === locationId);
          if (location) {
            setScanMode({ type: 'location', id: location.id, name: location.name, action: 'remove' });
            setScanPopup({
              type: 'location',
              title: location.name,
              subtitle: location.id,
              modeText: 'Đang Bật: Quét QR cuộn nhựa để đưa cuộn ra khỏi kho này.',
            });
          }
        }}
        onOpenPrintQR={openPrintForLocation}
      />
      <AddPrinterModal
        isOpen={isAddPrinterOpen}
        onClose={() => setIsAddPrinterOpen(false)}
        onSuccess={() => {
          showToast('Đã thêm máy in.');
          fetchData(true);
        }}
      />
      <ManagePrinterModal
        isOpen={isManagePrinterOpen}
        onClose={() => setIsManagePrinterOpen(false)}
        printer={printers.find((p) => p.id === selectedPrinterForManage?.id) || selectedPrinterForManage}
        onSuccess={() => fetchData(true)}
        onStartAssignSpool={(printerId) => {
          setIsManagePrinterOpen(false);
          const printer = printers.find((p) => p.id === printerId);
          if (printer) {
            setScanMode({ type: 'printer', id: printer.id, name: printer.name, action: 'add' });
            setScanPopup({
              type: 'printer',
              title: printer.name,
              subtitle: printer.id,
              modeText: 'Đang Bật: Quét QR cuộn nhựa để gắn cuộn vào máy này.',
            });
          }
        }}
        onStartUnassignSpool={(printerId) => {
          setIsManagePrinterOpen(false);
          const printer = printers.find((p) => p.id === printerId);
          if (printer) {
            setScanMode({ type: 'printer', id: printer.id, name: printer.name, action: 'remove' });
            setScanPopup({
              type: 'printer',
              title: printer.name,
              subtitle: printer.id,
              modeText: 'Đang Bật: Quét QR cuộn nhựa để tháo cuộn khỏi máy này.',
            });
          }
        }}
        onOpenPrintQR={openPrintForPrinter}
      />
      <ColorDetailModal
        isOpen={isColorDetailOpen}
        onClose={() => setIsColorDetailOpen(false)}
        colorName={selectedColorName}
        colorHex={selectedColorHex}
        spools={allSpools.filter((spool) => spool.filamentColorName === selectedColorName)}
        onPrintQR={openPrintForColor}
        onColorUpdated={(newHex: string) => {
          setSelectedColorHex(newHex);
          fetchData(true);
        }}
      />
      <ScaleCalibrationModal
        isOpen={isScaleCalibrationOpen}
        onClose={() => setIsScaleCalibrationOpen(false)}
        rawWeight={rawWeight}
        currentOffset={scaleOffset}
        onSaveOffset={(newOffset) => {
          setScaleOffset(newOffset);
          showToast('Đã lưu hiệu chuẩn cân.');
        }}
      />
      <EshopPickModal
        isOpen={!!eshopPickingOrder}
        onClose={() => setEshopPickingOrder(null)}
        order={eshopPickingOrder}
        scannedData={globalScannedCode}
      />
    </main>
  );
}

function getHueSortScore(hex: string | null) {
  if (!hex) return 2000;
  const cleanHex = hex.startsWith('#') ? hex : '#' + hex;
  let r = 0, g = 0, b = 0;
  if (cleanHex.length === 4) {
    r = parseInt(cleanHex[1] + cleanHex[1], 16);
    g = parseInt(cleanHex[2] + cleanHex[2], 16);
    b = parseInt(cleanHex[3] + cleanHex[3], 16);
  } else if (cleanHex.length === 7) {
    r = parseInt(cleanHex.substring(1, 3), 16);
    g = parseInt(cleanHex.substring(3, 5), 16);
    b = parseInt(cleanHex.substring(5, 7), 16);
  } else {
    return 2000;
  }
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  
  const hDeg = h * 360;
  const sPct = s * 100;
  const lPct = l * 100;
  
  // Grayscale colors (white, gray, black) put at the end, sorted by lightness
  if (sPct < 15 || lPct < 15 || lPct > 90) {
    return 1000 + (100 - lPct); 
  }
  
  return hDeg;
}

function FilamentsView({
  filaments,
  onAddSpool,
  onDelete,
  onOpenColor,
  onPrintAllColors,
}: {
  filaments: FilamentWithSpools[];
  onAddSpool: (filament: Filament) => void;
  onDelete: (id: string, name: string) => void;
  onOpenColor: (colorName: string, colorHex?: string | null) => void;
  onPrintAllColors: () => void;
}) {
  const [viewMode, setViewMode] = useState<'grid' | 'compact'>('grid');

  const sortedFilaments = useMemo(() => {
    return [...filaments].sort((a, b) => {
      return getHueSortScore(a.colorHex) - getHueSortScore(b.colorHex);
    });
  }, [filaments]);

  const colorCount = new Set(sortedFilaments.map((f) => f.colorName.toUpperCase())).size;
  
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
          {sortedFilaments.length} loại nhựa — {colorCount} mã màu
        </p>
        <div className="flex items-center gap-3">
          <div className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`h-full rounded-md px-3 text-xs font-semibold transition-colors ${
                viewMode === 'grid'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              Thẻ Lớn
            </button>
            <button
              type="button"
              onClick={() => setViewMode('compact')}
              className={`h-full rounded-md px-3 text-xs font-semibold transition-colors ${
                viewMode === 'compact'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              Thẻ Nhỏ
            </button>
          </div>
          <button
            type="button"
            onClick={onPrintAllColors}
            disabled={colorCount === 0}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            title="Gửi lệnh in tem CLR- cho tất cả mã màu đang hiển thị"
          >
            <Printer size={16} />
            In tất cả
          </button>
        </div>
      </div>
      
      <div className={viewMode === 'grid' ? "grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5" : "grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"}>
      {sortedFilaments.map((filament) => {
        const totalRemaining = filament.spools.reduce((sum, spool) => sum + spool.remainingWeightG, 0);
        
        if (viewMode === 'compact') {
          return (
            <div key={filament.id} className="group flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition-all hover:shadow-md dark:border-slate-800 dark:bg-[#111827] dark:hover:border-slate-700">
              <button type="button" onClick={() => onOpenColor(filament.colorName, filament.colorHex)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <span className="size-12 shrink-0 rounded-full border border-slate-200 shadow-inner dark:border-slate-700" style={{ backgroundColor: filament.colorHex || '#4f46e5' }} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold">{filament.colorName}</span>
                  <span className="block truncate text-xs text-slate-500">{filament.brand || 'No brand'} {filament.type}</span>
                  <span className="mt-0.5 block text-xs font-semibold text-indigo-600 dark:text-indigo-400">{filament.spools.length} cuộn — {totalRemaining.toLocaleString('vi-VN')}g</span>
                </span>
              </button>
              <div className="flex flex-col gap-2">
                <button type="button" onClick={() => onAddSpool(filament)} className="rounded-lg bg-indigo-50 p-2 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-400 dark:hover:bg-indigo-900/50">
                  <Plus size={14} />
                </button>
                <button type="button" onClick={() => onDelete(filament.id, filament.colorName)} className="rounded-lg p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        }

        return (
          <div key={filament.id} className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg dark:border-slate-800 dark:bg-[#111827] dark:hover:border-slate-700">
            {/* Header màu (Paint swatch style) */}
            <div 
              className="h-24 w-full cursor-pointer transition-transform group-hover:scale-105" 
              style={{ backgroundColor: filament.colorHex || '#4f46e5' }}
              onClick={() => onOpenColor(filament.colorName, filament.colorHex)}
            >
              <div className="h-full w-full bg-gradient-to-b from-white/10 to-black/10" />
            </div>
            
            <div className="relative flex-1 p-5">
              <button 
                type="button" 
                onClick={() => onDelete(filament.id, filament.colorName)} 
                className="absolute right-4 top-[-20px] flex size-10 items-center justify-center rounded-full bg-white text-red-500 shadow-md transition-transform hover:scale-110 hover:bg-red-50 dark:bg-slate-800 dark:hover:bg-slate-700"
                title="Xóa loại nhựa"
              >
                <Trash2 size={18} />
              </button>

              <div className="mb-4 pr-6">
                <h3 className="line-clamp-1 text-lg font-bold text-slate-800 dark:text-slate-100" title={filament.colorName}>{filament.colorName}</h3>
                <p className="line-clamp-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{filament.brand || 'No brand'} • {filament.type}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-slate-50 p-3 text-center dark:bg-slate-800/50">
                  <p className="text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">Số cuộn</p>
                  <p className="mt-1 text-xl font-bold text-slate-700 dark:text-slate-200">{filament.spools.length}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 text-center dark:bg-slate-800/50">
                  <p className="text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">Khối lượng</p>
                  <p className="mt-1 text-lg font-bold text-indigo-600 dark:text-indigo-400">{totalRemaining >= 1000 ? (totalRemaining / 1000).toFixed(1) + 'kg' : totalRemaining + 'g'}</p>
                </div>
              </div>

              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  onClick={() => onOpenColor(filament.colorName, filament.colorHex)}
                  className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-bold uppercase tracking-wider text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                >
                  Chi tiết
                </button>
                <button
                  type="button"
                  onClick={() => onAddSpool(filament)}
                  className="flex flex-[1.5] items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-indigo-700"
                >
                  <Plus size={16} />
                  Nhập kho
                </button>
              </div>
            </div>
          </div>
        );
      })}
        {sortedFilaments.length === 0 && <div className="col-span-full"><EmptyState text="Chưa có loại nhựa phù hợp." /></div>}
      </div>
    </div>
  );
}

function SpoolsView({
  spools,
  onUpdate,
  onEdit,
  onPrint,
  onDelete,
}: {
  spools: EnrichedSpool[];
  onUpdate: (spool: EnrichedSpool) => void;
  onEdit: (spool: EnrichedSpool) => void;
  onPrint: (spool: EnrichedSpool) => void;
  onDelete: (id: string) => void;
}) {
  const [sortAsc, setSortAsc] = useState(true);

  const sortedSpools = useMemo(() => {
    return [...spools].sort((a, b) => {
      return sortAsc 
        ? a.remainingWeightG - b.remainingWeightG 
        : b.remainingWeightG - a.remainingWeightG;
    });
  }, [spools, sortAsc]);

  const getRowColorClass = (weight: number) => {
    if (weight <= 150) return 'bg-red-50 hover:bg-red-100 dark:bg-red-500/20 dark:hover:bg-red-500/30';
    if (weight <= 330) return 'bg-amber-50 hover:bg-amber-100 dark:bg-amber-500/20 dark:hover:bg-amber-500/30';
    return 'hover:bg-slate-50 dark:hover:bg-slate-900/60';
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#111827]">
      <div className="overflow-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
          <thead className="bg-slate-100 text-left text-xs font-semibold uppercase text-slate-500 dark:bg-slate-900">
            <tr>
              <th className="px-4 py-3">Cuộn</th>
              <th className="px-4 py-3">Vật liệu</th>
              <th className="px-4 py-3">Màu</th>
              <th 
                className="cursor-pointer px-4 py-3 text-right hover:bg-slate-200 dark:hover:bg-slate-800"
                onClick={() => setSortAsc(!sortAsc)}
                title="Nhấn để đảo chiều sắp xếp"
              >
                Còn lại {sortAsc ? '↑' : '↓'}
              </th>
              <th className="px-4 py-3">Vị trí</th>
              <th className="px-4 py-3">Trạng thái</th>
              <th className="px-4 py-3 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {sortedSpools.map((spool) => (
              <tr key={spool.id} className={`transition-colors ${getRowColorClass(spool.remainingWeightG)}`}>
                <td className="px-4 py-3 font-mono font-semibold">{spool.id}</td>
                <td className="px-4 py-3">{spool.filamentBrand || ''} {spool.filamentType}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-2">
                    <span className="size-4 rounded-full border border-slate-300" style={{ backgroundColor: spool.filamentColorHex || '#4f46e5' }} />
                    {spool.filamentColorName}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-semibold">{spool.remainingWeightG.toLocaleString('vi-VN')}g</td>
                <td className="px-4 py-3">
                  {spool.locationName ? (
                    <span className="inline-flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400">
                      <Archive size={14} />
                      <span className="max-w-[120px] truncate" title={spool.locationName}>{spool.locationName}</span>
                    </span>
                  ) : spool.printerName ? (
                    <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                      <Printer size={14} />
                      <span className="max-w-[120px] truncate" title={spool.printerName}>{spool.printerName}</span>
                    </span>
                  ) : (
                    <span className="text-slate-400">-</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">{spool.status}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <IconButton label="Cân" onClick={() => onUpdate(spool)} icon={<Scale size={16} />} />
                    <IconButton label="Sửa" onClick={() => onEdit(spool)} icon={<Edit2 size={16} />} />
                    <IconButton label="In QR" onClick={() => onPrint(spool)} icon={<QrCode size={16} />} />
                    <IconButton label="Xóa" onClick={() => onDelete(spool.id)} icon={<Trash2 size={16} />} danger />
                  </div>
                </td>
              </tr>
            ))}
            {spools.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <EmptyState text="Chưa có cuộn nhựa phù hợp." />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LocationsView({
  locations,
  onAdd,
  onManage,
  onPrint,
}: {
  locations: LocationItem[];
  onAdd: () => void;
  onManage: (location: LocationItem) => void;
  onPrint: (location: LocationItem) => void;
}) {
  return (
    <div className="space-y-4">
      <button type="button" onClick={onAdd} className="inline-flex h-10 items-center gap-2 rounded-lg bg-indigo-600 px-3 text-sm font-semibold text-white">
        <Plus size={16} />
        Thêm kho
      </button>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {locations.map((location) => (
          <div key={location.id} className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#111827]">
            <FolderOpen className="mb-3 text-indigo-400" size={24} />
            <h3 className="font-bold">{location.name}</h3>
            <p className="font-mono text-sm text-slate-500">{location.id}</p>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => onManage(location)} className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold dark:border-slate-700">Quản lý</button>
              <button type="button" onClick={() => onPrint(location)} className="rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700"><QrCode size={16} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PrintersView({
  printers,
  liveStatuses,
  onAdd,
  onManage,
  onPrint,
}: {
  printers: PrinterItem[];
  liveStatuses: Record<string, unknown>;
  onAdd: () => void;
  onManage: (printer: PrinterItem) => void;
  onPrint: (printer: PrinterItem) => void;
}) {
  const [viewMode, setViewMode] = useState<'grid2' | 'grid3' | 'grid4' | 'list'>('grid4');
  const gridClass =
    viewMode === 'grid4'
      ? 'grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
      : viewMode === 'grid3'
        ? 'grid gap-4 md:grid-cols-2 2xl:grid-cols-3'
        : viewMode === 'list'
          ? 'grid gap-3'
          : 'grid gap-4 xl:grid-cols-2';

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onAdd} className="inline-flex h-10 items-center gap-2 rounded-lg bg-indigo-600 px-3 text-sm font-semibold text-white">
            <Plus size={16} />
            Thêm máy in
          </button>
        </div>
        <div className="inline-flex w-fit rounded-lg border border-slate-300 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
          {[
            { key: 'grid2' as const, label: 'Lưới 2x2' },
            { key: 'grid3' as const, label: 'Lưới rộng' },
            { key: 'grid4' as const, label: 'Lưới x4' },
            { key: 'list' as const, label: 'Danh sách' },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setViewMode(item.key)}
              className={`h-8 rounded-md px-3 text-xs font-semibold transition-colors ${
                viewMode === item.key
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className={gridClass}>
        {printers.map((printer) =>
          printer.cloudAccountId ? (
            <CloudPrinterCard key={printer.id} printer={printer} liveStatus={liveStatuses[printer.id]} onOpenQR={onPrint} onManage={onManage} />
          ) : (
            <div key={printer.id} className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#111827]">
              <Printer className="mb-3 text-indigo-400" size={24} />
              <h3 className="font-bold">{printer.name}</h3>
              <p className="font-mono text-sm text-slate-500">{printer.id}</p>
              <p className="text-sm text-slate-500">{printer.model || 'Chưa có model'}</p>
              <div className="mt-4 flex gap-2">
                <button type="button" onClick={() => onManage(printer)} className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold dark:border-slate-700">Quản lý</button>
                <button type="button" onClick={() => onPrint(printer)} className="rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700"><QrCode size={16} /></button>
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-100 p-3 dark:bg-slate-900">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="font-bold">{value}</p>
    </div>
  );
}

function IconButton({ label, icon, onClick, danger = false }: { label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={`flex size-9 items-center justify-center rounded-lg border ${
        danger
          ? 'border-red-200 text-red-500 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/40'
          : 'border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
      }`}
    >
      {icon}
    </button>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
      <CheckCircle2 className="mb-2" size={24} />
      {text}
    </div>
  );
}

function ScanInfoPopup({
  popup,
  mode,
  onClose,
  onClearMode,
}: {
  popup: ScanPopup | null;
  mode: ScanMode;
  onClose: () => void;
  onClearMode: () => void;
}) {
  if (!popup) return null;

  const toneClass =
    popup.type === 'action' && popup.tone === 'error'
      ? 'border-red-500/30 bg-red-950/30 text-red-100'
      : popup.type === 'action' && popup.tone === 'success'
        ? 'border-emerald-500/30 bg-emerald-950/30 text-emerald-100'
        : 'border-slate-700 bg-[#0f1729] text-slate-100';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        className={`w-full max-w-lg rounded-2xl border p-5 shadow-2xl ${toneClass}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-300">Thông tin mã quét</p>
            <h3 className="mt-1 text-2xl font-bold">{popup.title}</h3>
            <p className="mt-1 break-all font-mono text-sm text-slate-400">{popup.subtitle}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Đóng popup">
            <X size={18} />
          </button>
        </div>

        {'modeText' in popup && popup.modeText && (
          <div className="mt-4 rounded-xl border border-indigo-500/20 bg-indigo-500/10 p-3 text-sm font-semibold text-indigo-100">
            {popup.modeText}
          </div>
        )}

        {popup.type === 'spool' && (
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <InfoBox label="Vật liệu" value={popup.spool.filamentType} />
            <InfoBox label="Màu" value={popup.spool.filamentColorName} />
            <InfoBox label="Còn lại" value={`${popup.spool.remainingWeightG.toLocaleString('vi-VN')}g`} />
            <InfoBox label="Trạng thái" value={popup.spool.status} />
          </div>
        )}

        {mode && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-950/60 p-3">
            <div className="text-sm">
              <p className="font-semibold">
                Đang ở mode {mode.action === 'add' ? 'thêm' : 'xóa'} cho {mode.type === 'location' ? 'kho' : 'máy in'}: {mode.name}
              </p>
              <p className="text-xs text-slate-400">Quét QR cuộn nhựa để thực hiện thao tác.</p>
            </div>
            <button type="button" onClick={onClearMode} className="shrink-0 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold hover:bg-slate-800">
              Thoát mode
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ConfirmPopup({
  confirm,
  onClose,
  onConfirm,
}: {
  confirm: { title: string; message: string; onConfirm: () => void } | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!confirm) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-[#0f1729] p-5 text-slate-100 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-bold">{confirm.title}</h3>
            <p className="mt-2 text-sm text-slate-300">{confirm.message}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Đóng xác nhận">
            <X size={18} />
          </button>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold hover:bg-slate-800">
            Hủy
          </button>
          <button type="button" onClick={onConfirm} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500">
            Xác nhận
          </button>
        </div>
      </div>
    </div>
  );
}
