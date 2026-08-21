'use client';

import React from 'react';
import { Download, Loader2, Wifi } from 'lucide-react';

/**
 * Phần "kết nối máy in" dùng chung cho cả form thêm và form sửa.
 *
 * Ba ô này là tất cả những gì cần để nói chuyện thẳng với máy Bambu qua MQTT trong LAN. Nút lấy từ
 * Home Assistant điền hộ IP và ID — HA phơi sẵn hai thứ đó — nhưng **Access Code thì HA không có**
 * (nó nằm trong config entry chứ không thành entity), nên ô đó luôn phải gõ từ màn hình máy in:
 * ⚙️ → WLAN → Access Code.
 */

export type CauHinhKetNoi = {
  lanIp: string;
  lanAccessCode: string;
  lanSerial: string;
  /** ID phía Home Assistant, chỉ dùng cho đường dự phòng. Tự điền khi chọn từ danh sách gợi ý. */
  cloudPrinterId: string;
};

type GoiY = {
  haId: string;
  ten: string;
  ip: string | null;
  serial: string | null;
  trangThai: string;
  daGhep: boolean;
};

const O = 'w-full bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500';
const NHAN = 'text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 block';

export function KetNoiFields({
  giaTri,
  onChange,
  daCoAccessCode = false,
  onChonTen,
}: {
  giaTri: CauHinhKetNoi;
  onChange: (moi: CauHinhKetNoi) => void;
  /** Đang sửa máy đã có mã: để trống ô Access Code nghĩa là giữ mã cũ. */
  daCoAccessCode?: boolean;
  /** Cho form cha điền luôn tên máy khi người dùng chọn từ gợi ý. */
  onChonTen?: (ten: string) => void;
}) {
  const [goiY, setGoiY] = React.useState<GoiY[] | null>(null);
  const [dangTai, setDangTai] = React.useState(false);
  const [loi, setLoi] = React.useState('');

  const dat = (phan: Partial<CauHinhKetNoi>) => onChange({ ...giaTri, ...phan });

  const layGoiY = async () => {
    setDangTai(true);
    setLoi('');
    try {
      const res = await fetch('/api/printers/ha-goi-y');
      const data = await res.json();
      if (data.status === 'success') setGoiY(data.data);
      else setLoi(data.message || 'Không lấy được danh sách.');
    } catch {
      setLoi('Không gọi được máy chủ.');
    } finally {
      setDangTai(false);
    }
  };

  const chon = (m: GoiY) => {
    dat({ lanIp: m.ip ?? '', lanSerial: m.serial ?? '', cloudPrinterId: m.haId });
    onChonTen?.(m.ten);
    setGoiY(null);
  };

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
          <Wifi size={16} className="text-indigo-400" />
          Kết nối trực tiếp
        </h4>
        <button
          type="button"
          onClick={layGoiY}
          disabled={dangTai}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {dangTai ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          Lấy từ Home Assistant
        </button>
      </div>

      {loi && <p className="text-xs text-red-400">{loi}</p>}

      {goiY && (
        <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-1 dark:border-slate-800">
          {goiY.length === 0 && <p className="p-2 text-xs text-slate-500">Home Assistant không thấy máy nào.</p>}
          {goiY.map((m) => (
            <button
              key={m.haId}
              type="button"
              onClick={() => chon(m)}
              className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <span className="min-w-0">
                <span className="font-semibold text-slate-900 dark:text-white">{m.ten}</span>
                <span className="ml-2 font-mono text-slate-500">{m.ip}</span>
              </span>
              {m.daGhep && <span className="shrink-0 text-[10px] text-amber-500">đã ghép</span>}
            </button>
          ))}
        </div>
      )}

      <div>
        <label className={NHAN}>Địa chỉ IP</label>
        <input
          type="text"
          value={giaTri.lanIp}
          onChange={(e) => dat({ lanIp: e.target.value.trim() })}
          placeholder="192.168.99.20"
          className={`${O} font-mono`}
        />
        <p className="mt-1 text-[10px] text-slate-500">Nên đặt IP tĩnh trên router, kẻo DHCP đổi là mất kết nối.</p>
      </div>

      <div>
        <label className={NHAN}>Access Code</label>
        <input
          type="text"
          value={giaTri.lanAccessCode}
          onChange={(e) => dat({ lanAccessCode: e.target.value.trim() })}
          placeholder={daCoAccessCode ? 'Đã lưu — để trống nếu không đổi' : '8 ký tự trên màn hình máy'}
          className={`${O} font-mono`}
        />
        <p className="mt-1 text-[10px] text-slate-500">
          Lấy trên màn hình máy in: ⚙️ → WLAN → Access Code. Home Assistant không đọc được mã này.
        </p>
      </div>

      <div>
        <label className={NHAN}>ID máy in</label>
        <input
          type="text"
          value={giaTri.lanSerial}
          onChange={(e) => dat({ lanSerial: e.target.value.trim() })}
          placeholder="03900D611509363"
          className={`${O} font-mono`}
        />
        <p className="mt-1 text-[10px] text-slate-500">
          Số serial của máy, phân biệt chữ hoa/thường.
          {giaTri.cloudPrinterId && (
            <> Đã gắn với Home Assistant (<span className="font-mono">{giaTri.cloudPrinterId}</span>) để dự phòng.</>
          )}
        </p>
      </div>
    </div>
  );
}
