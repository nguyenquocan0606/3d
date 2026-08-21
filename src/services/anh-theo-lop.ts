import { layCam } from './printer-integration/providers/bambu/cam-bambu';
import { guiDiscord } from './discord.service';
import { layCaiDat } from './thong-bao.service';

/**
 * Cứ mỗi lớp in xong thì chụp ảnh camera gửi lên Discord.
 *
 * Đây là **theo dõi định kỳ, không phải sự kiện** — nên đi đường riêng chứ không qua
 * `ghiVaGuiSuKien()`: không ghi vào lịch sử sự kiện (mỗi mâm 99 lớp thì bảng sự kiện thành bãi
 * rác), không đụng tới Zalo, và mất ảnh cũng chẳng sao.
 *
 * Chốt chặn quan trọng: bản in của xưởng hiện tại xong một lớp mỗi ~7 phút, nhưng bản in lớp mỏng
 * có thể xong mỗi 20 giây. Không giới hạn khoảng cách là ngập kênh Discord trong một buổi.
 */

type BoNho = {
  lopCuoi: number;
  /** Mốc gửi ảnh gần nhất — cơ sở cho khoảng cách tối thiểu. */
  guiLuc: number;
  /** Đang chụp dở: chụp 3 ảnh mất ~7,5 giây, đừng để vòng quét sau chồng lên. */
  dangChup: boolean;
};

declare global {
  var anhTheoLopBoNho: Map<string, BoNho> | undefined;
}

const boNho: Map<string, BoNho> = (globalThis.anhTheoLopBoNho ??= new Map());

/** Camera chỉ đẩy ~0,4 hình/giây nên hai ảnh liên tiếp phải cách nhau ngần này mới khác nhau. */
const CACH_HAI_ANH_MS = 2600;

export type MayChup = {
  id: string;
  name: string;
  lanIp: string | null;
  lanAccessCode: string | null;
};

/**
 * Gọi mỗi lần quét, cho mỗi máy. **Không await** — chụp và gửi chạy nền để vòng giám sát đi tiếp.
 */
export function ngoLop(may: MayChup, dangIn: boolean, lop: number | null, tenFile: string | null) {
  if (!may.lanIp || !may.lanAccessCode || !dangIn || !lop || lop <= 0) {
    // In xong hoặc mất tín hiệu thì quên mốc cũ, để mâm sau bắt đầu lại từ đầu.
    if (!dangIn) boNho.delete(may.id);
    return;
  }

  const bo = boNho.get(may.id);
  if (!bo) {
    // Lần đầu thấy máy này đang in: chỉ ghi nền. Không có nhánh này thì mỗi lần khởi động lại máy
    // chủ là bắn một loạt ảnh của những lớp đã in từ đời nào.
    boNho.set(may.id, { lopCuoi: lop, guiLuc: 0, dangChup: false });
    return;
  }

  if (lop <= bo.lopCuoi || bo.dangChup) return;
  bo.lopCuoi = lop;

  void chupVaGui(may, bo, lop, tenFile);
}

async function chupVaGui(may: MayChup, bo: BoNho, lop: number, tenFile: string | null) {
  bo.dangChup = true;
  try {
    const caiDat = await layCaiDat();
    if (!caiDat.bat || !caiDat.anhTheoLop || !caiDat.guiDiscord || !caiDat.discordWebhook) return;

    const cach = Math.max(0, caiDat.phutToiThieuGiuaAnh) * 60_000;
    if (bo.guiLuc > 0 && Date.now() - bo.guiLuc < cach) return;

    const cam = layCam(may.lanIp!, may.lanAccessCode!);
    const soAnh = Math.min(3, Math.max(1, caiDat.soAnhMoiLop));
    const anh: Array<{ ten: string; du: Buffer }> = [];

    for (let i = 0; i < soAnh; i++) {
      // Chờ giữa hai lần chụp, nếu không sẽ lấy lại đúng một khung.
      if (i > 0) await new Promise((r) => setTimeout(r, CACH_HAI_ANH_MS));
      const jpg = await cam.anhChup();
      if (jpg) anh.push({ ten: `lop-${lop}-${i + 1}.jpg`, du: jpg });
    }

    if (anh.length === 0) return;

    bo.guiLuc = Date.now();
    await guiDiscord({
      webhook: caiDat.discordWebhook,
      tieuDe: `${may.name} — xong lớp ${lop}`,
      noiDung: tenFile ?? undefined,
      mucDo: 'tin',
      anh,
    });
  } catch (e) {
    console.warn(`[Ảnh theo lớp] ${may.name}:`, e instanceof Error ? e.message : e);
  } finally {
    bo.dangChup = false;
  }
}
