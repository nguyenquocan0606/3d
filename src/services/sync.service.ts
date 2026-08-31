import prisma from '@/utils/db';
import { trangThaiDon } from '@/utils/bulk-production';

/**
 * Áp dụng thao tác app gửi lên từ hàng đợi offline.
 *
 * Xem `KE-HOACH-DONG-BO-OFFLINE.md` §2.1 — mỗi loại thao tác có luật riêng, **không
 * dùng chung một luật "ghi đè theo giờ mới nhất"**. Lý do nằm ở từng handler bên dưới.
 *
 * Điểm chung của mọi handler: chúng chạy khi thao tác đã xảy ra **trong quá khứ**
 * (thợ quẹt lúc mất mạng, có thể vài giờ trước), nên phải đối chiếu với trạng thái
 * hiện tại của server chứ không được ghi đè mù quáng.
 */

/**
 * Ghi dấu một bản ghi vừa bị xóa, để máy offline biết mà xóa theo.
 *
 * Gọi ngay sau khi xóa thành công. [bang] phải khớp đúng tên key trong payload
 * của `GET /api/sync` (VD "spools", "printItems") — app dùng nó để biết xóa ở
 * bảng nào trong CSDL cục bộ.
 *
 * **Không cần ghi cho bản ghi con bị xóa dây chuyền.** Xóa một đơn hàng sẽ kéo
 * theo OrderProduct và PrintItem qua ràng buộc Cascade của Postgres; app biết
 * quan hệ cha–con nên nhận tin đơn bị xóa là tự dọn con của nó.
 *
 * Không bao giờ ném lỗi: xóa đã thành công rồi, để việc ghi dấu làm hỏng response
 * thì người dùng tưởng xóa thất bại và bấm xóa lại.
 */
export async function ghiBiaMo(bang: string, banGhiId: string): Promise<void> {
  try {
    await prisma.syncTombstone.upsert({
      where: { bang_banGhiId: { bang, banGhiId } },
      create: { bang, banGhiId },
      // Xóa → tạo lại → xóa nữa: đẩy mốc lên lần xóa gần nhất, nếu không thì máy
      // nào đồng bộ sau lần xóa đầu sẽ không thấy lần xóa thứ hai.
      update: { xoaLuc: new Date() },
    });
  } catch (error) {
    console.warn(`[Đồng bộ] Không ghi được bia mộ ${bang}/${banGhiId}:`, error);
  }
}

/** Kết quả áp dụng một thao tác. */
export type KetQuaThaoTac = {
  ketQua: 'applied' | 'rejected';
  thongDiep?: string;
};

/**
 * Kết quả trả về cho app.
 *
 * Rộng hơn [KetQuaThaoTac] đúng một nhánh `duplicate` — nhánh đó không do handler
 * nào sinh ra mà do lớp chống gửi trùng chặn trước khi tới handler.
 */
export type KetQuaGuiLen = {
  ketQua: 'applied' | 'rejected' | 'duplicate';
  thongDiep?: string;
};

/** Một thao tác trong hàng đợi của app. */
export type ThaoTacDongBo = {
  id: string;
  loai: string;
  payload: Record<string, unknown>;
  /** Giờ thợ thao tác (đồng hồ máy PDA). */
  taoLuc: Date;
};

const nhan = (ok: boolean, thongDiep?: string): KetQuaThaoTac => ({
  ketQua: ok ? 'applied' : 'rejected',
  thongDiep,
});

const chuoi = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const so = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// ── Cuộn nhựa ────────────────────────────────────────────────────────────────

/**
 * Ghi khối lượng cân được.
 *
 * Ghi đè theo giờ mới nhất (LWW): hai máy cùng cân một cuộn thì số cân sau đúng
 * hơn. Nhưng nếu server đã có bản ghi mới hơn lúc thợ quẹt thì **không đè** — đè
 * vào là kéo lùi về số cân cũ.
 */
