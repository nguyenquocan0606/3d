import prisma from '@/utils/db';
import { dungHeaderMisa, layCredentialMisa, misaBaseUrl } from './misa.service';

const REFERER_DON_HANG = 'https://amisapp.misa.vn/eshop/management/general-order';
const SYNC_STATE_ID = 'default';

/** Mỗi request MISA lấy tối đa 50 đơn (đúng như trang web MISA gọi) rồi lật trang bằng `skip`. */
const SO_DON_MOI_TRANG = 50;
/** Chặn vòng lặp lật trang chạy vô hạn nếu MISA trả dữ liệu bất thường. */
const SO_TRANG_TOI_DA = 40;

/**
 * Danh sách cột của view 42 (màn "Đơn hàng" trên MISA). Bắt buộc gửi kèm, MISA dùng nó để quyết định
 * trả về những trường nào — bỏ đi thì response thiếu `Details`, `sku_code`...
 */
const COLUMNS_DON_HANG =
  '218,881,760,994,1909,351,2282,672,585,40,141,220,39,206,1202,471,2143,671,283,666,207,37,120,424,1030,646,848,859,205,1248,670,841,842,234,41,1544,557,1640';

/**
 * Bộ lọc MISA dùng mã số field + mã toán tử:
 *   field 41 = chi nhánh, 39 = ngày chứng từ (ref_date), 218 = trạng thái đơn
 *   op 7 = bằng, 10 = lớn hơn hoặc bằng, 12 = nhỏ hơn hoặc bằng
 * Ta cố tình KHÔNG lọc theo trạng thái: kéo hết mọi đơn trong khoảng ngày (kể cả đã hoàn tất) để
 * còn trừ tồn kho, rồi lọc trạng thái ở phía web mình.
 */
function dungBoLoc(brid: string, tuNgayIso: string, denNgayIso: string) {
  return [
    { op: 7, aop: 1, field: '41', ors: [], isOptionFilter: false, value: brid },
    { op: 10, aop: 1, field: '39', ors: [], isOptionFilter: false, value: tuNgayIso },
    { op: 12, aop: 1, field: '39', ors: [], isOptionFilter: false, value: denNgayIso },
  ];
}

export type MisaOrderItem = {
  inventory_item_id?: string | null;
  inventory_item_name?: string | null;
  sku_code?: string | null;
  quantity?: number | string | null;
  unit_name?: string | null;
  url_image?: string | null;
};

export type MisaOrder = {
  order_id: string;
  ref_no?: string | null;
  order_no?: string | null;
  ecom_order_no?: string | null;
  channel_id?: number | null;
  channel_name?: string | null;
  partner_object_name?: string | null;
  order_status?: number | null;
  partner_order_status?: string | null;
  payment_status?: number | null;
  payment_method?: string | null;
  shipping_partner_name?: string | null;
  delivery_code?: string | null;
  total_revenue?: number | string | null;
  total_amount?: number | string | null;
  ref_date?: string | null;
  create_time?: string | null;
  prepare_due_time?: string | null;
  shipping_date?: string | null;
  complete_date?: string | null;
  Details?: MisaOrderItem[] | null;
};

/** Lỗi có thông báo đọc được cho người dùng — route bắt lại rồi trả 400/502 kèm đúng câu này. */
export class LoiEshop extends Error {}

function soHoac0(gt: unknown): number {
  const n = Number(gt);
  return Number.isFinite(n) ? n : 0;
}

