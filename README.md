# 3D Manage — Quản lý xưởng in 3D

Web app cá nhân (Next.js 16 + Prisma + PostgreSQL) quản lý toàn bộ vận hành xưởng in 3D:
cuộn nhựa (filament), kho lưu trữ, máy in, đơn hàng sản xuất, in tem nhãn và trạm cân điện tử.

## Kiến trúc

```
┌─────────────┐   HTTP    ┌──────────────────────┐   Prisma   ┌────────────┐
│  Browser /  │ ────────► │  Next.js (App Router) │ ─────────► │ PostgreSQL │
│  Tablet     │           │  API routes + UI      │            │  (docker)  │
└─────┬───────┘           └──────┬───────┬───────┘            └────────────┘
      │ ws /mqtt (rewrite)       │       │
      ▼                          │       │ REST (Long-Lived Token)
┌─────────────┐                  │       ▼
│  Mosquitto  │ ◄── ESP32 cân    │  ┌──────────────────┐
│  :9001 ws   │     (MQTT)       │  │  Home Assistant   │──► Máy in Bambu Lab
└─────────────┘                  │  └──────────────────┘
                                 │
                                 ▼ ghi trực tiếp /dev/usb/lp0 (TSPL)
                          ┌──────────────┐
                          │ XPrinter USB │  (in tem 40x30mm)
                          └──────────────┘
```

- **Tích hợp máy in**: `src/services/printer-integration/` — `PrinterManager` giữ các provider
  (`BambuLabProvider` nói chuyện với Home Assistant REST API, `MoonrakerProvider` cho Klipper).
  Provider được khởi tạo **lazy** khi có request đầu tiên (không auto-connect lúc boot).
- **Trạm cân**: ESP32 publish khối lượng qua MQTT → web đọc qua websocket
  (1 kết nối duy nhất qua `ScaleProvider` — `src/components/scale-provider.tsx`,
  cấu hình topic ở `src/config/scale.ts`).
- **In tem**: `src/utils/tspl-printer.ts` sinh lệnh TSPL và ghi thẳng vào cổng USB.
- **Hàng hóa cửa hàng**: tab Store đồng bộ dữ liệu lên DB qua `/api/store-products`
  (tự migrate dữ liệu localStorage bản cũ trong lần mở đầu tiên).

## Chạy dự án

```bash
# 1. PostgreSQL
docker compose up -d

# 2. Cài dependencies (lucide-react cũ chưa khai báo peer react 19)
npm install --legacy-peer-deps

# 3. Áp schema DB
npx prisma migrate deploy

# 4. Chạy dev (lắng nghe mọi interface cho tablet trong LAN truy cập)
npm run dev
```

Kiểm tra tổng quát sau khi sửa code:

```bash
npx tsc --noEmit && npm test && npx next build && npx eslint src
```

## Biến môi trường (`.env`)

| Biến | Mặc định | Ý nghĩa |
|------|----------|---------|
| `DATABASE_URL` | `postgresql://postgres:mysecretpassword@localhost:5432/filament_db` | Kết nối PostgreSQL |
| `PRINTER_DEVICE_PATH` | `/dev/usb/lp0` | Cổng USB máy in tem XPrinter |

## Dịch vụ phụ thuộc trên host

- **Mosquitto** (systemd service) — websocket listener cổng `9001`
  (`next.config.ts` rewrite `/mqtt` tới đây). Máy mới chưa có → bỏ comment service
  `mosquitto` trong `docker-compose.yml` (đã kèm sẵn `mosquitto.conf`).
- **Home Assistant** — cầu nối tới máy in Bambu Lab. Đăng nhập trong app bằng
  URL HA + Long-Lived Access Token (tab Máy in → Kết nối Cloud).

## Bảo mật (mức dùng cá nhân)

- API **không có xác thực** — chỉ chạy trong LAN hoặc sau VPN (Tailscale/WireGuard).
  Nếu expose ra internet qua domain, bật Basic Auth / Cloudflare Access ở reverse proxy.
- Token Home Assistant chỉ nằm trong DB, không trả về client.
- Postgres bind `127.0.0.1`, không mở ra ngoài.

## Cấu trúc thư mục chính

```
src/
├── app/api/          # API routes (REST, format {status:'success'|'error', data, message})
├── app/page.tsx      # UI chính — điều phối tab + súng quét barcode toàn cục
├── components/       # UI theo domain: Filament / Orders / Printer / Store / Dashboard
├── services/         # Business logic (FilamentService, PrinterService, ...)
│   └── printer-integration/  # PrinterManager + providers (bambulab qua HA, moonraker)
├── hooks/            # useScaleMqtt (kết nối MQTT cân)
├── utils/            # db (Prisma singleton), tspl-printer, barcode, api-response
└── types/            # Kiểu dùng chung (filament.types, result)
prisma/               # schema + migrations (baseline 0_init + các migration sau)
```

## Ghi chú vận hành

- Backup DB: `docker exec 3d_manage_postgres pg_dump -U postgres filament_db > backup.sql`
- Lệnh in tem hỗ trợ 3 layout: tem QR cuộn nhựa/kho/máy in, tem barcode đơn hàng,
  tem slot máy in (2 trang). Nội dung tự bỏ dấu tiếng Việt + escape ký tự phá lệnh TSPL.
- QR lệnh đặc biệt: `CMD-INV-RESET`, `CMD-INV-TOGGLE-ALL` (tab kiểm kho),
  `CMD-WEIGHT-TAB`, `CMD-WEIGHT-DONE` (modal cân), `PRT-xx-L1..4` (gán cuộn vào slot AMS).