async function canCuon(t: ThaoTacDongBo): Promise<KetQuaThaoTac> {
  const spoolId = chuoi(t.payload.spoolId);
  const gram = so(t.payload.remainingWeightG);
  if (!spoolId || gram === null) return nhan(false, 'Thiếu mã cuộn hoặc khối lượng.');

  const cuon = await prisma.spool.findUnique({ where: { id: spoolId } });
  if (!cuon) return nhan(false, `Không tìm thấy cuộn ${spoolId}.`);

  if (cuon.updatedAt > t.taoLuc) {
    return nhan(
      false,
      `Cuộn ${spoolId} đã có số cân mới hơn (${cuon.remainingWeightG}g) sau lúc bạn cân. Số cân của bạn không được ghi.`,
    );
  }

  // Giữ đúng hành vi của PUT /api/spools/[id]/weight: hết nhựa thì chuyển
  // depleted, có nhựa lại thì về active, riêng archived là do người dùng chủ
  // động xếp kho nên không tự đổi.
  const status =
    cuon.status === 'archived' ? cuon.status : gram <= 0 ? 'depleted' : 'active';

  await prisma.spool.update({
    where: { id: spoolId },
    data: { remainingWeightG: gram, status },
  });
  return nhan(true);
}

/**
 * Xóa cuộn khi cân về 0g từ app mobile.
 *
 * Có kiểm tra mốc thời gian để một thao tác offline cũ không xóa nhầm cuộn mới
 * nếu mã đã được giải phóng rồi dùng lại.
 */
async function xoaCuonDaHet(t: ThaoTacDongBo): Promise<KetQuaThaoTac> {
  const spoolId = chuoi(t.payload.spoolId);
  if (!spoolId) return nhan(false, 'Thiếu mã cuộn.');

  const cuon = await prisma.spool.findUnique({ where: { id: spoolId } });
  if (!cuon) return nhan(true, `Cuộn ${spoolId} đã được xóa trước đó.`);

  if (cuon.createdAt > t.taoLuc) {
    return nhan(false, `Mã ${spoolId} đã được dùng cho cuộn mới sau lúc bạn cân — không xóa cuộn mới.`);
  }

  if (cuon.updatedAt > t.taoLuc && cuon.remainingWeightG > 0) {
    return nhan(false, `Cuộn ${spoolId} đã có số cân mới hơn (${cuon.remainingWeightG}g), nên không xóa.`);
  }

  await prisma.spool.delete({ where: { id: spoolId } });
  await ghiBiaMo('spools', spoolId);
  return nhan(true);
}

/** Gán / tháo cuộn khỏi kho, máy in, slot AMS. LWW như cân. */
async function ganCuon(t: ThaoTacDongBo): Promise<KetQuaThaoTac> {
  const spoolId = chuoi(t.payload.spoolId);
  if (!spoolId) return nhan(false, 'Thiếu mã cuộn.');

  const cuon = await prisma.spool.findUnique({ where: { id: spoolId } });
  if (!cuon) return nhan(false, `Không tìm thấy cuộn ${spoolId}.`);

  if (cuon.updatedAt > t.taoLuc) {
    return nhan(false, `Cuộn ${spoolId} đã được máy khác gán lại sau lúc bạn quẹt.`);
  }

  // `null` tường minh = tháo ra; không gửi field = giữ nguyên. Phân biệt bằng
  // `in` chứ không bằng falsy, vì tháo ra chính là gửi null.
  const data: Record<string, unknown> = {};
  if ('locationId' in t.payload) data.locationId = chuoi(t.payload.locationId) || null;
  if ('printerId' in t.payload) data.printerId = chuoi(t.payload.printerId) || null;
  if ('printerSlot' in t.payload) data.printerSlot = so(t.payload.printerSlot);
  if (Object.keys(data).length === 0) return nhan(false, 'Thao tác gán không có nội dung.');

  await prisma.spool.update({ where: { id: spoolId }, data });
  return nhan(true);
}

/**
 * Tạo cuộn nhựa — ngoại lệ duy nhất được tạo mới ở app.
 *
 * Mã cuộn do thợ tự đặt nên hai máy offline có thể đặt trùng. Trùng thì **từ chối
 * và báo**, không tự đổi tên: tem đã in và dán lên cuộn rồi, đổi mã ở server là
 * tem trên tay thợ trỏ vào cuộn khác.
 */