function ngayHoacNull(gt: unknown): Date | null {
  if (typeof gt !== 'string' || !gt.trim()) return null;
  const d = new Date(gt);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Còn dưới ngần này thì gia hạn trước, đừng đợi hết hạn hẳn mới xử lý. */
const NGUONG_GIA_HAN_MS = 2 * 60 * 60 * 1000;

/**
 * Tự gia hạn Bearer token bằng refresh token trước khi gọi MISA.
 *
 * Token MISA chỉ sống ~20,5 tiếng nên nếu không có bước này thì cứ mỗi ngày người dùng lại phải vào
 * đăng nhập tay. Gia hạn hỏng thì KHÔNG ném lỗi — cứ để request đi tiếp bằng token cũ, MISA sẽ trả
 * IsAuthExpired và thông báo đó rõ nghĩa hơn cho người dùng.
 */
async function tuGiaHanNeuSapHetHan() {
  try {
    const row = await prisma.misaCredential.findUnique({ where: { id: 'default' } });
    if (!row?.refreshToken) return;

    const conLai = row.tokenExpiresAt ? row.tokenExpiresAt.getTime() - Date.now() : 0;
    if (row.tokenExpiresAt && conLai > NGUONG_GIA_HAN_MS) return;

    const { lamMoiTokenEshop } = await import('./misa-login.service');
    const kq = await lamMoiTokenEshop();
    console.log(`[eShop] Tự gia hạn token: ${kq.message}`);
  } catch (error) {
    console.error('[eShop] Gia hạn token thất bại:', error instanceof Error ? error.message : error);
  }
}

export type YeuCauMisa = {
  url: string;
  headers: Record<string, string>;
  /** Thân request cho trang đầu; đổi `skip` để lật trang. */
  body: Record<string, unknown>;
  take: number;
  maxPages: number;
};

/**
 * Dựng sẵn request gọi MISA. Tách riêng vì có 2 nơi thực thi: server gọi thẳng, hoặc gửi cả gói này
 * cho agent trên máy chính gọi hộ (xem `goiQuaMayChinh`).
 */
export async function dungYeuCauMisa(tuNgayIso: string, denNgayIso: string): Promise<YeuCauMisa> {
  await tuGiaHanNeuSapHetHan();

  const row = await layCredentialMisa();
  if (!row) throw new LoiEshop('Chưa cấu hình Bearer token MISA — vào tab Cài đặt đăng nhập tài khoản MISA.');

  const brid = row.brid || row.msBid;
  if (!brid) throw new LoiEshop('Chưa cấu hình mã chi nhánh (brid / x-ms-bid) ở tab Cài đặt.');

  const boLoc = JSON.stringify(dungBoLoc(brid, tuNgayIso, denNgayIso));

  return {
    url: `${misaBaseUrl(row.env)}/order/GeneralOrders/list-with-detail`,
    headers: dungHeaderMisa(row, REFERER_DON_HANG),
    body: {
      skip: 0,
      take: SO_DON_MOI_TRANG,
      sort: JSON.stringify([{ property: '39', desc: true }]),
      filter: boLoc,
      emptyFilter: '',
      columns: COLUMNS_DON_HANG,
      view: 42,
      use_ai_search: false,
      existing_filters: boLoc,
    },
    take: SO_DON_MOI_TRANG,
    maxPages: SO_TRANG_TOI_DA,
  };
}

/** Gọi 1 trang danh sách đơn kèm chi tiết dòng hàng (chế độ server gọi thẳng MISA). */
async function goiMotTrang(yeuCau: YeuCauMisa, skip: number): Promise<MisaOrder[]> {
  let res: Response;
  try {
    res = await fetch(yeuCau.url, {
      method: 'POST',
      headers: yeuCau.headers,
      body: JSON.stringify({ ...yeuCau.body, skip }),
    });
  } catch (error) {
    throw new LoiEshop(
      `Không kết nối được tới MISA: ${error instanceof Error ? error.message : 'lỗi mạng'}`,
    );
  }

  if (!res.ok) throw new LoiEshop(`MISA trả lỗi HTTP ${res.status}.`);

  let json: { Data?: MisaOrder[] | null; Empty?: boolean; IsAuthExpired?: boolean } | null = null;
  try {
    json = await res.json();
  } catch {
    throw new LoiEshop('MISA trả về dữ liệu không phải JSON — nhiều khả năng phiên đăng nhập đã hỏng.');
  }

  if (json?.IsAuthExpired) {
    throw new LoiEshop('Token MISA đã hết hạn — bấm "Gia hạn token ngay" ở tab Cài đặt, hỏng nữa thì đăng nhập lại.');
  }

  return Array.isArray(json?.Data) ? json.Data : [];
}

export type KetQuaDongBo = {
  soDon: number;
  tuNgay: string;
  denNgay: string;
  /** Đường đi thực tế của request: qua máy chính hay server gọi thẳng. */
  qua: 'agent' | 'server';
  /** Khác null khi phải dùng đường dự phòng — hiện lên tab eShop để nhắc cập nhật token. */
  canhBao: string | null;
};

/**
 * Ghi danh sách đơn thô lấy từ MISA vào DB. Ghi đè theo `order_id` nên chạy lại nhiều lần vẫn ra
 * cùng kết quả; dòng hàng bị xóa sạch rồi ghi lại vì đơn có thể được sửa bên MISA.
 *
 * Không đụng tới `daTruTonKhoLuc` — việc trừ tồn kho do `truTonKhoDonEshop()` lo.
 * Dùng chung cho cả 2 chế độ: server gọi thẳng, hoặc agent trên máy chính gửi dữ liệu về.
 */
export async function luuDonEshop(danhSach: MisaOrder[]): Promise<number> {
  let soDon = 0;
  for (const don of danhSach) {
    if (!don?.order_id) continue;

    const duLieu = {
      refNo: don.ref_no || don.order_no || null,
      ecomOrderNo: don.ecom_order_no || null,
      channelId: typeof don.channel_id === 'number' ? don.channel_id : null,
      channelName: don.channel_name || null,
      partnerObjectName: don.partner_object_name || null,
      customerName: don.partner_object_name || null,
      orderStatus: typeof don.order_status === 'number' ? don.order_status : null,
      partnerOrderStatus: don.partner_order_status || null,
      paymentStatus: typeof don.payment_status === 'number' ? don.payment_status : null,
      paymentMethod: don.payment_method || null,
      shippingPartner: don.shipping_partner_name || null,
      deliveryCode: don.delivery_code || null,
      totalRevenue: soHoac0(don.total_revenue),
      totalAmount: soHoac0(don.total_amount),
      refDate: ngayHoacNull(don.ref_date),
      createTime: ngayHoacNull(don.create_time),
      prepareDueTime: ngayHoacNull(don.prepare_due_time),
      shippingDate: ngayHoacNull(don.shipping_date),
      completeDate: ngayHoacNull(don.complete_date),
      syncedAt: new Date(),
    };

    const dongHang = (don.Details ?? []).map((ct) => ({
      inventoryItemId: ct.inventory_item_id || null,
      skuCode: ct.sku_code?.trim() || null,
      itemName: ct.inventory_item_name || '(không tên)',
      quantity: soHoac0(ct.quantity),
      unitName: ct.unit_name || null,
      urlImage: ct.url_image || null,
    }));

    await prisma.$transaction(async (tx) => {
      await tx.eshopOrder.upsert({
        where: { id: don.order_id },
        create: { id: don.order_id, ...duLieu },
        update: duLieu,
      });
      await tx.eshopOrderItem.deleteMany({ where: { orderId: don.order_id } });
      if (dongHang.length > 0) {
        await tx.eshopOrderItem.createMany({
          data: dongHang.map((d) => ({ ...d, orderId: don.order_id })),
        });
      }
    });
    soDon += 1;
  }

  return soDon;
}

// ────────────────────────────────────────────────────────────────────────────
// Gọi MISA qua "máy chính"
//
// MISA eShop chỉ chấp nhận 1 phiên đăng nhập. Server gọi thẳng bằng token của máy chính sẽ đẩy máy
// chính ra khỏi phiên eShop. Nên nếu đã khai `agentUrl`, luồng là:
//     server  →  script agent trên máy chính  →  MISA
// Máy chính tắt / không phản hồi thì server gọi thẳng MISA để đơn vẫn về — đổi lại máy chính bị đăng
// xuất và phải gia hạn lại token ở tab Cài đặt.
// ────────────────────────────────────────────────────────────────────────────

/** Chờ máy chính tối đa 90 giây — nó phải lật nhiều trang MISA nên không thể nhanh như 1 request. */
const TIMEOUT_AGENT_MS = 90_000;

/** Nhờ máy chính gọi MISA hộ. Ném lỗi nếu không gọi được — bên ngoài bắt lại để chuyển sang dự phòng. */
async function goiQuaMayChinh(agentUrl: string, yeuCau: YeuCauMisa): Promise<MisaOrder[]> {
  const res = await fetch(`${agentUrl.replace(/\/+$/, '')}/lay-don`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.ESHOP_AGENT_TOKEN ? { 'x-agent-token': process.env.ESHOP_AGENT_TOKEN } : {}),
    },
    body: JSON.stringify(yeuCau),
    signal: AbortSignal.timeout(TIMEOUT_AGENT_MS),
  });

  const json = (await res.json()) as { ok?: boolean; orders?: MisaOrder[]; error?: string };
  if (!res.ok || json.ok === false) {
    throw new Error(json.error || `máy chính trả HTTP ${res.status}`);
  }
  return Array.isArray(json.orders) ? json.orders : [];
}

