import prisma from '@/utils/db';
import { printerManager } from './printer-integration/PrinterManager';
import type { PrinterStatusData } from './printer-integration/types';
import { ghiVaGuiSuKien, type LoaiSuKien } from './thong-bao.service';

/**
 * Vòng giám sát máy in: cứ vài chục giây hỏi trạng thái mọi máy đã liên kết, so với lần trước, và
 * mỗi thay đổi đáng kể thì ghi sự kiện + đẩy thông báo.
 *
 * Vì sao phải có vòng này: trước đây trạng thái chỉ được đọc khi ai đó mở màn hình máy in
 * (`/api/printers/cloud/status`). Máy hỏng lúc 2 giờ sáng thì không ai biết cho tới sáng hôm sau.
 *
 * Trạng thái so sánh giữ trong RAM (gắn vào globalThis để sống qua hot-reload của Next). Mất khi
 * restart là chấp nhận được: lần quét đầu sau restart chỉ ghi nhận nền, không bắn thông báo, nên
 * restart không gây mưa thông báo giả.
 */

/** Chu kỳ quét. Ngắn hơn nữa cũng không lợi: bản thân provider chỉ poll cloud/HA mỗi vài giây. */
const CHU_KY_MS = Number(process.env.PRINTER_MONITOR_INTERVAL_MS || 20_000);

/** Số lần quét liên tiếp thấy mất tín hiệu mới dám kêu "mất kết nối" — chống mạng chớp. */
const LAN_OFFLINE_TOI_THIEU = 2;

/** Đang in mà tiến độ đứng yên quá lâu = kẹt nhựa / tuột đầu phun / treo máy. */
const NGUONG_DUNG_YEN_MS = Number(process.env.PRINTER_STALL_MINUTES || 30) * 60_000;

/** Ngưỡng nhiệt tuyệt đối coi là bất thường. */
const NHIET_VOI_TOI_DA = Number(process.env.PRINTER_MAX_NOZZLE_C || 300);
const NHIET_BAN_TOI_DA = Number(process.env.PRINTER_MAX_BED_C || 120);

/** Vượt mức đặt bao nhiêu độ (kéo dài 2 lần quét) thì coi là mất kiểm soát nhiệt. */
const VUOT_NHIET_TOI_DA = 30;

/** Tiến độ tối thiểu để coi là in xong chứ không phải bị hủy giữa chừng. */
const TIEN_DO_COI_LA_XONG = 95;

/** Không lặp lại cùng một loại cảnh báo cho cùng một máy trong khoảng này. */
const CACH_QUANG_MS = 30 * 60_000;

type TrangThaiGon = 'in' | 'ranh' | 'tamDung' | 'loi' | 'offline' | 'baoTri';

type BoNho = {
  trangThai: TrangThaiGon;
  tienDo: number;
  tenFile: string | null;
  /** Mốc lần cuối tiến độ (hoặc file) thực sự nhúc nhích — gốc để tính "đứng yên". */
  tienDoDoiLuc: number;
  soLanMatTinHieu: number;
  /**
   * Đã kêu "mất kết nối" cho lần mất này chưa.
   *
   * Cần tách khỏi `trangThai` vì lúc máy chủ vừa bật, provider chưa poll xong nên máy nào cũng
   * trông như offline. Không có cờ này thì cứ mỗi lần restart là một tràng "đã kết nối lại" giả.
   */
  daBaoMat: boolean;
  /** Lần cuối bắn từng loại cảnh báo, chống lặp. */
  lanCuoi: Partial<Record<LoaiSuKien, number>>;
  soLanNhietCao: number;
};

declare global {
  var giamSatMayInDaChay: boolean | undefined;
  var giamSatMayInBoNho: Map<string, BoNho> | undefined;
  var giamSatMayInHen: NodeJS.Timeout | undefined;
}

const boNho: Map<string, BoNho> = (globalThis.giamSatMayInBoNho ??= new Map());