async function taoCuon(t: ThaoTacDongBo): Promise<KetQuaThaoTac> {
  const id = chuoi(t.payload.id);
  let filamentId = chuoi(t.payload.filamentId);
  const banDau = so(t.payload.initialWeightG);
  const conLai = so(t.payload.remainingWeightG);
  if (!id || banDau === null || conLai === null) {
    return nhan(false, 'Thiếu mã cuộn, khối lượng ban đầu hoặc khối lượng còn lại.');
  }

  const daCo = await prisma.spool.findUnique({ where: { id } });
  if (daCo) return nhan(false, 'Mã cuộn ' + id + ' đã tồn tại — máy khác đã tạo trước.');

  if (filamentId) {
    const loaiNhua = await prisma.filament.findUnique({ where: { id: filamentId } });
    if (!loaiNhua) return nhan(false, 'Không tìm thấy loại nhựa ' + filamentId + '.');
  } else {
    const type = chuoi(t.payload.type);
    const colorName = chuoi(t.payload.colorName);
    const brand = chuoi(t.payload.brand) || null;
    if (!type || !colorName) {
      return nhan(false, 'Thiếu loại nhựa hoặc tên màu để tạo cuộn.');
    }

    let loaiNhua = await prisma.filament.findFirst({
      where: {
        type: { equals: type, mode: 'insensitive' },
        colorName: { equals: colorName, mode: 'insensitive' },
        brand: brand ? { equals: brand, mode: 'insensitive' } : null,
      },
    });

    if (!loaiNhua) {
      loaiNhua = await prisma.filament.create({
        data: { type, colorName, colorHex: chuoi(t.payload.colorHex) || null, brand },
      });
    }
    filamentId = loaiNhua.id;
  }

  await prisma.spool.create({
    data: {
      id,
      filamentId,
      initialWeightG: banDau,
      remainingWeightG: conLai,
      emptySpoolWeightG: so(t.payload.emptySpoolWeightG) ?? 220,
      locationId: chuoi(t.payload.locationId) || null,
      printerId: chuoi(t.payload.printerId) || null,
    },
  });
  return nhan(true);
}

// ── Miếng in ─────────────────────────────────────────────────────────────────

const BAC_TRANG_THAI: Record<string, number> = { pending: 0, printing: 1, completed: 2 };

/**
 * Đổi trạng thái miếng in.
 *
 * **Không dùng LWW ở đây.** Trạng thái là chuỗi tiến tới
 * `pending → printing → completed`. Máy offline gửi lên "đặt thành printing" mà
 * server đã `completed` thì LWW sẽ kéo lùi một tem đã in xong — sai nghiệp vụ.
 * Luật đúng: chỉ tiến, không lùi. Đã ở bậc bằng hoặc cao hơn thì coi như xong
 * (`applied`), không báo lỗi — với thợ thì việc đó *đã* hoàn thành.
 */
async function datTrangThaiMiengIn(t: ThaoTacDongBo): Promise<KetQuaThaoTac> {
  const id = chuoi(t.payload.printItemId);
  const dich = chuoi(t.payload.status);
  if (!id || !(dich in BAC_TRANG_THAI)) return nhan(false, 'Thiếu mã tem hoặc trạng thái không hợp lệ.');

  const tem = await prisma.printItem.findUnique({ where: { id } });
  if (!tem) return nhan(false, `Không tìm thấy miếng in ${id}.`);

  if (BAC_TRANG_THAI[tem.status] >= BAC_TRANG_THAI[dich]) {
    return nhan(true, `Tem ${id} đã ở trạng thái ${tem.status}.`);
  }

  await prisma.printItem.update({ where: { id }, data: { status: dich } });
  return nhan(true);
}

/** Kiểm hàng đóng gói. Idempotent — kiểm rồi thì thôi, không phải lỗi. */
async function datDaKiem(t: ThaoTacDongBo): Promise<KetQuaThaoTac> {
  const id = chuoi(t.payload.printItemId);
  if (!id) return nhan(false, 'Thiếu mã tem.');

  const tem = await prisma.printItem.findUnique({ where: { id } });
  if (!tem) return nhan(false, `Không tìm thấy miếng in ${id}.`);
  if (tem.isChecked) return nhan(true, `Tem ${id} đã được kiểm trước đó.`);

  await prisma.printItem.update({ where: { id }, data: { isChecked: true } });
  return nhan(true);
}

/** Xếp miếng in vào mâm PEI. LWW — mâm sau là mâm đúng. */
async function xepVaoMam(t: ThaoTacDongBo): Promise<KetQuaThaoTac> {
  const id = chuoi(t.payload.printItemId);
  if (!id) return nhan(false, 'Thiếu mã tem.');

  const tem = await prisma.printItem.findUnique({ where: { id } });
  if (!tem) return nhan(false, `Không tìm thấy miếng in ${id}.`);
  if (tem.updatedAt > t.taoLuc) return nhan(false, `Tem ${id} đã được xếp lại sau lúc bạn quẹt.`);

  const mamId = chuoi(t.payload.peiSheetId) || null;
  if (mamId) {
    const mam = await prisma.peiSheet.findUnique({ where: { id: mamId } });
    if (!mam) return nhan(false, `Không tìm thấy mâm ${mamId} — có thể đã bị xóa ở web.`);
  }

  await prisma.printItem.update({ where: { id }, data: { peiSheetId: mamId } });
  return nhan(true);
}