/** Server tự gọi MISA, lật trang cho tới hết. */
async function goiTrucTiep(yeuCau: YeuCauMisa): Promise<MisaOrder[]> {
  const tatCa: MisaOrder[] = [];
  for (let trang = 0; trang < yeuCau.maxPages; trang += 1) {
    const batch = await goiMotTrang(yeuCau, trang * yeuCau.take);
    tatCa.push(...batch);
    if (batch.length < yeuCau.take) break;
  }
  return tatCa;
}

/**
 * Kéo đơn về DB. Ưu tiên đi qua máy chính; máy chính hỏng thì tự chuyển sang server gọi thẳng và ghi
 * lại cảnh báo để tab eShop nhắc người dùng cập nhật token.
 */
export async function dongBoDonEshop(tuNgay: Date, denNgay: Date): Promise<KetQuaDongBo> {
  const tuNgayIso = tuNgay.toISOString();
  const denNgayIso = denNgay.toISOString();
  const yeuCau = await dungYeuCauMisa(tuNgayIso, denNgayIso);

  const state = await prisma.eshopSyncState.findUnique({ where: { id: SYNC_STATE_ID } });
  const agentUrl = state?.agentUrl?.trim();

  let orders: MisaOrder[];
  let qua: 'agent' | 'server' = 'server';
  let canhBao: string | null = null;

  if (agentUrl) {
    try {
      orders = await goiQuaMayChinh(agentUrl, yeuCau);
      qua = 'agent';
    } catch (error) {
      const lyDo = error instanceof Error ? error.message : 'không rõ nguyên nhân';
      canhBao =
        `Máy chính không phản hồi (${lyDo}) — đã gọi thẳng từ server. ` +
        `Phiên eShop trên máy chính có thể bị đăng xuất, vào tab Cài đặt bấm "Gia hạn token ngay".`;
      orders = await goiTrucTiep(yeuCau);
    }
  } else {
    orders = await goiTrucTiep(yeuCau);
  }

  const soDon = await luuDonEshop(orders);

  await prisma.eshopSyncState.upsert({
    where: { id: SYNC_STATE_ID },
    create: { id: SYNC_STATE_ID, lastRunVia: qua, ...(qua === 'agent' ? { agentLastOkAt: new Date() } : {}) },
    update: { lastRunVia: qua, ...(qua === 'agent' ? { agentLastOkAt: new Date() } : {}) },
  });

  return { soDon, tuNgay: tuNgayIso, denNgay: denNgayIso, qua, canhBao };
}