/**
 * Trạng thái thô của máy (`gcode_state`) — nơi duy nhất phân biệt được "tạm dừng" với "lỗi",
 * vì cả hai đều bị gộp vào `status: 'error'`.
 */
function trangThaiTho(st: PrinterStatusData): string {
  const tho = st.extendedInfo?.payload?.print_status;
  return typeof tho === 'string' ? tho.toLowerCase() : '';
}

/**
 * Câu mô tả đưa vào thông báo.
 *
 * Provider đã lọc sẵn: chỉ lý do dừng và mã lỗi bản in mới vào đây, còn lỗi HMS thì không —
 * chúng dai dẳng và phần lớn không cản việc in, réo lên chỉ tổ làm người ta tắt thông báo.
 */
function loiMoTa(st: PrinterStatusData): string {
  return st.errorMessage || 'Máy báo lỗi, không rõ nguyên nhân.';
}

/** Lý do máy dừng, do provider giải mã sẵn từ chặng đang chạy. */
function lyDoDung(st: PrinterStatusData): { lyDo: string | null; laSuCo: boolean } {
  const payload = st.extendedInfo?.payload;
  return {
    lyDo: typeof payload?.ly_do_dung === 'string' ? payload.ly_do_dung : null,
    laSuCo: payload?.dung_do_su_co === true,
  };
}

function gomTrangThai(st: PrinterStatusData): TrangThaiGon {
  switch (st.status) {
    case 'printing':
      return 'in';
    case 'idle':
      return 'ranh';
    case 'maintenance':
      return 'baoTri';
    case 'offline':
      return 'offline';
    case 'error': {
      // Cả hai provider đều gộp "tạm dừng" vào 'error' — tách lại bằng trạng thái thô.
      const tho = trangThaiTho(st);
      if (tho !== 'pause' && tho !== 'paused') return 'loi';
      // Máy dừng vì tắc đầu phun và thợ bấm dừng để thay nhựa là hai chuyện khác hẳn nhau, nhưng
      // cả hai đều ra 'pause'. Có lý do cụ thể thì xếp sự cố vào 'loi' để vượt ngưỡng gửi Zalo.
      return lyDoDung(st).laSuCo ? 'loi' : 'tamDung';
    }
    default:
      return 'offline';
  }
}

function moTaFile(tenFile: string | null | undefined): string {
  return tenFile ? `Bản in: ${tenFile}` : 'Không rõ tên bản in.';
}

function phanTramNhietVaTienDo(st: PrinterStatusData): string {
  return `Tiến độ ${Math.round(st.progress || 0)}% · vòi ${Math.round(st.nozzleTemp || 0)}°C · bàn ${Math.round(st.bedTemp || 0)}°C`;
}

/** Đã bắn loại cảnh báo này gần đây chưa. */
function conNguoi(bo: BoNho, loai: LoaiSuKien): boolean {
  const lan = bo.lanCuoi[loai];
  return lan !== undefined && Date.now() - lan < CACH_QUANG_MS;
}

async function ban(
  bo: BoNho,
  printerId: string,
  tenMay: string,
  loai: LoaiSuKien,
  tieuDe: string,
  noiDung: string,
  st: PrinterStatusData,
) {
  bo.lanCuoi[loai] = Date.now();
  await ghiVaGuiSuKien({
    printerId,
    tenMay,
    loai,
    tieuDe,
    noiDung,
    tienDo: Math.round(st.progress || 0),
    tenFile: st.fileName || null,
    nhietVoi: st.nozzleTemp ?? null,
    nhietBan: st.bedTemp ?? null,
  }).catch((e) => console.error('[Giám sát máy in] Không ghi được sự kiện:', e));
}

