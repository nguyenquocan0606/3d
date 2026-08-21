import { ok, fail } from '@/utils/api-response';
import { LoiWorkerKhongChay, guiTinNhan } from '@/services/zalo.service';

/**
 * POST /api/zalo/send — gửi tin nhắn ra Zalo.
 * Body: { threadId (khóa nội bộ của hội thoại), text, quoteMsgId? }
 *
 * Web không tự nói chuyện với Zalo — request này được chuyển cho worker, nơi giữ phiên đăng nhập.
 * Không cần truyền tài khoản: worker tra từ hội thoại ra tài khoản phải dùng để gửi.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      threadId?: string;
      text?: string;
      quoteMsgId?: string;
    };

    if (!body.threadId) return fail('Thiếu hội thoại', 400);
    if (!body.text?.trim()) return fail('Nội dung tin nhắn trống', 400);

    const ketQua = await guiTinNhan({
      threadId: body.threadId,
      text: body.text,
      quoteMsgId: body.quoteMsgId,
    });

    return ok(ketQua, 'Đã gửi.');
  } catch (error: unknown) {
    // Worker chưa chạy là lỗi cấu hình của người dùng, không phải sự cố máy chủ — trả 503 để UI
    // hiện đúng hướng dẫn thay vì "Lỗi máy chủ" chung chung.
    if (error instanceof LoiWorkerKhongChay) return fail(error.message, 503);
    return fail(error instanceof Error ? error.message : 'Lỗi máy chủ');
  }
}
