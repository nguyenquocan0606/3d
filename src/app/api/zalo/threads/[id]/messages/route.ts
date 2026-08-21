import { ok, fail } from '@/utils/api-response';
import { danhDauDaDoc, layTinNhan } from '@/services/zalo.service';

/**
 * GET /api/zalo/threads/[id]/messages — tin nhắn của một hội thoại (cũ → mới).
 * Mở hội thoại tính là đã đọc luôn, nên endpoint này cũng xóa số chưa đọc.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const messages = await layTinNhan(id);
    await danhDauDaDoc(id).catch(() => {
      // Hội thoại vừa bị xóa — không đáng để chặn việc trả tin nhắn về.
    });
    return ok({ messages });
  } catch (error: unknown) {
    return fail(error instanceof Error ? error.message : 'Lỗi máy chủ');
  }
}
