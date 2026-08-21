import { NextResponse } from 'next/server';
import prisma from '@/utils/db';

/**
 * Gợi ý máy in từ Home Assistant để form thêm/sửa tự điền.
 *
 * HA phơi sẵn IP và số serial của từng máy Bambu, nên không bắt người dùng bò ra sau máy chép tay
 * mấy chuỗi hex dài. **Access Code thì HA không có** — nó nằm trong config entry chứ không thành
 * entity — nên ô đó vẫn phải gõ từ màn hình máy in.
 */

type HaEntity = { entity_id: string; state: string };

export async function GET() {
  try {
    const taiKhoan = await prisma.cloudAccount.findFirst({ where: { provider: 'bambu' } });
    if (!taiKhoan?.email || !taiKhoan.token) {
      return NextResponse.json(
        { status: 'error', message: 'Chưa cấu hình Home Assistant nên không gợi ý được.' },
        { status: 400 },
      );
    }

    const res = await fetch(`${taiKhoan.email.replace(/\/$/, '')}/api/states`, {
      headers: { Authorization: `Bearer ${taiKhoan.token}`, 'Content-Type': 'application/json' },
      // Không cache: IP máy in đổi theo DHCP, gợi ý cũ còn hại hơn không gợi ý.
      cache: 'no-store',
    });
    if (!res.ok) {
      return NextResponse.json(
        { status: 'error', message: `Home Assistant trả về ${res.status}.` },
        { status: 502 },
      );
    }

    const states = (await res.json()) as HaEntity[];
    const doc = (prefix: string, hau: string) => {
      const v = states.find((s) => s.entity_id === `sensor.${prefix}_${hau}`)?.state;
      return v && v !== 'unavailable' && v !== 'unknown' ? v : null;
    };

    const daGhep = new Set(
      (await prisma.printer.findMany({ select: { cloudPrinterId: true } }))
        .map((p) => p.cloudPrinterId)
        .filter((x): x is string => Boolean(x)),
    );

    const goiY = states
      .filter((s) => s.entity_id.startsWith('sensor.') && s.entity_id.endsWith('_print_status'))
      .map((s) => {
        const prefix = s.entity_id.replace('sensor.', '').replace('_print_status', '');
        return {
          haId: prefix,
          ten: doc(prefix, 'printer_name') ?? prefix,
          ip: doc(prefix, 'ip_address'),
          serial: doc(prefix, 'serial_number'),
          trangThai: s.state,
          daGhep: daGhep.has(prefix),
        };
      })
      // Thiếu IP hoặc serial thì gợi ý cũng vô dụng, người dùng vẫn phải gõ tay.
      .filter((m) => m.ip && m.serial);

    return NextResponse.json({ status: 'success', data: goiY });
  } catch (error) {
    console.error('[API gợi ý HA] Lỗi:', error);
    const message = error instanceof Error ? error.message : 'Không đọc được Home Assistant';
    return NextResponse.json({ status: 'error', message }, { status: 500 });
  }
}
