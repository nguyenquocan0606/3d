'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import * as THREE from 'three';
import {
  AlertCircle,
  ArrowLeft,
  Copy,
  Move,
  RotateCw,
  Trash2,
  Upload,
} from 'lucide-react';
import { duoiFileHopLe, kichThuocTuGeometry, loadGeometryFromFile, tinhTheTichMm3 } from '@/utils/mesh-volume';
import type { ModelInstance } from './model-viewer';

const ModelViewer = dynamic(() => import('./model-viewer'), { ssr: false });

// Bambu X1C mặc định khi máy in chưa khai buildVolume* — 256×256×256mm.
const PLATE_MAC_DINH = 256;

type Printer = {
  id: string;
  name: string;
  buildVolumeXMm: number | null;
  buildVolumeYMm: number | null;
  buildVolumeZMm: number | null;
};

type PeiSheet = { id: string; name: string; printerId: string | null; plateType: string | null };

type Filament = { id: string; type: string; colorName: string; colorHex: string | null; costPerKg: number | null };

type QuoteResult = {
  id: string;
  weightG: number;
  timeMinutes: number;
  giaVon: number;
  gia: number;
  giaBanLe: number;
  giaKhuyenMai: number;
};

const LAYER_HEIGHT_OPTIONS = [0.08, 0.12, 0.16, 0.2, 0.28];

function formatVnd(n: number): string {
  return n.toLocaleString('vi-VN') + 'đ';
}

function taoInstanceMoi(): ModelInstance {
  return { id: crypto.randomUUID(), x: 0, z: 0, rotationY: 0 };
}