/** Xử lý một máy in trong một lần quét. Không bao giờ ném lỗi ra ngoài. */
async function quetMotMay(printer: { id: string; name: string; cloudAccountId: string; cloudPrinterId: string }) {
  let st: PrinterStatusData | null = null;
  try {
    st = await printerManager.getStatusAsync(printer.cloudAccountId, printer.cloudPrinterId);
  } catch {
    st = null;
  }

  const hienTai: PrinterStatusData =
    st ?? ({ status: 'offline', nozzleTemp: 0, nozzleTargetTemp: 0, bedTemp: 0, bedTargetTemp: 0, progress: 0 } as PrinterStatusData);

  const gon = gomTrangThai(hienTai);
  const bo = boNho.get(printer.id);

  const tienDo = Math.round(hienTai.progress || 0);
  const tenFile = hienTai.fileName || null;

  // Lần đầu thấy máy này (server vừa bật): chỉ ghi nền, không bắn thông báo.
  if (!bo) {
    boNho.set(printer.id, {
      trangThai: gon,
      tienDo,
      tenFile,
      tienDoDoiLuc: Date.now(),
      soLanMatTinHieu: gon === 'offline' ? 1 : 0,
      daBaoMat: false,
      lanCuoi: {},
      soLanNhietCao: 0,
    });
    return;
  }

  // ── Mất tín hiệu ──────────────────────────────────────────────────────────
  // Tách hẳn khỏi máy trạng thái bên dưới: mất mạng thì mọi số liệu (tiến độ, nhiệt) đều là số
  // rỗng do ta tự bịa ra, đem so sánh tiếp chỉ sinh ra sự kiện rác.
  if (gon === 'offline') {
    bo.soLanMatTinHieu += 1;
    // Mạng chớp một nhịp thì đừng vội kêu. Nhịp đầu sau khi server bật cũng rơi vào đây, vì
    // provider chưa poll xong lần nào.
    if (bo.soLanMatTinHieu >= LAN_OFFLINE_TOI_THIEU && !bo.daBaoMat) {
      bo.daBaoMat = true;
      await ban(bo, printer.id, printer.name, 'mangMat', `${printer.name} mất kết nối`,
        `Không hỏi được trạng thái máy nữa (mất mạng, tắt nguồn, hoặc Home Assistant/Moonraker ngừng chạy). ${
          bo.trangThai === 'offline'
            ? 'Máy đã không trả lời ngay từ lúc máy chủ khởi động.'
            : `Trạng thái cuối: ${nhanTrangThai(bo.trangThai)}, tiến độ ${bo.tienDo}%.`
        }`,
        hienTai);
    }
    return;
  }

  bo.soLanMatTinHieu = 0;

  // Chỉ báo "kết nối lại" nếu trước đó đã thực sự kêu mất — chứ không phải mỗi lần server khởi
  // động lại rồi thấy máy chạy bình thường.
  if (bo.daBaoMat) {
    bo.daBaoMat = false;
    await ban(bo, printer.id, printer.name, 'mangLai', `${printer.name} đã kết nối lại`,
      `Máy trở lại trạng thái ${nhanTrangThai(gon)}. ${phanTramNhietVaTienDo(hienTai)}`, hienTai);
    // Cập nhật nền rồi thôi: vừa mất mạng xong thì "in xong / bắt đầu in" suy ra từ so sánh với
    // trước lúc mất là không đáng tin.
    bo.trangThai = gon;
    bo.tienDo = tienDo;
    bo.tenFile = tenFile;
    bo.tienDoDoiLuc = Date.now();
    return;
  }

  // Nền được ghi lúc chưa hỏi được máy (server vừa bật, provider chưa poll xong) thì không đáng
  // tin — lấy lần đọc đầu tiên có thật làm nền, im lặng. Không có nhánh này thì cứ mỗi lần restart
  // là mọi máy đang in đều bị báo "bắt đầu in".
  if (bo.trangThai === 'offline') {
    bo.trangThai = gon;
    bo.tienDo = tienDo;
    bo.tenFile = tenFile;
    bo.tienDoDoiLuc = Date.now();
    return;
  }

  const truoc = bo.trangThai;

  // ── Đổi trạng thái ────────────────────────────────────────────────────────
  if (gon !== truoc) {
    if (gon === 'loi') {
      const { lyDo } = lyDoDung(hienTai);
      // Có lý do cụ thể thì đưa thẳng lên tiêu đề — người đọc thông báo trên điện thoại thường
      // chỉ kịp liếc dòng đầu.
      await ban(bo, printer.id, printer.name, 'loi',
        lyDo ? `${printer.name} dừng vì ${lyDo}` : `${printer.name} báo lỗi`,
        `${loiMoTa(hienTai)}\n${moTaFile(tenFile)} · ${phanTramNhietVaTienDo(hienTai)}`, hienTai);
    } else if (gon === 'tamDung') {
      const { lyDo } = lyDoDung(hienTai);
      await ban(bo, printer.id, printer.name, 'tamDung', `${printer.name} đang tạm dừng`,
        lyDo
          ? `${moTaFile(tenFile)} · dừng ở ${tienDo}% (${lyDo}).`
          : `${moTaFile(tenFile)} · dừng ở ${tienDo}%. Nếu không phải do người bấm dừng thì kiểm tra ngay.`,
        hienTai);
    } else if (gon === 'in') {
      if (truoc === 'tamDung') {
        await ban(bo, printer.id, printer.name, 'inTiep', `${printer.name} in tiếp`,
          `${moTaFile(tenFile)} · tiếp tục từ ${tienDo}%.`, hienTai);
      } else {
        await ban(bo, printer.id, printer.name, 'batDau', `${printer.name} bắt đầu in`,
          `${moTaFile(tenFile)}${hienTai.remainingTimeSeconds ? ` · dự kiến ${dinhDangThoiGian(hienTai.remainingTimeSeconds)}` : ''}`, hienTai);
      }
    } else if (gon === 'ranh' && (truoc === 'in' || truoc === 'tamDung')) {
      if (bo.tienDo >= TIEN_DO_COI_LA_XONG) {
        await ban(bo, printer.id, printer.name, 'inXong', `${printer.name} in xong`,
          `${moTaFile(bo.tenFile)} · hoàn tất. Ra lấy hàng và dọn mâm được rồi.`, hienTai);
      } else {
        await ban(bo, printer.id, printer.name, 'huy', `${printer.name} dừng in giữa chừng`,
          `${moTaFile(bo.tenFile)} · dừng ở ${bo.tienDo}%. Bản in bị hủy hoặc thất bại.`, hienTai);
      }
    }

    bo.trangThai = gon;
    bo.tienDoDoiLuc = Date.now();
    // Xong/hủy/lỗi rồi thì cho phép cảnh báo đứng yên của bản in sau bắn lại ngay.
    if (gon !== 'in') delete bo.lanCuoi.dungYen;
  }

  // ── Đang in mà tiến độ đứng yên ───────────────────────────────────────────
  if (tienDo !== bo.tienDo || tenFile !== bo.tenFile) {
    bo.tienDoDoiLuc = Date.now();
    delete bo.lanCuoi.dungYen;
  } else if (gon === 'in' && Date.now() - bo.tienDoDoiLuc > NGUONG_DUNG_YEN_MS && !conNguoi(bo, 'dungYen')) {
    const phut = Math.round((Date.now() - bo.tienDoDoiLuc) / 60_000);
    await ban(bo, printer.id, printer.name, 'dungYen', `${printer.name} có thể đang kẹt`,
      `Tiến độ đứng yên ở ${tienDo}% suốt ${phut} phút. ${moTaFile(tenFile)}. Kiểm tra kẹt nhựa, tuột đầu phun hoặc máy treo.`,
      hienTai);
  }

  // ── Nhiệt bất thường ──────────────────────────────────────────────────────
  const voiQuaCao = (hienTai.nozzleTemp || 0) > NHIET_VOI_TOI_DA;
  const banQuaCao = (hienTai.bedTemp || 0) > NHIET_BAN_TOI_DA;
  const voiVuotDat =
    (hienTai.nozzleTargetTemp || 0) > 0 &&
    (hienTai.nozzleTemp || 0) - (hienTai.nozzleTargetTemp || 0) > VUOT_NHIET_TOI_DA;

  if (voiQuaCao || banQuaCao || voiVuotDat) {
    bo.soLanNhietCao += 1;
    // Đòi 2 lần quét liên tiếp: cảm biến nhảy một nhịp là chuyện thường, cháy máy thì không.
    if (bo.soLanNhietCao >= 2 && !conNguoi(bo, 'nhietBatThuong')) {
      await ban(bo, printer.id, printer.name, 'nhietBatThuong', `${printer.name} nhiệt bất thường`,
        `Vòi ${Math.round(hienTai.nozzleTemp || 0)}°C (đặt ${Math.round(hienTai.nozzleTargetTemp || 0)}°C), bàn ${Math.round(hienTai.bedTemp || 0)}°C (đặt ${Math.round(hienTai.bedTargetTemp || 0)}°C). Tới xem máy ngay.`,
        hienTai);
    }
  } else {
    bo.soLanNhietCao = 0;
  }

  bo.tienDo = tienDo;
  bo.tenFile = tenFile;
}