// ── Lượt in đơn SLL ──────────────────────────────────────────────────────────

/** Đồng bộ lại trạng thái đơn SLL theo toàn bộ lượt — port từ /api/bulk-runs/scan. */
async function dongBoTrangThaiDonSLL(orderId: string) {
  const cacLuot = await prisma.bulkRun.findMany({ where: { orderId }, select: { status: true } });
  const status = trangThaiDon(cacLuot.map((r) => r.status));
  await prisma.bulkOrder.update({ where: { id: orderId }, data: { status } });
}

/**
 * Bắt đầu lượt in.
 *
 * Chỉ hợp lệ khi lượt còn `pending`. Lượt đã chạy rồi thì **từ chối, không ghi
 * đè**: mốc `startedAt` và máy in của lần check-in trước là dữ liệu thật đã dùng
 * để tính thời lượng in, đè lên là làm hỏng lịch sử sản xuất.
 *
 * `startedAt` lấy theo giờ thợ quẹt (`taoLuc`), **không phải** giờ server nhận —
 * thao tác này có thể nằm trong hàng đợi vài giờ, lấy giờ nhận là sai hẳn thời
 * lượng in. Đổi lại phải chấp nhận đồng hồ PDA có thể lệch đôi chút.
 */
async function batDauLuotIn(t: ThaoTacDongBo): Promise<KetQuaThaoTac> {
  const runId = chuoi(t.payload.runId);
  const printerId = chuoi(t.payload.printerId);
  if (!runId) return nhan(false, 'Thiếu mã lượt in.');

  const luot = await prisma.bulkRun.findUnique({ where: { id: runId }, include: { order: true } });
  if (!luot) return nhan(false, `Không tìm thấy lượt in ${runId}.`);

  if (luot.status !== 'pending') {
    const moTa = luot.status === 'printing' ? 'đang in' : 'đã in xong';
    return nhan(false, `Lượt ${luot.printerName} · PEI ${luot.peiIndex} ${moTa} rồi — máy khác đã quẹt trước.`);
  }

  let may = null;
  if (printerId) {
    may = await prisma.printer.findUnique({ where: { id: printerId } });
    if (!may) return nhan(false, `Không tìm thấy máy in ${printerId}.`);
  }

  await prisma.bulkRun.update({
    where: { id: runId },
    data: {
      status: 'printing',
      startedAt: t.taoLuc,
      finishedAt: null,
      ...(may && { printerId: may.id, printerName: may.name }),
    },
  });
  await dongBoTrangThaiDonSLL(luot.orderId);
  return nhan(true);
}

/**
 * Chốt in xong.
 *
 * Chỉ hợp lệ khi lượt đang `printing`. Đã `completed` thì từ chối — số con lỗi
 * của hai lần quẹt có thể khác nhau, im lặng đè lên là mất số liệu hàng lỗi.
 */
async function ketThucLuotIn(t: ThaoTacDongBo): Promise<KetQuaThaoTac> {
  const runId = chuoi(t.payload.runId);
  if (!runId) return nhan(false, 'Thiếu mã lượt in.');

  const luot = await prisma.bulkRun.findUnique({ where: { id: runId } });
  if (!luot) return nhan(false, `Không tìm thấy lượt in ${runId}.`);

  if (luot.status === 'pending') {
    return nhan(false, `Lượt ${luot.printerName} · PEI ${luot.peiIndex} chưa từng được bắt đầu.`);
  }
  if (luot.status === 'completed') {
    return nhan(false, `Lượt ${luot.printerName} · PEI ${luot.peiIndex} đã được chốt xong trước đó.`);
  }

  const soLoi = Math.max(0, Math.floor(so(t.payload.defectQuantity) ?? 0));
  await prisma.bulkRun.update({
    where: { id: runId },
    data: { status: 'completed', finishedAt: t.taoLuc, defectQuantity: soLoi },
  });
  await dongBoTrangThaiDonSLL(luot.orderId);
  return nhan(true);
}

/**
 * Kiểm hàng lại 1 lượt đã in xong.
 *
 * Chỉ nhận lượt `completed` — kiểm mâm chưa in xong là quẹt nhầm mã. Idempotent:
 * quẹt lại lượt đã kiểm thì giữ nguyên mốc cũ, vì mốc đầu tiên mới là lúc thợ
 * thật sự cầm mâm lên đếm.
 */
