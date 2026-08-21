'use client';

import React from 'react';
import { Maximize2, Minimize2, Video, VideoOff } from 'lucide-react';

/**
 * Xem camera của tất cả máy in cùng lúc.
 *
 * **Vì sao lưới dùng ảnh tĩnh chứ không phải MJPEG:** MJPEG là một kết nối HTTP mở suốt, mà trình
 * duyệt chỉ cho ~6 kết nối đồng thời tới một tên miền. Bốn máy là hết 4 chỗ, phần còn lại của app
 * (đồng bộ, trạng thái máy in) sẽ nghẽn. Máy in vốn chỉ đẩy ~0,4 hình/giây nên xin lại mỗi 2 giây
 * cho ra đúng cùng một trải nghiệm mà không giữ kết nối nào.
 *
 * Riêng ô đang phóng to thì dùng MJPEG — lúc đó chỉ có một luồng, và máy chủ đẩy được hình ngay
 * khi có thay vì chờ tới nhịp xin kế tiếp.
 */

export type MayCam = {
  id: string;
  name: string;
  cloudPrinterId?: string | null;
  lanIp?: string | null;
};

const NHIP_MS = 2000;

/**
 * Ảnh xin theo nhịp, **nạp xong mới đổi** — gán thẳng vào `src` thì cứ mỗi nhịp lại chớp trắng một
 * cái, nhìn bốn ô cùng chớp rất khó chịu.
 */
function AnhTheoNhip({ may, ten }: { may: string; ten: string }) {
  const [src, setSrc] = React.useState<string | null>(null);
  const [loi, setLoi] = React.useState(false);

  React.useEffect(() => {
    let song = true;
    let hen: ReturnType<typeof setTimeout>;

    const xin = () => {
      const url = `/api/printers/camera?may=${encodeURIComponent(may)}&anh=1&t=${Date.now()}`;
      const img = new Image();
      img.onload = () => {
        if (!song) return;
        setSrc(url);
        setLoi(false);
        hen = setTimeout(xin, NHIP_MS);
      };
      img.onerror = () => {
        if (!song) return;
        setLoi(true);
        // Hỏng thì giãn nhịp ra, đừng nện máy in mỗi 2 giây khi nó đang không rảnh.
        hen = setTimeout(xin, NHIP_MS * 3);
      };
      img.src = url;
    };

    xin();
    return () => {
      song = false;
      clearTimeout(hen);
    };
  }, [may]);

  if (!src) {
    return (
      <div className="flex aspect-video items-center justify-center bg-black text-xs text-slate-500">
        {loi ? 'Không mở được camera' : 'Đang kết nối…'}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- ảnh động từ máy in, không qua loader của Next
    <img src={src} alt={`Camera ${ten}`} className="aspect-video w-full object-cover" />
  );
}

/** Ô đang phóng to: một luồng MJPEG duy nhất, mượt hơn vì máy chủ đẩy ngay khi có hình. */
function LuongMjpeg({ may, ten }: { may: string; ten: string }) {
  const [khoa, setKhoa] = React.useState(0);
  const [loi, setLoi] = React.useState(false);

  if (loi) {
    return (
      <div className="flex aspect-video items-center justify-center bg-black text-xs text-slate-400">
        Mất luồng.
        <button
          type="button"
          onClick={() => {
            setLoi(false);
            setKhoa((k) => k + 1);
          }}
          className="ml-1 text-indigo-400 underline"
        >
          Thử lại
        </button>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- luồng MJPEG
    <img
      key={khoa}
      src={`/api/printers/camera?may=${encodeURIComponent(may)}&k=${khoa}`}
      alt={`Camera ${ten}`}
      onError={() => setLoi(true)}
      className="w-full"
    />
  );
}

export function TuongCamera({ printers }: { printers: MayCam[] }) {
  const [bat, setBat] = React.useState(false);
  const [phongTo, setPhongTo] = React.useState<string | null>(null);
  const [cot, setCot] = React.useState<2 | 3>(2);

  // Chỉ máy đã khai IP + Access Code mới có camera; máy đọc qua Home Assistant thì không.
  const coCam = printers.filter((p) => p.lanIp && p.cloudPrinterId);

  if (coCam.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-500 dark:border-slate-800">
        Chưa máy in nào khai IP và Access Code, nên chưa xem được camera.
        <br />
        Vào tab Máy in → Quản lý → Chỉnh sửa để điền.
      </div>
    );
  }

  const to = phongTo ? coCam.find((p) => p.cloudPrinterId === phongTo) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setBat((v) => !v);
            setPhongTo(null);
          }}
          className={`inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold ${
            bat
              ? 'border border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-300'
              : 'bg-indigo-600 text-white'
          }`}
        >
          {bat ? <VideoOff size={16} /> : <Video size={16} />}
          {bat ? 'Tắt tất cả' : `Xem ${coCam.length} camera`}
        </button>

        {bat && !to && (
          <div className="inline-flex rounded-lg border border-slate-300 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
            {([2, 3] as const).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setCot(n)}
                className={`h-8 rounded-md px-3 text-xs font-semibold ${
                  cot === n ? 'bg-indigo-600 text-white' : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {n} cột
              </button>
            ))}
          </div>
        )}

        <span className="text-xs text-slate-500">
          Camera A1/P1 chỉ đẩy khoảng 0,4 hình/giây — giật là bình thường.
        </span>
      </div>

      {!bat ? (
        <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500 dark:border-slate-700">
          Camera chưa bật. Mỗi máy in chỉ cho vài kết nối camera cùng lúc nên phải bấm mới xem.
        </div>
      ) : to ? (
        <div className="overflow-hidden rounded-2xl border border-slate-700 bg-black">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-sm font-semibold text-white">{to.name}</span>
            <button
              type="button"
              onClick={() => setPhongTo(null)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-600 px-2 py-1 text-xs text-slate-300"
            >
              <Minimize2 size={13} /> Thu nhỏ
            </button>
          </div>
          <LuongMjpeg may={to.cloudPrinterId!} ten={to.name} />
        </div>
      ) : (
        <div className={`grid gap-3 ${cot === 2 ? 'md:grid-cols-2' : 'md:grid-cols-2 xl:grid-cols-3'}`}>
          {coCam.map((p) => (
            <div key={p.id} className="overflow-hidden rounded-2xl border border-slate-700 bg-black">
              <div className="flex items-center justify-between px-3 py-2">
                <span className="truncate text-sm font-semibold text-white">{p.name}</span>
                <button
                  type="button"
                  onClick={() => setPhongTo(p.cloudPrinterId!)}
                  title="Phóng to"
                  className="rounded-lg border border-slate-600 p-1 text-slate-300 hover:bg-slate-800"
                >
                  <Maximize2 size={13} />
                </button>
              </div>
              <AnhTheoNhip may={p.cloudPrinterId!} ten={p.name} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
