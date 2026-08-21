import { readFile } from 'node:fs/promises';
import path from 'node:path';

import prisma from '@/utils/db';
import { fail } from '@/utils/api-response';

/**
 * GET /api/zalo/attachments/[id] — trả file khách gửi (ảnh, video, voice, tệp).
 *
 * File nằm NGOÀI `public/` để không ai đoán được URL mà tải về; muốn xem phải đi qua route này.
 * Đường dẫn trong DB là tương đối, thư mục gốc lấy từ biến môi trường — đổi chỗ lưu (ổ khác, NAS)
 * thì dữ liệu cũ vẫn đọc được.
 */
const THU_MUC_FILE = process.env.ZALO_ATTACHMENT_DIR || path.join(process.cwd(), 'data', 'zalo-attachments');

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const dinhKem = await prisma.zaloAttachment.findUnique({ where: { id } });

    if (!dinhKem) return fail('Không tìm thấy đính kèm', 404);
    if (!dinhKem.localPath) return fail(dinhKem.taiLoi || 'Đính kèm chưa tải được về server', 404);

    // `localPath` do worker sinh ra, nhưng vẫn chặn "../" — chỉ cần một dòng DB bị sửa tay là
    // route này biến thành công cụ đọc file tùy ý trên máy chủ.
    const duongDan = path.resolve(THU_MUC_FILE, dinhKem.localPath);
    if (!duongDan.startsWith(path.resolve(THU_MUC_FILE) + path.sep)) return fail('Đường dẫn không hợp lệ', 400);

    const noiDung = await readFile(duongDan);

    return new Response(new Uint8Array(noiDung), {
      headers: {
        'Content-Type': dinhKem.mimeType || 'application/octet-stream',
        // File đã tải về thì không bao giờ đổi nữa — cho trình duyệt cache thoải mái.
        'Cache-Control': 'private, max-age=31536000, immutable',
        ...(dinhKem.kind === 'file' && dinhKem.fileName
          ? { 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(dinhKem.fileName)}` }
          : {}),
      },
    });
  } catch (error: unknown) {
    return fail(error instanceof Error ? error.message : 'Lỗi máy chủ');
  }
}
