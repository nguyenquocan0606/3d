'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, Database, ShoppingBag, Wifi, Tag } from 'lucide-react';
import type {
  KetQuaCanhBao,
  KetQuaTongQuan,
  KetQuaXuHuong,
  KetQuaHoatDong,
} from '@/types/dashboard.types';

import KhoiCanhBao from './khoi-canh-bao';
import KhoiKpi from './khoi-kpi';
import KhoiSanXuat from './khoi-san-xuat';
import KhoiMayIn from './khoi-may-in';
import KhoiXuHuong from './khoi-xu-huong';
import KhoiHoatDong from './khoi-hoat-dong';

// Dashboard Tổng quan mới — thay thế bảng 5 ô số cũ
// Ba tầng theo §2.1: Cần xử lý ngay → Đang diễn ra → Xu hướng
//
// Chu kỳ làm mới (§8.4):
//   canh-bao  : 30s
//   tong-quan : 60s
//   xu-huong  : 5 phút
// Tất cả dừng khi document.hidden để tiết kiệm tài nguyên

type KyFilter = 'today' | '7d' | '30d';

interface DashboardTabProps {
  setActiveTab: (tab: string) => void;
}

const KY_NHAN: Record<KyFilter, string> = {
  today: 'Hôm nay',
  '7d': '7 ngày',
  '30d': '30 ngày',
};

