import prisma from '@/utils/db';
import { layCam } from '@/services/printer-integration/providers/bambu/cam-bambu';

/**
 * Camera trong máy in, phát ra cho web và app.
 *
 * Hai kiểu trên cùng một đường dẫn vì hai bên xem khác nhau:
 *   - `?may=<id>`         → luồng MJPEG, thẻ `<img>` của trình duyệt hiểu thẳng, không cần thư viện.
 *   - `?may=<id>&anh=1`   → một ảnh JPEG. Flutter không đọc được MJPEG nên app tự xin lại theo nhịp.
 *
 * Máy in chỉ đẩy ~0,4 khung/giây nên app hỏi lại mỗi 2 giây là đủ mượt, không phí gì.
 */

const RANH_GIOI = 'khungbambu';

async function timMay(may: string) {
  return prisma.printer.findFirst({
    where: { cloudPrinterId: may },
    select: { lanIp: true, lanAccessCode: true },
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const may = searchParams.get('may');
  if (!may) return new Response('Thiếu tham số may', { status: 400 });

  const printer = await timMay(may);
  if (!printer?.lanIp || !printer.lanAccessCode) {
    return new Response('Máy in chưa cấu hình kết nối trực tiếp', { status: 404 });
  }

  const cam = layCam(printer.lanIp, printer.lanAccessCode);

  // ── Ảnh tĩnh ────────────────────────────────────────────────────────────────
  if (searchParams.get('anh')) {
    const jpg = await cam.anhChup();
    if (!jpg) return new Response('Chưa lấy được hình', { status: 503 });
    return new Response(new Uint8Array(jpg), {
      headers: {
        'Content-Type': 'image/jpeg',
        // Hình đổi liên tục, đừng để trình duyệt hay proxy giữ lại.
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  }

  // ── Luồng MJPEG ─────────────────────────────────────────────────────────────
  let huyTheoDoi: (() => void) | null = null;

  const luong = new ReadableStream<Uint8Array>({
    start(controller) {
      const day = (jpg: Buffer) => {
        try {
          controller.enqueue(
            new Uint8Array(
              Buffer.from(`--${RANH_GIOI}\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpg.length}\r\n\r\n`),
            ),
          );
          controller.enqueue(new Uint8Array(jpg));
          controller.enqueue(new Uint8Array(Buffer.from('\r\n')));
        } catch {
          // Người xem đã đóng tab giữa chừng — gỡ đăng ký, đừng cố đẩy tiếp.
          huyTheoDoi?.();
        }
      };

      // Có sẵn khung thì đẩy ngay, khỏi bắt người xem nhìn màn hình trắng 2,5 giây.
      if (cam.khungMoiNhat) day(cam.khungMoiNhat);
      huyTheoDoi = cam.theoDoi(day);
    },
    cancel() {
      huyTheoDoi?.();
    },
  });

  return new Response(luong, {
    headers: {
      'Content-Type': `multipart/x-mixed-replace; boundary=${RANH_GIOI}`,
      'Cache-Control': 'no-store, max-age=0',
      // Nginx đứng trước sẽ gom buffer và làm luồng đứng hình nếu không tắt.
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    },
  });
}