function nhanTrangThai(t: TrangThaiGon): string {
  return {
    in: 'đang in',
    ranh: 'rảnh',
    tamDung: 'tạm dừng',
    loi: 'lỗi',
    offline: 'mất kết nối',
    baoTri: 'bảo trì',
  }[t];
}

function dinhDangThoiGian(giay: number): string {
  const phut = Math.round(giay / 60);
  if (phut < 60) return `${phut} phút nữa`;
  return `${Math.floor(phut / 60)} giờ ${phut % 60} phút nữa`;
}

/** Một lượt quét toàn bộ máy in. Xuất ra để route "quét ngay" gọi được. */
export async function quetMotLuot() {
  const printers = await prisma.printer.findMany({
    where: { cloudAccountId: { not: null }, cloudPrinterId: { not: null } },
    select: { id: true, name: true, cloudAccountId: true, cloudPrinterId: true },
  });

  // Máy đã gỡ liên kết thì bỏ khỏi bộ nhớ, tránh phình theo thời gian.
  const conLai = new Set(printers.map((p) => p.id));
  for (const id of boNho.keys()) if (!conLai.has(id)) boNho.delete(id);

  await Promise.all(
    printers.map((p) =>
      quetMotMay({
        id: p.id,
        name: p.name,
        cloudAccountId: p.cloudAccountId as string,
        cloudPrinterId: p.cloudPrinterId as string,
      }).catch((e) => console.error(`[Giám sát máy in] Lỗi khi quét ${p.id}:`, e)),
    ),
  );
}

/** Gọi một lần lúc server khởi động (`instrumentation.ts`). Gọi lại nhiều lần cũng không sao. */
export function khoiDongGiamSatMayIn() {
  if (globalThis.giamSatMayInDaChay) return;
  globalThis.giamSatMayInDaChay = true;

  const chay = () => {
    quetMotLuot().catch((e) => console.error('[Giám sát máy in] Lỗi vòng quét:', e));
  };

  // Chờ một nhịp rồi mới quét lần đầu: lúc server vừa bật, provider chưa kết nối xong nên quét ngay
  // sẽ thấy tất cả "offline".
  setTimeout(chay, 10_000);
  const hen = setInterval(chay, CHU_KY_MS);
  hen.unref?.();
  globalThis.giamSatMayInHen = hen;

  console.log(`[Giám sát máy in] Bật, quét mỗi ${Math.round(CHU_KY_MS / 1000)} giây.`);
}