export default function BaoGiaTab() {
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [peiSheets, setPeiSheets] = useState<PeiSheet[]>([]);
  const [filaments, setFilaments] = useState<Filament[]>([]);

  const [fileName, setFileName] = useState('');
  const [rawFile, setRawFile] = useState<File | null>(null);
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [baseVolumeCm3, setBaseVolumeCm3] = useState(0);
  const [kichThuocMm, setKichThuocMm] = useState<{ x: number; y: number; z: number } | null>(null);
  const [loadError, setLoadError] = useState('');

  const [instances, setInstances] = useState<ModelInstance[]>([taoInstanceMoi()]);
  const [selectedId, setSelectedId] = useState('');
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate'>('translate');
  const [scalePercent, setScalePercent] = useState(100);

  const [printerId, setPrinterId] = useState('');
  const [peiSheetId, setPeiSheetId] = useState('');
  const [filamentId, setFilamentId] = useState('');
  const [infillPercent, setInfillPercent] = useState(15);
  const [layerHeightMm, setLayerHeightMm] = useState(0.2);

  const [dangTinh, setDangTinh] = useState(false);
  const [ketQua, setKetQua] = useState<QuoteResult | null>(null);
  const [loi, setLoi] = useState('');

  const [dangSlice, setDangSlice] = useState(false);
  const [sliceTrangThai, setSliceTrangThai] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('/api/printers').then((r) => r.json()),
      fetch('/api/pei-sheets').then((r) => r.json()),
      fetch('/api/filaments').then((r) => r.json()),
    ]).then(([p, pei, fil]) => {
      if (p?.status === 'success') setPrinters(p.data);
      if (pei?.status === 'success') setPeiSheets(pei.data);
      if (fil?.status === 'success') setFilaments(fil.data);
    });
  }, []);

  const selectedPrinter = useMemo(() => printers.find((p) => p.id === printerId), [printers, printerId]);
  const peiSheetsCuaMay = useMemo(
    () => peiSheets.filter((s) => !printerId || s.printerId === printerId),
    [peiSheets, printerId],
  );

  const plateWidthMm = selectedPrinter?.buildVolumeXMm || PLATE_MAC_DINH;
  const plateDepthMm = selectedPrinter?.buildVolumeZMm || PLATE_MAC_DINH;

  const handleFile = useCallback(async (file: File) => {
    setLoadError('');
    setKetQua(null);
    if (!duoiFileHopLe(file.name)) {
      setLoadError('Chỉ hỗ trợ file .stl hoặc .3mf');
      return;
    }
    try {
      const geo = await loadGeometryFromFile(file);
      setGeometry(geo);
      setBaseVolumeCm3(tinhTheTichMm3(geo) / 1000);
      setKichThuocMm(kichThuocTuGeometry(geo));
      setFileName(file.name);
      setRawFile(file);
      setInstances([taoInstanceMoi()]);
      setSelectedId('');
      setScalePercent(100);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Không đọc được file');
    }
  }, []);

  const themBanSao = useCallback(() => {
    setInstances((prev) => {
      const cuoi = prev[prev.length - 1];
      const lechX = ((kichThuocMm?.x || 40) * scalePercent) / 100 + 10;
      return [...prev, { id: crypto.randomUUID(), x: (cuoi?.x || 0) + lechX, z: cuoi?.z || 0, rotationY: 0 }];
    });
  }, [kichThuocMm, scalePercent]);

  const xoaBanSao = useCallback((id: string) => {
    setInstances((prev) => (prev.length <= 1 ? prev : prev.filter((i) => i.id !== id)));
    setSelectedId((cu) => (cu === id ? '' : cu));
  }, []);

  const capNhatInstance = useCallback((id: string, patch: Partial<ModelInstance>) => {
    setInstances((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }, []);

  const tinhGiaNhanh = useCallback(async () => {
    if (!geometry || baseVolumeCm3 <= 0) return;
    setDangTinh(true);
    setLoi('');
    setKetQua(null);
    try {
      const volumeCm3 = baseVolumeCm3 * (scalePercent / 100) ** 3;
      const res = await fetch('/api/quote/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName,
          volumeCm3,
          instanceCount: instances.length,
          infillPercent,
          layerHeightMm,
          printerId: printerId || undefined,
          peiSheetId: peiSheetId || undefined,
          filamentId: filamentId || undefined,
        }),
      });
      const data = await res.json();
      if (data.status === 'success') {
        setKetQua(data.data);
      } else {
        setLoi(data.message || 'Không tính được giá');
      }
    } catch (e) {
      setLoi(e instanceof Error ? e.message : 'Lỗi mạng');
    } finally {
      setDangTinh(false);
    }
  }, [geometry, baseVolumeCm3, scalePercent, fileName, instances.length, infillPercent, layerHeightMm, printerId, peiSheetId, filamentId]);

  const chieuXacNhanQuote = useCallback(async (quoteId: string) => {
    for (let lan = 0; lan < 90; lan += 1) {
      await new Promise((r) => setTimeout(r, 2000));
      const res = await fetch(`/api/quote/slice/${quoteId}`);
      const data = await res.json();
      if (data.status !== 'success') continue;
      const quote = data.data;
      if (quote.sliceStatus === 'done') {
        setKetQua(quote);
        setSliceTrangThai('');
        return;
      }
      if (quote.sliceStatus === 'failed') {
        setLoi(quote.sliceError || 'Slice thất bại');
        setSliceTrangThai('');
        return;
      }
      setSliceTrangThai(`Đang slice... (${lan * 2}s)`);
    }
    setLoi('Slice quá lâu — có thể worker đang bận hoặc gặp sự cố.');
    setSliceTrangThai('');
  }, []);

  const sliceThat = useCallback(async () => {
    if (!rawFile) return;
    setDangSlice(true);
    setLoi('');
    setKetQua(null);
    setSliceTrangThai('Đang tải file lên...');
    try {
      const form = new FormData();
      form.append('file', rawFile);
      if (printerId) form.append('printerId', printerId);
      if (peiSheetId) form.append('peiSheetId', peiSheetId);
      if (filamentId) form.append('filamentId', filamentId);
      form.append('infillPercent', String(infillPercent));
      form.append('layerHeightMm', String(layerHeightMm));
      form.append('instanceCount', String(instances.length));

      const res = await fetch('/api/quote/slice', { method: 'POST', body: form });
      const data = await res.json();
      if (data.status !== 'success') {
        setLoi(data.message || 'Không gửi được job slice');
        return;
      }
      setSliceTrangThai('Đang slice...');
      await chieuXacNhanQuote(data.data.id);
    } catch (e) {
      setLoi(e instanceof Error ? e.message : 'Lỗi mạng');
    } finally {
      setDangSlice(false);
    }
  }, [rawFile, printerId, peiSheetId, filamentId, infillPercent, layerHeightMm, instances.length, chieuXacNhanQuote]);

  return (
    <div className="h-[100dvh] overflow-hidden bg-slate-50 text-slate-900 dark:bg-[#090d16] dark:text-white flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <Link href="/" className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-lg font-bold">Báo giá in 3D</h1>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          Ước lượng nhanh — chưa chạy slicer thật, sai số có thể 20-30%
        </span>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Panel trái: form + kết quả */}
        <div className="w-[380px] shrink-0 overflow-y-auto p-4 space-y-4 border-r border-slate-200 dark:border-slate-800">
          <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-6 cursor-pointer hover:border-amber-500 transition-colors">
              <Upload size={24} className="text-slate-400" />
              <span className="text-sm text-slate-500 dark:text-slate-400">
                {fileName || 'Chọn file .stl / .3mf'}
              </span>
              <input
                type="file"
                accept=".stl,.3mf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
            </label>
            {loadError && (
              <div className="mt-2 text-sm text-red-600 dark:text-red-400 flex items-center gap-1.5">
                <AlertCircle size={14} /> {loadError}
              </div>
            )}
            {kichThuocMm && (
              <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Kích thước gốc: {kichThuocMm.x.toFixed(1)} × {kichThuocMm.y.toFixed(1)} × {kichThuocMm.z.toFixed(1)} mm
                · Thể tích: {baseVolumeCm3.toFixed(2)} cm³
              </div>
            )}
          </div>

          {geometry && (
            <>
              <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Bản sao trên mâm ({instances.length})</span>
                  <button
                    onClick={themBanSao}
                    className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs rounded-lg flex items-center gap-1"
                  >
                    <Copy size={14} /> Nhân bản
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setTransformMode('translate')}
                    className={`flex-1 px-2 py-1.5 text-xs rounded-lg flex items-center justify-center gap-1 ${transformMode === 'translate' ? 'bg-amber-500 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}
                  >
                    <Move size={14} /> Di chuyển
                  </button>
                  <button
                    onClick={() => setTransformMode('rotate')}
                    className={`flex-1 px-2 py-1.5 text-xs rounded-lg flex items-center justify-center gap-1 ${transformMode === 'rotate' ? 'bg-amber-500 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}
                  >
                    <RotateCw size={14} /> Xoay
                  </button>
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {instances.map((inst, idx) => (
                    <div
                      key={inst.id}
                      onClick={() => setSelectedId(inst.id)}
                      className={`flex items-center justify-between px-2 py-1.5 rounded-lg text-xs cursor-pointer ${inst.id === selectedId ? 'bg-amber-500/20 border border-amber-500' : 'bg-slate-100 dark:bg-slate-800'}`}
                    >
                      <span>Bản {idx + 1}</span>
                      {instances.length > 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            xoaBanSao(inst.id);
                          }}
                          className="text-red-500 hover:text-red-600"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <div>
                  <label className="text-xs text-slate-500 dark:text-slate-400">Tỷ lệ (%) — áp dụng chung mọi bản sao</label>
                  <input
                    type="number"
                    min={1}
                    value={scalePercent}
                    onChange={(e) => setScalePercent(Number(e.target.value) || 100)}
                    className="w-full mt-1 bg-slate-50 dark:bg-[#1f2937] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm"
                  />
                </div>
              </div>

              <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
                <div>
                  <label className="text-xs text-slate-500 dark:text-slate-400">Máy in</label>
                  <select
                    value={printerId}
                    onChange={(e) => {
                      setPrinterId(e.target.value);
                      setPeiSheetId('');
                    }}
                    className="w-full mt-1 bg-slate-50 dark:bg-[#1f2937] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm"
                  >
                    <option value="">-- Chọn máy in --</option>
                    {printers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 dark:text-slate-400">Mâm PEI</label>
                  <select
                    value={peiSheetId}
                    onChange={(e) => setPeiSheetId(e.target.value)}
                    className="w-full mt-1 bg-slate-50 dark:bg-[#1f2937] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm"
                  >
                    <option value="">-- Chọn mâm PEI --</option>
                    {peiSheetsCuaMay.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.plateType ? `(${s.plateType})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 dark:text-slate-400">Nhựa</label>
                  <select
                    value={filamentId}
                    onChange={(e) => setFilamentId(e.target.value)}
                    className="w-full mt-1 bg-slate-50 dark:bg-[#1f2937] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm"
                  >
                    <option value="">-- Chọn nhựa --</option>
                    {filaments.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.type} - {f.colorName} {f.costPerKg ? `(${formatVnd(f.costPerKg)}/kg)` : '(chưa có giá vốn)'}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-xs text-slate-500 dark:text-slate-400">Infill (%)</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={infillPercent}
                      onChange={(e) => setInfillPercent(Number(e.target.value) || 0)}
                      className="w-full mt-1 bg-slate-50 dark:bg-[#1f2937] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-slate-500 dark:text-slate-400">Layer height (mm)</label>
                    <select
                      value={layerHeightMm}
                      onChange={(e) => setLayerHeightMm(Number(e.target.value))}
                      className="w-full mt-1 bg-slate-50 dark:bg-[#1f2937] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm"
                    >
                      {LAYER_HEIGHT_OPTIONS.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={tinhGiaNhanh}
                  disabled={dangTinh || dangSlice}
                  className="flex-1 py-2.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 disabled:opacity-50 rounded-xl font-medium text-sm"
                >
                  {dangTinh ? 'Đang tính...' : 'Ước lượng nhanh'}
                </button>
                <button
                  onClick={sliceThat}
                  disabled={dangTinh || dangSlice}
                  title="Chạy OrcaSlicer thật — chính xác hơn nhưng mất vài chục giây"
                  className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-xl font-medium text-sm"
                >
                  {dangSlice ? sliceTrangThai || 'Đang slice...' : 'Slice thật'}
                </button>
              </div>

              {loi && (
                <div className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1.5">
                  <AlertCircle size={14} /> {loi}
                </div>
              )}

              {ketQua && (
                <div className="bg-white dark:bg-[#111827] border border-amber-500/50 rounded-xl p-4 space-y-2">
                  <div className="text-sm flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Khối lượng nhựa</span>
                    <span className="font-medium">{ketQua.weightG.toFixed(1)} g</span>
                  </div>
                  <div className="text-sm flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Thời gian in</span>
                    <span className="font-medium">
                      {Math.floor(ketQua.timeMinutes / 60)}h {Math.round(ketQua.timeMinutes % 60)}p
                    </span>
                  </div>
                  <hr className="border-slate-200 dark:border-slate-800" />
                  <div className="text-sm flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Giá vốn</span>
                    <span className="font-medium">{formatVnd(ketQua.giaVon)}</span>
                  </div>
                  <div className="text-sm flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Giá bán lẻ</span>
                    <span className="font-medium">{formatVnd(ketQua.giaBanLe)}</span>
                  </div>
                  <div className="text-base flex justify-between font-bold text-amber-500">
                    <span>Giá bán sàn</span>
                    <span>{formatVnd(ketQua.gia)}</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Panel phải: viewer 3D */}
        <div className="flex-1 relative">
          {geometry ? (
            <ModelViewer
              geometry={geometry}
              plateWidthMm={plateWidthMm}
              plateDepthMm={plateDepthMm}
              instances={instances}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onInstanceChange={capNhatInstance}
              scalePercent={scalePercent}
              transformMode={transformMode}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-slate-400 text-sm">
              Tải file .stl / .3mf lên để xem model
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
