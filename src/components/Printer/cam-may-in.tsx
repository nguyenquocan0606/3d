'use client';

import React from 'react';
import { Video, VideoOff } from 'lucide-react';

/**
 * Khung xem camera trong máy in.
 *
 * Cố ý **không tự bật**: mỗi người xem là một kết nối tới máy in, mà firmware giới hạn số client
 * camera. Mở sẵn cho mọi thẻ máy in thì chỉ vài tab là hết chỗ. Bấm mới xem.
 *
 * Trình duyệt đọc thẳng MJPEG bằng thẻ `<img>`, không cần thư viện gì. Gỡ thẻ img đi là kết nối tự
 * đứt, và máy chủ cũng tự cắt sang máy in sau 45 giây không còn ai xem.
 */
export function CamMayIn({ may, tenMay }: { may: string | null | undefined; tenMay?: string }) {
  const [dangXem, setDangXem] = React.useState(false);
  const [loi, setLoi] = React.useState(false);
  // Đổi khoá là ép trình duyệt mở kết nối mới thay vì dùng lại cái đã hỏng.
  const [khoa, setKhoa] = React.useState(0);

  if (!may) return null;

  const bat = () => {
    setLoi(false);
    setKhoa((k) => k + 1);
    setDangXem(true);
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Camera</div>
        <button
          type="button"
          onClick={() => (dangXem ? setDangXem(false) : bat())}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1 text-xs font-semibold text-slate-300 transition-colors hover:bg-slate-800"
        >
          {dangXem ? <VideoOff size={13} /> : <Video size={13} />}
          {dangXem ? 'Tắt' : 'Xem camera'}
        </button>
      </div>

      {dangXem && (
        <div className="overflow-hidden rounded-xl border border-slate-700 bg-black">
          {loi ? (
            <div className="p-6 text-center text-xs text-slate-400">
              Không mở được camera.
              <button type="button" onClick={bat} className="ml-1 text-indigo-400 underline">
                Thử lại
              </button>
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- luồng MJPEG, không qua loader ảnh của Next
            <img
              key={khoa}
              src={`/api/printers/camera?may=${encodeURIComponent(may)}&k=${khoa}`}
              alt={`Camera ${tenMay ?? may}`}
              onError={() => setLoi(true)}
              className="w-full"
            />
          )}
          <div className="px-3 py-1.5 text-[10px] text-slate-500">
            Camera máy A1/P1 chỉ đẩy khoảng 0,4 hình/giây — giật là bình thường.
          </div>
        </div>
      )}
    </div>
  );
}
