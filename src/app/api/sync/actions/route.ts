import { ok, fail } from '@/utils/api-response';
import { apDungThaoTac, bangBiAnhHuong, type ThaoTacDongBo } from '@/services/sync.service';
import { baoThayDoi } from '@/services/sync-notify.service';

/**
 * Nhận hàng đợi thao tác từ app — xem `KE-HOACH-DONG-BO-OFFLINE.md` §3.2.
 *
 * Body:  { thietBi?, actions: [{ id, loai, payload, taoLuc }] }
 * Trả:   { results: [{ id, status: 'applied'|'duplicate'|'rejected', message? }],
 *          tables: [...] }
 *
 * Áp dụng **theo đúng thứ tự app gửi** — thao tác sau có thể phụ thuộc thao tác
 * trước (quẹt tem máy in rồi mới chốt lượt). Vì vậy không dùng `Promise.all`.
 *
 * Một thao tác hỏng **không chặn** các thao tác sau: mỗi cái có kết quả riêng, app
 * đọc `results` để biết cái nào cần thợ xử lý tay.
 */

/** Chặn mẻ quá lớn: máy offline cả ngày có thể dồn hàng nghìn thao tác. */
const TOI_DA_MOI_ME = 200;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const thietBi = typeof body?.thietBi === 'string' ? body.thietBi.trim() : undefined;
    const danhSach = body?.actions;

    if (!Array.isArray(danhSach)) return fail('Thiếu mảng `actions`.', 400);
    if (danhSach.length === 0) return ok({ results: [], tables: [] });
    if (danhSach.length > TOI_DA_MOI_ME) {
      return fail(`Mỗi lần gửi tối đa ${TOI_DA_MOI_ME} thao tác, nhận được ${danhSach.length}.`, 400);
    }

    const results: { id: string; status: string; message?: string }[] = [];
    const bangDaDoi = new Set<string>();

    for (const raw of danhSach) {
      const id = typeof raw?.id === 'string' ? raw.id.trim() : '';
      const loai = typeof raw?.loai === 'string' ? raw.loai.trim() : '';
      const taoLuc = new Date(raw?.taoLuc);

      if (!id || !loai || Number.isNaN(taoLuc.getTime())) {
        results.push({ id: id || '(thiếu id)', status: 'rejected', message: 'Thao tác thiếu id, loại hoặc thời điểm.' });
        continue;
      }

      const thaoTac: ThaoTacDongBo = {
        id,
        loai,
        payload: (raw.payload ?? {}) as Record<string, unknown>,
        taoLuc,
      };

      const kq = await apDungThaoTac(thaoTac, thietBi);
      results.push({ id, status: kq.ketQua, ...(kq.thongDiep ? { message: kq.thongDiep } : {}) });

      if (kq.ketQua === 'applied') {
        for (const bang of bangBiAnhHuong(loai)) bangDaDoi.add(bang);
      }
    }

    // Báo các máy khác kéo delta. `void` chứ không `await`: thợ đã quẹt xong rồi,
    // không bắt họ chờ một cú publish MQTT có thể timeout.
    const tables = [...bangDaDoi];
    void baoThayDoi(tables);

    return ok({ results, tables });
  } catch (error: unknown) {
    return fail(error instanceof Error ? error.message : 'Lỗi máy chủ');
  }
}
