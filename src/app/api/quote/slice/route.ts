import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import prisma from '@/utils/db';
import { ok, fail } from '@/utils/api-response';
import { duoiFileHopLe } from '@/utils/mesh-volume';

/** Cùng thư mục bind-mount sang container slicer-worker (xem docker-compose.yml). */
const THU_MUC_UPLOAD = process.env.QUOTE_UPLOAD_DIR || path.join(process.cwd(), 'data', 'quote-uploads');

const SLICER_WORKER_URL = process.env.SLICER_WORKER_URL || 'http://127.0.0.1:39300';
const SLICER_WORKER_TOKEN = process.env.SLICER_WORKER_TOKEN || '';
/** Worker chạy trong Docker cần gọi ngược ra Next chạy trên máy chủ — xem docker-compose.yml. */
const QUOTE_CALLBACK_BASE_URL = process.env.QUOTE_CALLBACK_BASE_URL || 'http://host.docker.internal:3000';

const GIOI_HAN_DUNG_LUONG = 150 * 1024 * 1024; // 150MB — STL/3MF phức tạp vẫn hiếm khi vượt mức này

/**
 * POST /api/quote/slice — bản 2 (slice thật bằng OrcaSlicer headless, KHÔNG phải ước lượng).
 *
 * Nhận multipart form-data { file, printerId?, peiSheetId?, filamentId?, infillPercent,
 * layerHeightMm, instanceCount, tyLeLoiNhuan? }. Lưu file, tạo Quote (sliceStatus "pending"), bắn
 * job sang slicer-worker rồi TRẢ VỀ NGAY quoteId — không đợi slice xong (có thể mất 10-100 giây).
 * Client tự poll GET /api/quote/slice/[id] để lấy kết quả.
 */
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return fail('Thiếu file', 400);
    if (!duoiFileHopLe(file.name)) return fail('Chỉ hỗ trợ file .stl hoặc .3mf', 400);
    if (file.size > GIOI_HAN_DUNG_LUONG) return fail('File vượt quá 150MB', 400);

    const printerId = (form.get('printerId') as string) || null;
    const peiSheetId = (form.get('peiSheetId') as string) || null;
    const filamentId = (form.get('filamentId') as string) || null;
    const infillPercent = Number(form.get('infillPercent')) || 15;
    const layerHeightMm = Number(form.get('layerHeightMm')) || 0.2;
    const instanceCount = Math.max(1, Number(form.get('instanceCount')) || 1);

    const duoi = path.extname(file.name).toLowerCase();
    const tenFileLuu = `${randomUUID()}${duoi}`;
    await mkdir(THU_MUC_UPLOAD, { recursive: true });
    await writeFile(path.join(THU_MUC_UPLOAD, tenFileLuu), Buffer.from(await file.arrayBuffer()));

    const printer = printerId ? await prisma.printer.findUnique({ where: { id: printerId } }) : null;

    const quote = await prisma.quote.create({
      data: {
        fileName: file.name,
        filePath: tenFileLuu,
        printerId,
        peiSheetId,
        filamentId,
        infillPercent,
        layerHeightMm,
        instanceCount,
        mode: 'slice',
        sliceStatus: 'pending',
      },
    });

    const jobBody = {
      jobId: quote.id,
      inputPath: tenFileLuu,
      infillPercent,
      layerHeightMm,
      printerModel: printer?.model || printer?.name || '',
      callbackUrl: `${QUOTE_CALLBACK_BASE_URL}/api/quote/slice/${quote.id}/complete`,
    };

    // Không đợi worker slice xong — chỉ đợi nó NHẬN job. Lỗi ở bước này (worker sập, sai token...)
    // thì đánh dấu luôn failed thay vì để client poll mãi một job không ai xử lý.
    fetch(`${SLICER_WORKER_URL}/slice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Worker-Token': SLICER_WORKER_TOKEN },
      body: JSON.stringify(jobBody),
    })
      .then(async (res) => {
        if (!res.ok) {
          await prisma.quote.update({
            where: { id: quote.id },
            data: { sliceStatus: 'failed', sliceError: `Worker từ chối job (HTTP ${res.status})` },
          });
        }
      })
      .catch(async (e) => {
        await prisma.quote.update({
          where: { id: quote.id },
          data: { sliceStatus: 'failed', sliceError: `Không gọi được slicer-worker: ${e.message}` },
        });
      });

    return ok(quote);
  } catch (error: unknown) {
    return fail(error instanceof Error ? error.message : 'Lỗi máy chủ');
  }
}