/** Kiểm tra máy chính có sống không (nút "Kiểm tra máy chính" ở tab eShop). */
export async function kiemTraMayChinh(): Promise<{ ok: boolean; message: string }> {
  const state = await prisma.eshopSyncState.findUnique({ where: { id: SYNC_STATE_ID } });
  const agentUrl = state?.agentUrl?.trim();
  if (!agentUrl) return { ok: false, message: 'Chưa khai địa chỉ máy chính — server đang gọi thẳng MISA.' };

  try {
    const res = await fetch(`${agentUrl.replace(/\/+$/, '')}/ping`, {
      headers: process.env.ESHOP_AGENT_TOKEN ? { 'x-agent-token': process.env.ESHOP_AGENT_TOKEN } : {},
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { ok: false, message: `Máy chính trả HTTP ${res.status}.` };
    return { ok: true, message: 'Máy chính đang chạy, sẵn sàng gọi MISA hộ.' };
  } catch (error) {
    return {
      ok: false,
      message: `Không gọi được máy chính: ${error instanceof Error ? error.message : 'lỗi mạng'}`,
    };
  }
}

/** Lưu địa chỉ agent trên máy chính. Để trống = server gọi thẳng MISA. */
export async function datDiaChiMayChinh(url: string | null) {
  const sach = url?.trim() || null;
  return prisma.eshopSyncState.upsert({
    where: { id: SYNC_STATE_ID },
    create: { id: SYNC_STATE_ID, agentUrl: sach },
    update: { agentUrl: sach },
  });
}

/** Ghi lại kết quả lần đồng bộ gần nhất để tab eShop hiển thị và để biết bộ hẹn giờ có chạy không. */
export async function ghiTrangThaiDongBo(ok: boolean, message: string, soDon: number) {
  const data = { lastSyncAt: new Date(), lastSyncOk: ok, lastMessage: message, lastCount: soDon };
  await prisma.eshopSyncState.upsert({
    where: { id: SYNC_STATE_ID },
    create: { id: SYNC_STATE_ID, ...data },
    update: data,
  });
}

export async function layTrangThaiDongBo() {
  return prisma.eshopSyncState.findUnique({ where: { id: SYNC_STATE_ID } });
}

export type DongNhuCauIn = {
  /** maQR của sản phẩm MẸ (nơi tồn kho thực sự được quản lý). */
  maQR: string;
  ten: string;
  /** Tổng số CON phải in, đã quy đổi combo (SKU "...-5" x 2 đơn = 10 con). */
  soCanIn: number;
  tonKho: number;
  /** Số con còn thiếu sau khi lấy hết tồn kho — chính là số cần đưa vào sản xuất. */
  thieu: number;
  /** SKU rời rạc gộp vào dòng này, VD ["SP-A-1 x3", "SP-A-5 x1"]. */
  chiTietSku: string[];
};

export type NhuCauIn = {
  dong: DongNhuCauIn[];
  /** SKU trong đơn nhưng không tìm thấy hàng hóa tương ứng — cần khai báo ở tab Hàng hóa cửa hàng. */
  skuLa: Array<{ skuCode: string; itemName: string; soLuong: number }>;
};

/**
 * Gom nhu cầu in từ các đơn đã chọn: quy SKU combo con ("...-1"/"-2"/"-5") về sản phẩm mẹ rồi nhân
 * số cái mỗi combo, vì tồn kho chỉ được quản lý ở sản phẩm mẹ (xem StoreProduct.soLuongCombo).
 */
export async function gomNhuCauIn(orderIds: string[]): Promise<NhuCauIn> {
  const items = await prisma.eshopOrderItem.findMany({
    where: { orderId: { in: orderIds } },
  });

  const skus = [...new Set(items.map((i) => i.skuCode).filter((s): s is string => !!s))];
  const sanPhams = await prisma.storeProduct.findMany({
    where: { maQR: { in: skus } },
    include: { parent: true },
  });
  const theoMa = new Map(sanPhams.map((sp) => [sp.maQR, sp]));

  const gop = new Map<string, DongNhuCauIn>();
  const skuLa: NhuCauIn['skuLa'] = [];

  for (const item of items) {
    const sp = item.skuCode ? theoMa.get(item.skuCode) : undefined;
    if (!sp) {
      skuLa.push({
        skuCode: item.skuCode || '(trống)',
        itemName: item.itemName,
        soLuong: item.quantity,
      });
      continue;
    }

    // Combo con: tồn kho nằm ở mẹ, mỗi combo ăn `soLuongCombo` con.
    const me = sp.parent ?? sp;
    const soConMoiSku = sp.soLuongCombo && sp.soLuongCombo > 0 ? sp.soLuongCombo : 1;
    const soCon = item.quantity * soConMoiSku;

    const cu = gop.get(me.maQR);
    if (cu) {
      cu.soCanIn += soCon;
      cu.chiTietSku.push(`${sp.maQR} x${item.quantity}`);
    } else {
      gop.set(me.maQR, {
        maQR: me.maQR,
        ten: me.ten,
        soCanIn: soCon,
        tonKho: me.soLuong,
        thieu: 0,
        chiTietSku: [`${sp.maQR} x${item.quantity}`],
      });
    }
  }

  const dong = [...gop.values()].map((d) => ({ ...d, thieu: Math.max(0, d.soCanIn - d.tonKho) }));
  dong.sort((a, b) => b.thieu - a.thieu || b.soCanIn - a.soCanIn);

  return { dong, skuLa };
}

export type KetQuaTruTonKho = {
  soDon: number;
  soSanPham: number;
  boQua: string[];
};

/**
 * Trạng thái sàn KHÔNG được trừ tồn kho: đơn chưa chốt (chờ thanh toán) hoặc đã hủy/hoàn/trả.
 * Mọi trạng thái còn lại (chờ đóng gói, CHỜ LẤY HÀNG, đang giao, đã giao, hoàn tất) đều trừ, vì hàng
 * coi như đã xuất khỏi kho từ lúc đóng gói giao cho đơn vị vận chuyển.
 */
const TRANG_THAI_KHONG_TRU_KHO = new Set([
  'UNPAID',
  'CANCEL',
  'CANCELLED',
  'CANCELLING',
  'RETURNED',
  'RETURN',
  'REFUNDED',
  'REFUND',
]);

/** Đơn này có được trừ tồn kho không? */
function duocTruTonKho(don: { partnerOrderStatus: string | null; completeDate: Date | null }): boolean {
  // Đơn của sàn: quyết định theo trạng thái sàn (chuỗi rõ nghĩa, tin được).
  if (don.partnerOrderStatus) {
    return !TRANG_THAI_KHONG_TRU_KHO.has(don.partnerOrderStatus.trim().toUpperCase());
  }
  // Đơn không qua sàn (bán lẻ nhập tay trên MISA): không có trạng thái sàn để đối chiếu, và ý nghĩa
  // các mã trạng thái số 30/35/40/45/50 bên MISA chưa xác nhận được — chỉ trừ khi đã hoàn tất.
  return don.completeDate !== null;
}

/**
 * Trừ tồn kho cho các đơn đủ điều kiện (xem `duocTruTonKho`) mà chưa từng trừ. Mốc `daTruTonKhoLuc`
 * đóng vai trò chốt chặn: đồng bộ lại bao nhiêu lần cũng không trừ trùng.
 *
 * Lưu ý: đơn bị hủy/hoàn SAU khi đã trừ thì hệ thống chưa tự cộng trả lại — phải chỉnh tay ở tab
 * Hàng hóa cửa hàng.
 */
export async function truTonKhoDonEshop(): Promise<KetQuaTruTonKho> {
  const ungVien = await prisma.eshopOrder.findMany({
    where: { daTruTonKhoLuc: null },
    include: { items: true },
  });
  const donCanTru = ungVien.filter(duocTruTonKho);

  const boQua: string[] = [];
  let soSanPham = 0;
  let soDon = 0;

  for (const don of donCanTru) {
    const skus = [...new Set(don.items.map((i) => i.skuCode).filter((s): s is string => !!s))];
    const sanPhams = await prisma.storeProduct.findMany({
      where: { maQR: { in: skus } },
      include: { parent: true },
    });
    const theoMa = new Map(sanPhams.map((sp) => [sp.maQR, sp]));

    // Gom theo sản phẩm mẹ trước để 1 đơn có nhiều dòng cùng gốc chỉ ghi 1 lần lịch sử.
    const truTheoMe = new Map<string, { soLuong: number; moTa: string[] }>();
    for (const item of don.items) {
      const sp = item.skuCode ? theoMa.get(item.skuCode) : undefined;
      if (!sp) {
        boQua.push(`${don.refNo || don.id}: không tìm thấy hàng hóa cho SKU "${item.skuCode || '(trống)'}"`);
        continue;
      }
      const me = sp.parent ?? sp;
      const soCon = item.quantity * (sp.soLuongCombo && sp.soLuongCombo > 0 ? sp.soLuongCombo : 1);
      const cu = truTheoMe.get(me.id);
      if (cu) {
        cu.soLuong += soCon;
        cu.moTa.push(`${sp.maQR} x${item.quantity}`);
      } else {
        truTheoMe.set(me.id, { soLuong: soCon, moTa: [`${sp.maQR} x${item.quantity}`] });
      }
    }

    await prisma.$transaction(async (tx) => {
      for (const [productId, { soLuong, moTa }] of truTheoMe) {
        const sp = await tx.storeProduct.findUnique({ where: { id: productId } });
        if (!sp) continue;

        const conLai = Math.round(sp.soLuong - soLuong);
        const lichSuCu = Array.isArray(sp.lichSu) ? (sp.lichSu as unknown[]) : [];
        const ghiChu =
          `Trừ ${soLuong} do đơn eShop ${don.refNo || don.ecomOrderNo || don.id} ` +
          `(${don.partnerOrderStatus || 'đã hoàn tất'}, ${moTa.join(', ')}). Tồn: ${sp.soLuong} → ${conLai}.`;

        await tx.storeProduct.update({
          where: { id: productId },
          data: {
            soLuong: conLai,
            ngayCapNhat: new Date().toISOString(),
            lichSu: [
              ...lichSuCu,
              { id: crypto.randomUUID(), thoiGian: new Date().toISOString(), noiDung: ghiChu },
            ] as never,
          },
        });
        soSanPham += 1;
      }

      await tx.eshopOrder.update({
        where: { id: don.id },
        data: { daTruTonKhoLuc: new Date() },
      });
    });

    soDon += 1;
  }

  return { soDon, soSanPham, boQua };
}
