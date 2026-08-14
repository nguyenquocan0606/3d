import prisma from '@/utils/db';
import { ok, fail } from '@/utils/api-response';
import { taoAnhDaiDien } from '@/utils/anh-dai-dien';
import {
  chuanHoaHeSoCombo,
  chuanHoaTyLeLoiNhuan,
  tinhGiaCombo,
  tinhGiaGocCombo,
  tinhSoLuongCombo,
} from '@/utils/dinh-gia-hang-hoa';
import { khoiPhucTuMeta, rutGonMeta, type TepLuu } from '@/utils/tep-dinh-kem';

/**
 * API cho tab "Hàng hóa cửa hàng".
 * Client giữ toàn bộ state và đồng bộ dữ liệu (sanPham + truongRieng) lên server.
 *
 * Mảng `anh` (ảnh gốc base64) và `tepIn` (file in — gcode/3mf có thể vài chục MB) của TỪNG hàng
 * hóa có thể rất nặng, nên GET danh sách chỉ trả về `anhDaiDien` (thumbnail nhỏ) và metadata file
 * in (không có dữ liệu base64) — dữ liệu gốc chỉ tải riêng qua GET .../[id]/anh hoặc .../[id]/tep-in
 * khi người dùng thực sự mở tab tương ứng.
 * Tương ứng, PUT chỉ ghi đè `anh`/`tepIn` của một hàng hóa khi client thực sự gửi kèm (tức đã tải
 * đầy đủ) — nếu client gửi thiếu trường này (hàng hóa chưa được mở/tải), server giữ nguyên dữ liệu
 * cũ thay vì hiểu nhầm là "xóa hết".
 */

type AnhSanPhamLuu = TepLuu;
type TepInLuu = TepLuu;

interface SanPhamPayload {
  id: string;
  maQR: string;
  ten: string;
  danhMuc: string;
  giaVon: number;
  /** % lợi nhuận dùng tính giá bán lẻ — thiếu/không hợp lệ thì server dùng mặc định 40%. */
  tyLeLoiNhuan?: number;
  soLuong: number;
  donVi: string;
  nguongCanhBao: number;
  nhaCungCap: string;
  ghiChu: string;
  thongTinRieng: Record<string, string>;
  /** undefined = ảnh chưa được client tải đầy đủ — giữ nguyên giá trị hiện có trên server. */
  anh?: AnhSanPhamLuu[];
  /** undefined = file in chưa được client tải đầy đủ — giữ nguyên giá trị hiện có trên server. */
  tepIn?: TepInLuu[];
  lichSu: unknown[];
  ngayTao: string;
  ngayCapNhat: string;
  parentId?: string | null;
  soLuongCombo?: number | null;
  /** Chỉ ở sản phẩm mẹ — hệ số nhân ra giá 3 combo con. Thiếu/sai thì server vá về mặc định. */
  heSoCombo?: unknown;
}

const CONFIG_ID = 'main';

