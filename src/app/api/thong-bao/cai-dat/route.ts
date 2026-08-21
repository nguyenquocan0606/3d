import { NextResponse } from 'next/server';
import { fcmDaCauHinh, quenCauHinhFcm } from '@/services/fcm.service';
import { LOAI_SU_KIEN, layCaiDat, luuCaiDat } from '@/services/thong-bao.service';

/** GET /api/thong-bao/cai-dat — cấu hình hiện tại + danh mục loại sự kiện để UI dựng danh sách. */
export async function GET() {
  const caiDat = await layCaiDat();

  return NextResponse.json({
    status: 'success',
    data: {
      caiDat,
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
    if (body.nguongZalo === 'tin' || body.nguongZalo === 'canhBao' || body.nguongZalo === 'loi') {
      data.nguongZalo = body.nguongZalo;
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

    const caiDat = await luuCaiDat(data);
    return NextResponse.json({ status: 'success', data: caiDat });
  } catch (error) {
    console.error('[API Thông báo] Lỗi lưu cài đặt:', error);
    return NextResponse.json({ status: 'error', message: 'Không lưu được cài đặt.' }, { status: 500 });
  }
}
