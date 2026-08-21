'use client';

import React from 'react';
import { AlertTriangle, Radio, ServerCog } from 'lucide-react';

/**
 * Dải tình trạng của một máy in: đang lấy dữ liệu từ đâu, vì sao dừng, và **tất cả** lỗi HMS.
 *
 * Cố ý liệt kê hết chứ không rút gọn còn một dòng: máy có thể ôm mấy lỗi cùng lúc (firmware AMS
 * lệch + nhắc tra dầu trục), gộp lại thì người sửa máy mất manh mối. Mấy lỗi này KHÔNG bắn thông
 * báo — chúng dai dẳng và phần lớn không cản việc in — nên chỗ duy nhất thấy được là ở đây.
 */

export type LoiHms = { ma: string; mucDo: string; nang: boolean; moTa?: string; wiki: string };

export type TinhTrang = {
  nguon?: string;
  mqtt_roi?: boolean;
  ly_do_dung?: string | null;
  dung_do_su_co?: boolean;
  hms?: LoiHms[];
  print_error?: string | null;
};

export function TinhTrangMay({ payload }: { payload: TinhTrang | undefined }) {
  if (!payload) return null;

  const hms = payload.hms ?? [];
  const coGiDeNoi = payload.ly_do_dung || payload.print_error || hms.length > 0 || payload.nguon === 'ha';
  if (!coGiDeNoi) return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {payload.nguon === 'mqtt' && (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
            <Radio size={10} /> MQTT trực tiếp
          </span>
        )}
        {payload.nguon === 'ha' && (
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
              payload.mqtt_roi
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                : 'border-slate-500/30 bg-slate-500/10 text-slate-400'
            }`}
          >
            <ServerCog size={10} />
            {/* Máy vốn chỉ có HA là chuyện bình thường; máy có MQTT mà đang chạy HA mới đáng để ý. */}
            {payload.mqtt_roi ? 'MQTT rớt — đang dùng Home Assistant' : 'Qua Home Assistant'}
          </span>
        )}
      </div>

      {payload.ly_do_dung && (
        <div
          className={`rounded-lg border px-3 py-2 text-xs ${
            payload.dung_do_su_co
              ? 'border-red-500/30 bg-red-500/10 text-red-300'
              : 'border-slate-600/40 bg-slate-700/20 text-slate-300'
          }`}
        >
          <span className="font-semibold">Dừng vì:</span> {payload.ly_do_dung}
          {payload.print_error && <span className="ml-1 font-mono text-[11px] opacity-80">({payload.print_error})</span>}
        </div>
      )}

      {hms.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            <AlertTriangle size={11} />
            {hms.length} lỗi máy báo
          </div>
          {hms.map((l) => (
            <a
              key={l.ma}
              href={l.wiki}
              target="_blank"
              rel="noreferrer"
              className={`block rounded-lg border px-3 py-2 text-xs transition-colors ${
                l.nang
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20'
                  : 'border-slate-600/40 bg-slate-700/20 text-slate-300 hover:bg-slate-700/40'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px]">{l.ma}</span>
                <span className="shrink-0 text-[10px] opacity-80">{l.mucDo}</span>
              </div>
              {l.moTa && <p className="mt-0.5 leading-snug opacity-90">{l.moTa}</p>}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
