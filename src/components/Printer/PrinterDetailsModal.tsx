'use client';

import React from 'react';
import { Clock, Info, Layers, Radio, ServerCog, Thermometer, Wifi, X } from 'lucide-react';
import { CamMayIn } from './cam-may-in';
import { TinhTrangMay, type TinhTrang } from './tinh-trang-may';

/**
 * Bảng chi tiết một máy in.
 *
 * Viết lại từ đầu khi bỏ đường Home Assistant làm nguồn chính: bản cũ đọc đúng cái payload riêng
 * của ha-bambulab (`project.slice_result`, `nozzles[]`, `firmware_version`…) — những thứ MQTT thô
 * không có. Giờ chỉ dựa vào các trường mà **cả hai** nguồn đều cung cấp, nên hiện đúng dù máy đang
 * chạy MQTT hay đang phải mượn Home Assistant.
 */

export type TrangThaiSong = {
  status?: string;
  progress?: number;
  nozzleTemp?: number;
  nozzleTargetTemp?: number;
  bedTemp?: number;
  bedTargetTemp?: number;
  remainingTimeSeconds?: number;
  fileName?: string;
  previewUrl?: string;
  materials?: Array<{ name: string; color: string } | null>;
  extendedInfo?: { provider?: string; payload?: TinhTrang & Record<string, unknown> };
};

const NHAN_TRANG_THAI: Record<string, string> = {
  printing: 'Đang in',
  idle: 'Rảnh',
  error: 'Lỗi / tạm dừng',
  offline: 'Mất kết nối',
  maintenance: 'Bảo trì',
};

function O({ icon, nhan, giaTri }: { icon: React.ReactNode; nhan: string; giaTri: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-800/40 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        {icon}
        {nhan}
      </div>
      <div className="text-sm font-semibold text-slate-100">{giaTri}</div>
    </div>
  );
}

function thoiGian(giay: number | undefined): string {
  if (!giay) return '—';
  const phut = Math.round(giay / 60);
  if (phut < 60) return `${phut} phút`;
  return `${Math.floor(phut / 60)}h ${phut % 60}m`;
}

export function PrinterDetailsModal({
  isOpen,
  onClose,
  liveStatus,
  may,
  tenMay,
}: {
  isOpen: boolean;
  onClose: () => void;
  liveStatus: TrangThaiSong | undefined;
  /** `cloudPrinterId` — khoá để route camera tìm ra IP và Access Code của máy. */
  may?: string | null;
  tenMay?: string;
}) {
  if (!isOpen) return null;

  const payload = liveStatus?.extendedInfo?.payload;
  const nguon = payload?.nguon;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 p-5">
          <h3 className="flex items-center gap-2 text-lg font-bold text-slate-100">
            <Info size={18} className="text-indigo-400" />
            Chi tiết máy in
          </h3>
          <div className="flex items-center gap-3">
            {nguon === 'mqtt' && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                <Radio size={10} /> MQTT
              </span>
            )}
            {nguon === 'ha' && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
                <ServerCog size={10} /> Home Assistant
              </span>
            )}
            <button onClick={onClose} className="p-1 text-slate-400 hover:text-white">
              <X size={20} />
            </button>
          </div>
        </div>

        {!liveStatus ? (
          <div className="p-8 text-center text-slate-400">Chưa có dữ liệu — máy chưa kết nối.</div>
        ) : (
          <div className="space-y-5 overflow-y-auto p-5">
            <div className="flex items-start gap-4">
              {liveStatus.previewUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- ảnh do Home Assistant phục vụ, không qua loader của Next
                <img
                  src={liveStatus.previewUrl}
                  alt="Ảnh bản in"
                  className="h-20 w-20 shrink-0 rounded-xl border border-slate-700 object-cover"
                />
              )}
              <div className="min-w-0">
                <p className="truncate text-base font-bold text-slate-100">{liveStatus.fileName || 'Không có bản in'}</p>
                <p className="text-sm text-slate-400">
                  {NHAN_TRANG_THAI[liveStatus.status ?? ''] ?? liveStatus.status} · {Math.round(liveStatus.progress ?? 0)}%
                </p>
              </div>
            </div>

            <TinhTrangMay payload={payload} />

            <CamMayIn may={may} tenMay={tenMay} />

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <O
                icon={<Thermometer size={11} />}
                nhan="Đầu phun"
                giaTri={`${Math.round(liveStatus.nozzleTemp ?? 0)}° / ${Math.round(liveStatus.nozzleTargetTemp ?? 0)}°`}
              />
              <O
                icon={<Thermometer size={11} />}
                nhan="Bàn in"
                giaTri={`${Math.round(liveStatus.bedTemp ?? 0)}° / ${Math.round(liveStatus.bedTargetTemp ?? 0)}°`}
              />
              <O
                icon={<Layers size={11} />}
                nhan="Lớp in"
                giaTri={`${payload?.layer_num ?? '—'} / ${payload?.total_layers ?? '—'}`}
              />
              <O icon={<Clock size={11} />} nhan="Còn lại" giaTri={thoiGian(liveStatus.remainingTimeSeconds)} />
            </div>

            {typeof payload?.wifi_signal === 'string' && (
              <O icon={<Wifi size={11} />} nhan="Sóng wifi của máy" giaTri={payload.wifi_signal} />
            )}

            {(liveStatus.materials?.length ?? 0) > 0 && (
              <div>
                <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Khay nhựa</div>
                <div className="flex flex-wrap gap-2">
                  {liveStatus.materials?.map((k, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 rounded-lg border border-slate-700/60 bg-slate-800/40 px-2.5 py-1.5 text-xs"
                    >
                      <span
                        className="h-4 w-4 rounded-full border border-slate-600"
                        style={{ backgroundColor: k?.color ?? 'transparent' }}
                      />
                      <span className="text-slate-300">{k?.name ?? 'Trống'}</span>
                      <span className="text-[10px] text-slate-500">#{i + 1}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