export default function DashboardTab({ setActiveTab }: DashboardTabProps) {
  const [ky, setKy] = useState<KyFilter>('today');

  // Dữ liệu từng endpoint
  const [canhBao, setCanhBao] = useState<KetQuaCanhBao | null>(null);
  const [tongQuan, setTongQuan] = useState<KetQuaTongQuan | null>(null);
  const [xuHuong, setXuHuong] = useState<KetQuaXuHuong | null>(null);
  const [hoatDong, setHoatDong] = useState<KetQuaHoatDong | null>(null);

  // Trạng thái tải riêng cho từng nhóm
  const [loadingCanhBao, setLoadingCanhBao] = useState(true);
  const [loadingTongQuan, setLoadingTongQuan] = useState(true);
  const [loadingXuHuong, setLoadingXuHuong] = useState(true);
  const [loadingHoatDong, setLoadingHoatDong] = useState(true);

  // Lưu thời điểm làm mới gần nhất trong ref để tính "Xs trước" không trigger rerender
  const luLamMoiRef = useRef<Date | null>(null);
  // giayTuLuc: cập nhật mỗi giây qua state riêng, tránh gọi Date.now() trong render
  const [giayTuLuc, setGiayTuLuc] = useState<number | null>(null);

  // ref giữ interval id để cleanup đúng cách — tránh chồng vòng poll
  const intCanhBao = useRef<ReturnType<typeof setInterval> | null>(null);
  const intTongQuan = useRef<ReturnType<typeof setInterval> | null>(null);
  const intXuHuong = useRef<ReturnType<typeof setInterval> | null>(null);
  const intHoatDong = useRef<ReturnType<typeof setInterval> | null>(null);
  const intDongHo = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Đồng hồ cập nhật "Xs trước" ──────────────────────────

  // Đặt trong effect riêng để tách biệt với các fetch
  useEffect(() => {
    intDongHo.current = setInterval(() => {
      if (luLamMoiRef.current) {
        setGiayTuLuc(Math.round((Date.now() - luLamMoiRef.current.getTime()) / 1000));
      }
    }, 1000);
    return () => {
      if (intDongHo.current) clearInterval(intDongHo.current);
    };
  }, []);

  // ── Fetch functions ──────────────────────────────────────

  const fetchCanhBao = useCallback(async () => {
    if (document.hidden) return;
    try {
      const res = await fetch('/api/dashboard/canh-bao');
      const json = await res.json();
      if (json.status === 'success') setCanhBao(json.data as KetQuaCanhBao);
    } catch {
      // Giữ data cũ, không xóa
    } finally {
      setLoadingCanhBao(false);
    }
  }, []);

  const fetchTongQuan = useCallback(async (range: KyFilter) => {
    if (document.hidden) return;
    try {
      const res = await fetch(`/api/dashboard/tong-quan?range=${range}`);
      const json = await res.json();
      if (json.status === 'success') setTongQuan(json.data as KetQuaTongQuan);
    } catch {
      // Giữ data cũ
    } finally {
      setLoadingTongQuan(false);
    }
  }, []);

  const fetchXuHuong = useCallback(async () => {
    if (document.hidden) return;
    try {
      const res = await fetch('/api/dashboard/xu-huong?days=30');
      const json = await res.json();
      if (json.status === 'success') setXuHuong(json.data as KetQuaXuHuong);
    } catch {
      // Giữ data cũ
    } finally {
      setLoadingXuHuong(false);
    }
  }, []);

  const fetchHoatDong = useCallback(async () => {
    if (document.hidden) return;
    try {
      const res = await fetch('/api/dashboard/hoat-dong?limit=30');
      const json = await res.json();
      if (json.status === 'success') setHoatDong(json.data as KetQuaHoatDong);
    } catch {
      // Giữ data cũ
    } finally {
      setLoadingHoatDong(false);
    }
  }, []);

  // Dừng hết interval
  const dungInterval = useCallback(() => {
    if (intCanhBao.current) clearInterval(intCanhBao.current);
    if (intTongQuan.current) clearInterval(intTongQuan.current);
    if (intXuHuong.current) clearInterval(intXuHuong.current);
    if (intHoatDong.current) clearInterval(intHoatDong.current);
  }, []);

  const khoiDongInterval = useCallback(
    (range: KyFilter) => {
      dungInterval();
      // canh-bao 30s
      intCanhBao.current = setInterval(() => void fetchCanhBao(), 30_000);
      // tong-quan 60s
      intTongQuan.current = setInterval(() => void fetchTongQuan(range), 60_000);
      // xu-huong 5 phút
      intXuHuong.current = setInterval(() => void fetchXuHuong(), 300_000);
      // hoat-dong 60s
      intHoatDong.current = setInterval(() => void fetchHoatDong(), 60_000);
    },
    [dungInterval, fetchCanhBao, fetchTongQuan, fetchXuHuong, fetchHoatDong],
  );

  // ── Khởi động khi mount ───────────────────────────────────
  // queueMicrotask: tránh setState đồng bộ ngay trong thân effect (quy ước repo)

  useEffect(() => {
    queueMicrotask(() => {
      void fetchCanhBao();
      void fetchTongQuan(ky);
      void fetchXuHuong();
      void fetchHoatDong();
      luLamMoiRef.current = new Date();
    });
    khoiDongInterval(ky);

    // Dừng khi tab ẩn, tiếp tục khi tab hiện
    const handleVisibility = () => {
      if (document.hidden) {
        dungInterval();
      } else {
        queueMicrotask(() => {
          void fetchCanhBao();
          void fetchTongQuan(ky);
          luLamMoiRef.current = new Date();
        });
        khoiDongInterval(ky);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      dungInterval();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Đổi kỳ → fetch lại tong-quan ngay ──────────────────────

  const doiKy = (kyMoi: KyFilter) => {
    setKy(kyMoi);
    setLoadingTongQuan(true);
    void fetchTongQuan(kyMoi);
    // Restart interval với range mới
    if (intTongQuan.current) clearInterval(intTongQuan.current);
    intTongQuan.current = setInterval(() => void fetchTongQuan(kyMoi), 60_000);
  };

  // Làm mới thủ công
  const lamMoiThuCong = () => {
    queueMicrotask(() => {
      void fetchCanhBao();
      void fetchTongQuan(ky);
      void fetchXuHuong();
      void fetchHoatDong();
      luLamMoiRef.current = new Date();
      setGiayTuLuc(0);
    });
  };

  // Tóm tắt cảnh báo cho header
  const tongLoi = canhBao?.tongTheoMuc.loi ?? 0;
  const tongCanhBao = canhBao?.tongTheoMuc.canhBao ?? 0;

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">

      {/* ── Header: bộ lọc kỳ + nút làm mới + tóm tắt cảnh báo ─── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Bộ lọc kỳ */}
        <div className="flex rounded-xl border border-slate-700 bg-slate-900/50 p-1 gap-1">
          {(Object.keys(KY_NHAN) as KyFilter[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => doiKy(k)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                ky === k
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {KY_NHAN[k]}
            </button>
          ))}
        </div>

        {/* Thời gian làm mới */}
        {giayTuLuc !== null && (
          <span className="text-xs text-slate-600">
            cập nhật {giayTuLuc}s trước
          </span>
        )}

        {/* Tóm tắt cảnh báo */}
        {(tongLoi > 0 || tongCanhBao > 0) && (
          <div className="flex items-center gap-2 ml-auto">
            {tongLoi > 0 && (
              <span className="rounded-full bg-red-500/20 px-2.5 py-1 text-xs font-bold text-red-400">
                ● {tongLoi} lỗi
              </span>
            )}
            {tongCanhBao > 0 && (
              <span className="rounded-full bg-amber-500/20 px-2.5 py-1 text-xs font-bold text-amber-400">
                ▲ {tongCanhBao} cảnh báo
              </span>
            )}
          </div>
        )}

        {/* Nút làm mới thủ công */}
        <button
          type="button"
          onClick={lamMoiThuCong}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors"
          title="Làm mới tất cả"
        >
          <RefreshCw size={13} />
          Làm mới
        </button>
      </div>

      {/* ── Tầng 1: Cảnh báo ─────────────────────────────────── */}
      {!loadingCanhBao && canhBao && canhBao.canhBao.length > 0 && (
        <KhoiCanhBao
          canhBao={canhBao.canhBao}
          tinhLuc={canhBao.tinhLuc}
          setActiveTab={setActiveTab}
        />
      )}

      {/* ── Tầng 2a: KPI lưới 6 ô ────────────────────────────── */}
      <KhoiKpi
        data={tongQuan}
        loading={loadingTongQuan}
        setActiveTab={setActiveTab}
      />

      {/* ── Tầng 2b: Đang sản xuất + Feed hoạt động ─────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Cột trái: Sản xuất + Máy in (7 cột) */}
        <div className="xl:col-span-7 space-y-6">
          <KhungKhoi tieu_de="Đang sản xuất" icon={<ShoppingBag size={14} />}>
            <KhoiSanXuat
              data={tongQuan?.sanXuatSLL ?? null}
              loading={loadingTongQuan}
              setActiveTab={setActiveTab}
            />
          </KhungKhoi>

          <KhungKhoi tieu_de="Máy in" icon={<Wifi size={14} />}>
            <KhoiMayIn setActiveTab={setActiveTab} />
          </KhungKhoi>
        </div>

        {/* Cột phải: Feed hoạt động (5 cột) */}
        <div className="xl:col-span-5">
          <KhungKhoi tieu_de="Hoạt động gần đây" icon={<Tag size={14} />}>
            <KhoiHoatDong
              data={hoatDong}
              loading={loadingHoatDong}
              setActiveTab={setActiveTab}
            />
          </KhungKhoi>
        </div>
      </div>

      {/* ── Tầng 3: Xu hướng 30 ngày ─────────────────────────── */}
      <KhungKhoi tieu_de="Xu hướng 30 ngày" icon={<Database size={14} />}>
        <KhoiXuHuong
          data={xuHuong}
          loading={loadingXuHuong}
          setActiveTab={setActiveTab}
        />
      </KhungKhoi>

      {/* ── Tồn kho & Hạ tầng ────────────────────────────────── */}
      {tongQuan && !loadingTongQuan && (
        <KhungKhoi tieu_de="Tồn kho & Hạ tầng" icon={<Database size={14} />}>
          <TonKhoHaTang data={tongQuan} setActiveTab={setActiveTab} />
        </KhungKhoi>
      )}
    </div>
  );
}

// ── Khung wrapper nhỏ gọn ────────────────────────────────────────

function KhungKhoi({
  tieu_de,
  icon,
  children,
}: {
  tieu_de: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-800/60 bg-[#0d1526]/60 p-5">
      <div className="mb-4 flex items-center gap-2">
        {icon && <span className="text-indigo-400">{icon}</span>}
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          {tieu_de}
        </h3>
      </div>
      {children}
    </div>
  );
}

// ── Khối tồn kho & hạ tầng ───────────────────────────────────────

function TonKhoHaTang({
  data,
  setActiveTab,
}: {
  data: KetQuaTongQuan;
  setActiveTab: (tab: string) => void;
}) {
  const { nhua, kho, hangHoa, eshop, haTang, sanXuatTheoCon } = data;

  const dinhDangTien = (v: number) =>
    v.toLocaleString('vi-VN', { maximumFractionDigits: 0 });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">

      {/* Nhựa theo loại */}
      {nhua && (
        <button
          type="button"
          onClick={() => setActiveTab('spools')}
          className="rounded-2xl border border-slate-800/60 bg-[#111827] p-4 text-left transition-colors hover:border-indigo-500/20 w-full"
        >
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Nhựa theo loại</p>
          {nhua.theoLoai.map((l) => (
            <div key={l.ten} className="flex justify-between text-xs py-0.5">
              <span className="text-slate-300">{l.ten}</span>
              <span className="font-bold text-white">{l.kg.toFixed(1)} kg</span>
            </div>
          ))}
          {nhua.chuaGanCho > 0 && (
            <p className="mt-2 text-xs text-slate-500">
              {nhua.chuaGanCho} cuộn chưa gán chỗ
            </p>
          )}
        </button>
      )}

      {/* Kho & kiểm kho */}
      {kho && (
        <button
          type="button"
          onClick={() => setActiveTab('locations')}
          className="rounded-2xl border border-slate-800/60 bg-[#111827] p-4 text-left transition-colors hover:border-indigo-500/20 w-full"
        >
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Kho & Kiểm kho</p>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-300">Ô kho</span>
              <span className="font-bold text-white">
                {kho.soO} ({kho.oTrong} trống)
              </span>
            </div>
            {kho.phienKiemKho && (
              <>
                <div className="flex justify-between">
                  <span className="text-slate-300">Phiên kiểm kho</span>
                  <span className="font-bold text-amber-400">Đang mở</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-300">Đã quét</span>
                  <span className="font-bold text-white">
                    {kho.phienKiemKho.daQuet}/{kho.phienKiemKho.tong}
                  </span>
                </div>
              </>
            )}
          </div>
        </button>
      )}

      {/* Hàng hóa */}
      {hangHoa && (
        <button
          type="button"
          onClick={() => window.open('/hang-hoa-cua-hang', '_blank')}
          className="rounded-2xl border border-slate-800/60 bg-[#111827] p-4 text-left transition-colors hover:border-indigo-500/20 w-full"
        >
          <p className="mb-2 flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-slate-400">
            Hàng hóa
            <span
              title="Giá trị tồn dựa trên giá vốn/bán lẻ nhập tay — chưa kiểm chứng với thực tế"
              className="cursor-help text-amber-400"
            >
              ⓘ
            </span>
          </p>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-300">Mặt hàng</span>
              <span className="font-bold text-white">{hangHoa.soMatHang}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-300">Dưới ngưỡng</span>
              <span className="font-bold text-amber-400">{hangHoa.duoiNguong}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-300">Hết hàng</span>
              <span className={`font-bold ${hangHoa.hetHang > 0 ? 'text-red-400' : 'text-white'}`}>
                {hangHoa.hetHang}
              </span>
            </div>
            <div className="flex justify-between pt-1 border-t border-slate-800">
              <span className="text-slate-400">Tồn (giá vốn)</span>
              <span className="font-bold text-white">
                {dinhDangTien(hangHoa.giaTriTonGiaVon)}₫
              </span>
            </div>
          </div>
        </button>
      )}

      {/* Hạ tầng */}
      {haTang && (
        <div className="rounded-2xl border border-slate-800/60 bg-[#111827] p-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Hạ tầng</p>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-300">Tem đã in</span>
              <span className="font-bold text-white">
                {(haTang.tem.completed ?? 0).toLocaleString('vi-VN')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-300">Thao tác app</span>
              <span className="font-bold text-white">
                {haTang.thaoTacApp24h.applied}
                {haTang.thaoTacApp24h.rejected > 0 && (
                  <span className="ml-1 text-red-400">
                    ({haTang.thaoTacApp24h.rejected} từ chối)
                  </span>
                )}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-300">Thiết bị push</span>
              <span className={`font-bold ${haTang.thietBiPush === 0 ? 'text-amber-400' : 'text-white'}`}>
                {haTang.thietBiPush}
              </span>
            </div>
            {haTang.zaloChuaDoc > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab('zalo')}
                className="flex w-full justify-between pt-1"
              >
                <span className="text-slate-300">Zalo chưa đọc</span>
                <span className="font-bold text-amber-400">{haTang.zaloChuaDoc}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Sản xuất theo con */}
      {sanXuatTheoCon && (
        <button
          type="button"
          onClick={() => setActiveTab('production')}
          className="rounded-2xl border border-slate-800/60 bg-[#111827] p-4 text-left transition-colors hover:border-indigo-500/20 w-full"
        >
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Sản xuất theo con</p>
          <div className="space-y-1 text-xs">
            {Object.entries(sanXuatTheoCon.mieng).map(([tt, so]) => (
              <div key={tt} className="flex justify-between">
                <span className="text-slate-300 capitalize">{tt}</span>
                <span className="font-bold text-white">{Number(so).toLocaleString('vi-VN')}</span>
              </div>
            ))}
            {sanXuatTheoCon.chuaXepMam > 0 && (
              <div className="flex justify-between pt-1 border-t border-slate-800">
                <span className="text-slate-300">Chưa xếp mâm</span>
                <span className="font-bold text-amber-400">{sanXuatTheoCon.chuaXepMam}</span>
              </div>
            )}
          </div>
        </button>
      )}

      {/* eShop cần in bổ sung */}
      {eshop && eshop.canInBoSung.length > 0 && (
        <button
          type="button"
          onClick={() => setActiveTab('eshop')}
          className="rounded-2xl border border-amber-500/20 bg-amber-950/10 p-4 text-left transition-colors hover:border-amber-500/40 w-full"
        >
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-amber-400">
            SKU bán chạy sắp hết → cần in bổ sung
          </p>
          <div className="space-y-1 text-xs">
            {eshop.canInBoSung.slice(0, 4).map((s) => (
              <div key={s.sku} className="flex justify-between">
                <span className="truncate text-slate-300">{s.ten}</span>
                <span className="shrink-0 font-bold text-white">còn {s.ton}</span>
              </div>
            ))}
          </div>
        </button>
      )}
    </div>
  );
}