async function kiemLuotIn(t: ThaoTacDongBo): Promise<KetQuaThaoTac> {
  const runId = chuoi(t.payload.runId);
  if (!runId) return nhan(false, 'Thiếu mã lượt in.');

  const luot = await prisma.bulkRun.findUnique({ where: { id: runId } });
  if (!luot) return nhan(false, `Không tìm thấy lượt in ${runId}.`);

  if (luot.status !== 'completed') {
    return nhan(false, `Lượt ${luot.printerName} · PEI ${luot.peiIndex} chưa in xong nên chưa kiểm được.`);
  }
  if (luot.verifiedAt) {
    return nhan(true, `Lượt ${luot.printerName} · PEI ${luot.peiIndex} đã được kiểm trước đó.`);
  }

  await prisma.bulkRun.update({ where: { id: runId }, data: { verifiedAt: t.taoLuc } });
  return nhan(true);
}

// ── Kiểm kho ─────────────────────────────────────────────────────────────────

/** Quét kiểm kho. Idempotent hoàn toàn — quét lại chỉ đẩy `scannedAt`. */
async function quetKiemKho(t: ThaoTacDongBo): Promise<KetQuaThaoTac> {
  const spoolId = chuoi(t.payload.spoolId);
  if (!spoolId) return nhan(false, 'Thiếu mã cuộn.');

  const cuon = await prisma.spool.findUnique({ where: { id: spoolId } });
  if (!cuon) return nhan(false, `Không tìm thấy cuộn ${spoolId}.`);

  const phien = await prisma.inventorySession.findFirst({
    where: { active: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!phien) return nhan(false, 'Không có phiên kiểm kho nào đang mở.');

  // Phiên hiện tại mở sau lúc thợ quẹt = thợ đang kiểm cho phiên đã bị đóng.
  // Ghi vào phiên mới là làm sai số liệu của cả hai phiên.
  if (phien.createdAt > t.taoLuc) {
    return nhan(false, `Phiên kiểm kho đã được làm mới sau lúc bạn quẹt cuộn ${spoolId}.`);
  }

  await prisma.inventoryItem.upsert({
    where: { sessionId_spoolId: { sessionId: phien.id, spoolId } },
    create: { sessionId: phien.id, spoolId, scannedAt: t.taoLuc },
    update: { scannedAt: t.taoLuc },
  });
  return nhan(true);
}

// ── Hàng hóa ─────────────────────────────────────────────────────────────────

/**
 * Nhập / xuất kho hàng hóa.
 *
 * **Phải là phép cộng, không phải phép gán.** Hai máy cùng offline, mỗi máy xuất
 * 10 cái: phép gán làm mất một lần xuất, phép cộng ra đúng 20. Đây cũng là lý do
 * `PUT /api/store-products` (full-replace) không dùng được cho luồng này.
 *
 * Tồn kho xuống âm thì **vẫn ghi và cảnh báo**, không chặn — kho thực tế đã âm
 * rồi, chặn lại chỉ làm mất dấu vết chứ không làm hàng xuất hiện trở lại.
 */
async function dieuChinhTonKho(t: ThaoTacDongBo): Promise<KetQuaThaoTac> {
  const productId = chuoi(t.payload.productId);
  const delta = so(t.payload.delta);
  if (!productId || delta === null || delta === 0) {
    return nhan(false, 'Thiếu mã hàng hóa hoặc số lượng thay đổi.');
  }

  const hang = await prisma.storeProduct.findUnique({ where: { id: productId } });
  if (!hang) return nhan(false, `Không tìm thấy hàng hóa ${productId}.`);

  const buoc = Math.trunc(delta);
  const tonMoi = hang.soLuong + buoc;

  const lyDo = chuoi(t.payload.lyDo) || (buoc > 0 ? 'Nhập kho' : 'Xuất kho');
  const ghi = {
    id: t.id, // uuid thao tác — trùng khóa chống gửi lại, nên lịch sử không nhân đôi
    thoiGian: t.taoLuc.toISOString(),
    noiDung: `${lyDo}: ${buoc > 0 ? '+' : ''}${buoc} ${hang.donVi} (còn ${tonMoi}) — từ app`,
  };
  const lichSu = Array.isArray(hang.lichSu) ? hang.lichSu : [];

  await prisma.storeProduct.update({
    where: { id: productId },
    data: {
      soLuong: { increment: buoc },
      lichSu: [ghi, ...lichSu].slice(0, 500),
      ngayCapNhat: new Date().toISOString(),
    },
  });

  return nhan(
    true,
    tonMoi < 0 ? `Tồn kho ${hang.ten} đang âm (${tonMoi}) — kiểm lại kho thực tế.` : undefined,
  );
}

// ── Bảng điều phối ───────────────────────────────────────────────────────────

const BO_XU_LY: Record<string, (t: ThaoTacDongBo) => Promise<KetQuaThaoTac>> = {
  'spool.weigh': canCuon,
  'spool.deleteWhenEmpty': xoaCuonDaHet,
  'spool.bind': ganCuon,
  'spool.create': taoCuon,
  'printItem.setStatus': datTrangThaiMiengIn,
  'printItem.setChecked': datDaKiem,
  'printItem.assignSheet': xepVaoMam,
  'bulkRun.checkIn': batDauLuotIn,
  'bulkRun.checkOut': ketThucLuotIn,
  'bulkRun.verify': kiemLuotIn,
  'inventory.scanSpool': quetKiemKho,
  'store.adjustStock': dieuChinhTonKho,
};

/** Các bảng bị ảnh hưởng theo loại thao tác — dùng để báo MQTT cho máy khác. */
const BANG_ANH_HUONG: Record<string, string[]> = {
  'spool.weigh': ['spools'],
  'spool.deleteWhenEmpty': ['spools'],
  'spool.bind': ['spools'],
  'spool.create': ['spools'],
  'printItem.setStatus': ['printItems'],
  'printItem.setChecked': ['printItems'],
  'printItem.assignSheet': ['printItems'],
  'bulkRun.checkIn': ['bulkRuns', 'bulkOrders'],
  'bulkRun.checkOut': ['bulkRuns', 'bulkOrders'],
  'bulkRun.verify': ['bulkRuns'],
  'inventory.scanSpool': ['inventory'],
  'store.adjustStock': ['storeProducts'],
};

export const LOAI_THAO_TAC_HOP_LE = Object.keys(BO_XU_LY);

export function bangBiAnhHuong(loai: string): string[] {
  return BANG_ANH_HUONG[loai] ?? [];
}

/**
 * Áp dụng một thao tác, có chống gửi trùng.
 *
 * Chống trùng là bắt buộc chứ không phải tối ưu: mất mạng giữa lúc POST thì app
 * không biết server đã nhận chưa nên buộc phải gửi lại. Không có bảng `SyncAction`
 * thì mỗi lần gửi lại là thêm một lần check-in, sai lịch sử sản xuất.
 */
export async function apDungThaoTac(
  t: ThaoTacDongBo,
  thietBi?: string,
): Promise<KetQuaGuiLen> {
  const daCo = await prisma.syncAction.findUnique({ where: { id: t.id } });
  if (daCo) {
    return { ketQua: 'duplicate', thongDiep: daCo.thongDiep ?? undefined };
  }

  const xuLy = BO_XU_LY[t.loai];
  if (!xuLy) {
    // Cố ý **không** ghi vào SyncAction. Loại lạ gần như luôn có nghĩa là app mới
    // hơn server (thợ đã cập nhật app, máy chủ thì chưa). Ghi lại thì sau khi nâng
    // cấp server, thao tác đó gửi lên sẽ bị chặn là `duplicate` và vĩnh viễn không
    // bao giờ chạy. Không ghi thì nâng cấp xong nó tự vào.
    return { ketQua: 'rejected', thongDiep: `Không hiểu thao tác "${t.loai}".` };
  }

  let ketQua: KetQuaThaoTac;
  try {
    ketQua = await xuLy(t);
  } catch (error: unknown) {
    ketQua = nhan(false, error instanceof Error ? error.message : 'Lỗi máy chủ khi áp dụng thao tác.');
  }

  // Ghi nhật ký **cả khi bị từ chối**: gửi lại lần nữa vẫn phải ra cùng kết quả,
  // và đây là chỗ duy nhất truy được vì sao thao tác của thợ không vào.
  await prisma.syncAction.create({
    data: {
      id: t.id,
      loai: t.loai,
      payload: t.payload as never,
      taoLuc: t.taoLuc,
      ketQua: ketQua.ketQua,
      thongDiep: ketQua.thongDiep ?? null,
      thietBi: thietBi ?? null,
    },
  });

  return ketQua;
}
