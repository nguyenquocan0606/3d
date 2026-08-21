import { ok, fail } from '@/utils/api-response';
import {
  LoiWorkerKhongChay,
  batDauDangNhapQR,
  dangXuat,
  ketNoiLai,
  khoiDongLaiWorker,
  layTrangThai,
  themTaiKhoan,
  xoaTaiKhoan,
} from '@/services/zalo.service';

/**
 * GET /api/zalo/status — trạng thái TẤT CẢ tài khoản Zalo + mã QR đang chờ quét (nếu có).
 * Tab Zalo poll endpoint này khi đang ở màn đăng nhập, vì mã QR chỉ sống mấy chục giây.
 */
export async function GET() {
  try {
    return ok(await layTrangThai());
  } catch (error: unknown) {
    return fail(error instanceof Error ? error.message : 'Lỗi máy chủ');
  }
}

/**
 * POST /api/zalo/status — body { hanhDong, accountId?, nhan? }
 * hanhDong: 'them' | 'dang-nhap' | 'dang-xuat' | 'xoa' | 'ket-noi-lai' | 'khoi-dong-lai'
 */
export async function POST(req: Request) {
  try {
    const { hanhDong, accountId, nhan } = (await req.json().catch(() => ({}))) as {
      hanhDong?: string;
      accountId?: string;
      nhan?: string;
    };

    if (hanhDong === 'them') {
      const acc = await themTaiKhoan(nhan);
      return ok(acc, `Đã thêm tài khoản "${acc.nhan}". Bấm Đăng nhập để quét QR.`);
    }
    if (hanhDong === 'khoi-dong-lai') {
      await khoiDongLaiWorker();
      return ok({ ok: true }, 'Worker đang khởi động lại, chờ khoảng 10 giây rồi làm mới.');
    }

    // Các hành động còn lại đều cần biết tài khoản nào.
    if (!accountId) return fail('Thiếu tài khoản', 400);

    if (hanhDong === 'dang-nhap') {
      await batDauDangNhapQR(accountId);
      return ok({ ok: true }, 'Đang tạo mã QR, chờ vài giây rồi quét bằng app Zalo.');
    }
    if (hanhDong === 'ket-noi-lai') {
      await ketNoiLai(accountId);
      return ok({ ok: true }, 'Đã kết nối lại tài khoản.');
    }
    if (hanhDong === 'dang-xuat') {
      await dangXuat(accountId);
      return ok({ ok: true }, 'Đã đăng xuất tài khoản.');
    }
    if (hanhDong === 'xoa') {
      await xoaTaiKhoan(accountId);
      return ok({ ok: true }, 'Đã xóa tài khoản cùng toàn bộ hội thoại của nó.');
    }

    return fail('Hành động không hợp lệ', 400);
  } catch (error: unknown) {
    // Worker chưa chạy là lỗi cấu hình của người dùng, không phải sự cố máy chủ — trả 503 để UI
    // hiện đúng hướng dẫn thay vì "Lỗi máy chủ" chung chung.
    if (error instanceof LoiWorkerKhongChay) return fail(error.message, 503);
    return fail(error instanceof Error ? error.message : 'Lỗi máy chủ');
  }
}
