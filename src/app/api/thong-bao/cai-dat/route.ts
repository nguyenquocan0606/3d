import { NextResponse } from 'next/server';
import { fcmDaCauHinh, quenCauHinhFcm } from '@/services/fcm.service';
import { LOAI_SU_KIEN, layCaiDat, luuCaiDat } from '@/services/thong-bao.service';

/** GET /api/thong-bao/cai-dat — cấu hình hiện tại + danh mục loại sự kiện để UI dựng danh sách. */
export async function GET() {
  const { discordWebhook, ...caiDat } = await layCaiDat();

  return NextResponse.json({
    status: 'success',
    data: {
      // Webhook là bí mật: ai có địa chỉ đó là đăng được vào kênh Discord của xưởng. Client chỉ
      // cần biết đã cấu hình hay chưa, giống cách xử lý Access Code của máy in.
      caiDat: { ...caiDat, coDiscordWebhook: Boolean(discordWebhook) },
      firebaseSanSang: await fcmDaCauHinh(),
      danhMucLoai: Object.entries(LOAI_SU_KIEN).map(([key, v]) => ({
        loai: key,
        nhan: v.nhan,
        mucDo: v.mucDo,
        icon: v.icon,
      })),
    },
  });
}

/** PUT /api/thong-bao/cai-dat — lưu cấu hình. Chỉ nhận đúng các field cho phép. */
export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;

    const data: Parameters<typeof luuCaiDat>[0] = {};
    if (typeof body.bat === 'boolean') data.bat = body.bat;
    if (typeof body.guiApp === 'boolean') data.guiApp = body.guiApp;
    if (typeof body.guiZalo === 'boolean') data.guiZalo = body.guiZalo;
    if (typeof body.zaloThreadId === 'string' || body.zaloThreadId === null) {
      data.zaloThreadId = body.zaloThreadId as string | null;
    }
    if (typeof body.zaloTenHoiThoai === 'string' || body.zaloTenHoiThoai === null) {
      data.zaloTenHoiThoai = body.zaloTenHoiThoai as string | null;
    }
    if (Array.isArray(body.loaiTat)) {
      const hopLe = Object.keys(LOAI_SU_KIEN);
      data.loaiTat = (body.loaiTat as unknown[]).filter(
        (l): l is string => typeof l === 'string' && hopLe.includes(l),
      );
    }
    const NGUONG = ['tin', 'canhBao', 'loi'];
    if (typeof body.nguongZalo === 'string' && NGUONG.includes(body.nguongZalo)) {
      data.nguongZalo = body.nguongZalo;
    }

    if (typeof body.guiDiscord === 'boolean') data.guiDiscord = body.guiDiscord;
    if (typeof body.discordWebhook === 'string' || body.discordWebhook === null) {
      const url = typeof body.discordWebhook === 'string' ? body.discordWebhook.trim() : null;
      // Chỉ nhận đúng webhook của Discord: dán nhầm URL khác thì mỗi thông báo là một request đi
      // tới nơi lạ, kèm theo cả tên đơn hàng và ảnh trong xưởng.
      if (url && !/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//.test(url)) {
        return NextResponse.json(
          { status: 'error', message: 'Địa chỉ webhook phải bắt đầu bằng https://discord.com/api/webhooks/' },
          { status: 400 },
        );
      }
      data.discordWebhook = url || null;
    }
    if (typeof body.nguongDiscord === 'string' && NGUONG.includes(body.nguongDiscord)) {
      data.nguongDiscord = body.nguongDiscord;
    }
    if (typeof body.anhTheoLop === 'boolean') data.anhTheoLop = body.anhTheoLop;
    if (typeof body.soAnhMoiLop === 'number') {
      data.soAnhMoiLop = Math.min(3, Math.max(1, Math.round(body.soAnhMoiLop)));
    }
    if (typeof body.phutToiThieuGiuaAnh === 'number') {
      data.phutToiThieuGiuaAnh = Math.min(120, Math.max(0, Math.round(body.phutToiThieuGiuaAnh)));
    }

    if (data.guiDiscord === true) {
      const hienTai = await layCaiDat();
      if (!(data.discordWebhook ?? hienTai.discordWebhook)) {
        return NextResponse.json(
          { status: 'error', message: 'Dán địa chỉ webhook Discord trước khi bật.' },
          { status: 400 },
        );
      }
    }

    if (data.guiZalo === true && !data.zaloThreadId) {
      const hienTai = await layCaiDat();
      if (!hienTai.zaloThreadId) {
        return NextResponse.json(
          { status: 'error', message: 'Chọn hội thoại Zalo nhận thông báo trước khi bật.' },
          { status: 400 },
        );
      }
    }

    // Người dùng có thể vừa copy file service account vào `data/` — cho nạp lại mà không restart.
    quenCauHinhFcm();

    const { discordWebhook: daLuu, ...caiDat } = await luuCaiDat(data);
    return NextResponse.json({
      status: 'success',
      data: { ...caiDat, coDiscordWebhook: Boolean(daLuu) },
    });
  } catch (error) {
    console.error('[API Thông báo] Lỗi lưu cài đặt:', error);
    return NextResponse.json({ status: 'error', message: 'Không lưu được cài đặt.' }, { status: 500 });
  }
}