export async function GET() {
  try {
    const [products, config] = await Promise.all([
      prisma.storeProduct.findMany({
        orderBy: { ngayCapNhat: 'desc' },
        // Liệt kê cột tường minh để KHÔNG đọc `anh`/`tepIn` — 2 cột base64 này cộng lại có thể vài
        // trăm MB, đọc hết rồi vứt bỏ trong JS làm request mất ~7s. Metadata cần cho danh sách đã
        // nằm sẵn ở `anhMeta`/`tepInMeta`.
        select: {
          id: true,
          maQR: true,
          ten: true,
          danhMuc: true,
          giaVon: true,
          tyLeLoiNhuan: true,
          gia: true,
          giaBanLe: true,
          giaKhuyenMai: true,
          soLuong: true,
          donVi: true,
          nguongCanhBao: true,
          nhaCungCap: true,
          ghiChu: true,
          thongTinRieng: true,
          anhDaiDien: true,
          anhMeta: true,
          tepInMeta: true,
          lichSu: true,
          ngayTao: true,
          ngayCapNhat: true,
          parentId: true,
          soLuongCombo: true,
          heSoCombo: true,
        },
      }),
      prisma.storeConfig.findUnique({ where: { id: CONFIG_ID } }),
    ]);

    const sanPham = products.map((p) => ({
      id: p.id,
      maQR: p.maQR,
      ten: p.ten,
      danhMuc: p.danhMuc,
      giaVon: p.giaVon,
      tyLeLoiNhuan: p.tyLeLoiNhuan,
      gia: p.gia,
      giaBanLe: p.giaBanLe,
      giaKhuyenMai: p.giaKhuyenMai,
      soLuong: p.soLuong,
      donVi: p.donVi,
      nguongCanhBao: p.nguongCanhBao,
      nhaCungCap: p.nhaCungCap,
      ghiChu: p.ghiChu,
      thongTinRieng: p.thongTinRieng ?? {},
      anhDaiDien: p.anhDaiDien ?? null,
      // Giữ nguyên số lượng/metadata từng ảnh/file để hiển thị đếm số lượng, nhưng bỏ dữ liệu base64 nặng.
      anh: khoiPhucTuMeta(p.anhMeta),
      tepIn: khoiPhucTuMeta(p.tepInMeta),
      lichSu: p.lichSu ?? [],
      ngayTao: p.ngayTao,
      ngayCapNhat: p.ngayCapNhat,
      parentId: p.parentId,
      soLuongCombo: p.soLuongCombo,
      // Combo con không dùng cột này; hàng mẹ chưa có thì trả về bộ mặc định để client khỏi tự vá.
      heSoCombo: p.parentId ? null : chuanHoaHeSoCombo(p.heSoCombo),
    }));

    return ok({
      sanPham,
      truongRieng: config?.truongRieng ?? null, // null = client dùng bộ cột mặc định
    });
  } catch (error: unknown) {
    console.error('[API StoreProducts] GET error:', error);
    return fail(error instanceof Error ? error.message : 'Lỗi máy chủ');
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { sanPham, truongRieng } = body as {
      sanPham: SanPhamPayload[];
      truongRieng: unknown[];
    };

    if (!Array.isArray(sanPham) || !Array.isArray(truongRieng)) {
      return fail('Dữ liệu không hợp lệ (cần sanPham[] và truongRieng[])', 400);
    }

    // Tính thumbnail TRƯỚC khi vào transaction (không giữ transaction mở trong lúc decode/encode ảnh).
    // Chỉ tính cho hàng hóa có gửi kèm `anh` — hàng hóa chưa tải đầy đủ ảnh sẽ không đụng tới cột này.
    const anhDaiDienTheoId = new Map<string, string | null>();
    await Promise.all(
      sanPham
        .filter((p): p is SanPhamPayload & { anh: AnhSanPhamLuu[] } => Array.isArray(p.anh))
        .map(async (p) => {
          anhDaiDienTheoId.set(p.id, await taoAnhDaiDien(p.anh[0]?.duLieu));
        }),
    );

    // gia/giaBanLe/giaKhuyenMai luôn tính lại từ giaVon + tyLeLoiNhuan theo công thức chung (bỏ qua giá trị client gửi
    // cho các field này, nếu có) — đảm bảo không bao giờ lệch công thức dù client có bug hay không.
    // Sản phẩm mẹ phải upsert TRƯỚC sản phẩm con combo (FK parentId) — sắp lại thứ tự trước khi lặp.
    const sanPhamDaSapXep = [...sanPham].sort((a, b) => (a.parentId ? 1 : 0) - (b.parentId ? 1 : 0));

    // Tồn kho, giá & % lợi nhuận của combo con luôn tính lại từ mẹ TRONG CHÍNH LẦN ĐỒNG BỘ NÀY
    // (không đọc DB cũ) — dùng giá trị sản phẩm mẹ mà client vừa gửi lên, kể cả khi mẹ cũng vừa đổi cùng lúc.
    const soLuongMoiTheoId = new Map(sanPham.map((p) => [p.id, Number(p.soLuong) || 0]));
    const tyLeLoiNhuanMoiTheoId = new Map(sanPham.map((p) => [p.id, chuanHoaTyLeLoiNhuan(p.tyLeLoiNhuan)]));
    // Bộ giá gốc của từng hàng mẹ (tự tính lại, không tin số client gửi) — combo con nhân từ đây ra.
    const giaGocTheoId = new Map(
      sanPham.map((p) => [p.id, tinhGiaGocCombo(Number(p.giaVon) || 0, chuanHoaTyLeLoiNhuan(p.tyLeLoiNhuan))]),
    );
    const heSoComboTheoId = new Map(sanPham.map((p) => [p.id, chuanHoaHeSoCombo(p.heSoCombo)]));

    await prisma.$transaction(async (tx) => {
      // Xóa sản phẩm không còn trong bộ dữ liệu gửi lên
      const incomingIds = sanPham.map((p) => p.id);
      await tx.storeProduct.deleteMany({
        where: incomingIds.length > 0 ? { id: { notIn: incomingIds } } : {},
      });

      // Upsert từng sản phẩm
      for (const p of sanPhamDaSapXep) {
        const anhDaGuiKem = Array.isArray(p.anh);
        const tepInDaGuiKem = Array.isArray(p.tepIn);
        const laCombo = Boolean(p.parentId && p.soLuongCombo);
        // Combo con dùng chung % lợi nhuận với mẹ (giống tồn kho — không sửa riêng được).
        const tyLeLoiNhuan = laCombo
          ? (tyLeLoiNhuanMoiTheoId.get(p.parentId!) ?? chuanHoaTyLeLoiNhuan(undefined))
          : chuanHoaTyLeLoiNhuan(p.tyLeLoiNhuan);
        // Cả 4 giá của combo = giá tương ứng của mẹ × hệ số riêng của mẹ; hàng lẻ đi dây chuyền
        // giá vốn → % lợi nhuận → bù phí sàn như cũ.
        const giaGocMe = laCombo ? giaGocTheoId.get(p.parentId!) : undefined;
        const { giaVon, gia, giaBanLe, giaKhuyenMai } =
          laCombo && giaGocMe
            ? tinhGiaCombo(giaGocMe, p.soLuongCombo!, heSoComboTheoId.get(p.parentId!) ?? chuanHoaHeSoCombo(undefined))
            : tinhGiaGocCombo(Number(p.giaVon) || 0, tyLeLoiNhuan);
        const soLuong = laCombo
          ? tinhSoLuongCombo(soLuongMoiTheoId.get(p.parentId!) ?? 0, p.soLuongCombo!)
          : Math.max(0, Number(p.soLuong) || 0);
        const data = {
          maQR: p.maQR,
          ten: p.ten,
          danhMuc: p.danhMuc || 'Chưa phân loại',
          giaVon,
          tyLeLoiNhuan,
          gia,
          giaBanLe,
          giaKhuyenMai,
          soLuong,
          donVi: p.donVi || 'cái',
          nguongCanhBao: Number(p.nguongCanhBao) || 0,
          nhaCungCap: p.nhaCungCap || '',
          ghiChu: p.ghiChu || '',
          thongTinRieng: (p.thongTinRieng ?? {}) as object,
          lichSu: (p.lichSu ?? []) as object[],
          ngayTao: p.ngayTao,
          ngayCapNhat: p.ngayCapNhat,
          parentId: p.parentId || null,
          soLuongCombo: p.soLuongCombo ?? null,
          // Chỉ hàng mẹ mới giữ hệ số; combo con để null cho khỏi có 2 nguồn sự thật.
          heSoCombo: laCombo ? undefined : (heSoComboTheoId.get(p.id) as object),
          // Chỉ đưa `anh`/`anhDaiDien`/`tepIn` vào bộ cập nhật khi client thực sự gửi kèm — thiếu
          // trường này nghĩa là hàng hóa chưa được mở ra để tải đầy đủ, không phải đã xóa hết.
          // `anhMeta`/`tepInMeta` luôn đi kèm cột gốc để GET danh sách đọc được metadata mà không
          // phải chạm vào base64 — ghi lệch 2 cột này là danh sách sẽ hiển thị sai số lượng ảnh/file.
          ...(anhDaGuiKem
            ? {
                anh: p.anh as object[],
                anhMeta: rutGonMeta(p.anh!) as object[],
                anhDaiDien: anhDaiDienTheoId.get(p.id) ?? null,
              }
            : {}),
          ...(tepInDaGuiKem ? { tepIn: p.tepIn as object[], tepInMeta: rutGonMeta(p.tepIn!) as object[] } : {}),
        };
        await tx.storeProduct.upsert({
          where: { id: p.id },
          update: data,
          create: {
            id: p.id,
            ...data,
            anh: anhDaGuiKem ? (p.anh as object[]) : [],
            anhMeta: anhDaGuiKem ? (rutGonMeta(p.anh!) as object[]) : [],
            anhDaiDien: anhDaGuiKem ? (anhDaiDienTheoId.get(p.id) ?? null) : null,
            tepIn: tepInDaGuiKem ? (p.tepIn as object[]) : [],
            tepInMeta: tepInDaGuiKem ? (rutGonMeta(p.tepIn!) as object[]) : [],
          },
          // Không có `select`, Prisma sinh `RETURNING *` — kéo ngược cả `anh`/`tepIn` (vài chục MB
          // mỗi hàng) về chỉ để vứt đi, khiến 1 lần đồng bộ ~110 hàng mất ~7s.
          select: { id: true },
        });
      }

      // Lưu cấu hình cột tùy biến
      await tx.storeConfig.upsert({
        where: { id: CONFIG_ID },
        update: { truongRieng: truongRieng as object[] },
        create: { id: CONFIG_ID, truongRieng: truongRieng as object[] },
      });
    }, {
      // Mặc định Prisma chỉ cho 5s/1 transaction — không đủ khi upsert hàng chục sản phẩm kèm 1 file in
      // nặng (gcode/3mf hàng chục MB). Nới lên vì đây là 1 lần đồng bộ toàn bộ, không phải hot path.
      timeout: 60_000,
      maxWait: 10_000,
    });

    return ok(true, 'Đã đồng bộ dữ liệu cửa hàng');
  } catch (error: unknown) {
    console.error('[API StoreProducts] PUT error:', error);
    return fail(error instanceof Error ? error.message : 'Lỗi máy chủ');
  }
}
