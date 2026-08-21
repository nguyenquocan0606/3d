import prisma from '@/utils/db';
import { layAnhPreview } from '@/services/printer-integration/providers/bambu/doc-3mf';

/**
 * Ảnh preview của bản in đang chạy, lấy thẳng từ máy in qua FTPS.
 *
 * Tách khỏi route trạng thái vì kéo ảnh mất vài giây lần đầu — nhét vào đó thì cả màn hình máy in
 * đứng chờ. Ở đây trình duyệt xin ảnh riêng, chậm một nhịp cũng không ai thấy.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const may = searchParams.get('may');
  const tenFile = searchParams.get('f');

  if (!may || !tenFile) {
    return new Response('Thiếu tham số', { status: 400 });
  }

  const printer = await prisma.printer.findFirst({
    where: { cloudPrinterId: may },
    select: { lanIp: true, lanAccessCode: true },
  });

  if (!printer?.lanIp || !printer.lanAccessCode) {
    return new Response('Máy in chưa cấu hình kết nối trực tiếp', { status: 404 });
  }

  const png = await layAnhPreview({
    ip: printer.lanIp,
    accessCode: printer.lanAccessCode,
    tenFile,
  });

  if (!png) return new Response('Không lấy được ảnh', { status: 404 });

  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      // Tên bản in nằm trong URL nên nội dung ứng với URL này không bao giờ đổi.
      'Cache-Control': 'public, max-age=86400, immutable',
    },
  });
}
