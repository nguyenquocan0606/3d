# TÀI LIỆU HỆ THỐNG — 3D Manage

> Tài liệu đặc tả **toàn bộ** hệ thống web hiện tại (Next.js 16 + Prisma + PostgreSQL),
> dùng làm nguồn sự thật để xây dựng **app iPhone bằng Flutter**.
> Ngày lập: 2026-08-11. Nguồn: quét toàn bộ `src/`, `prisma/`, config, docker.

---

## MỤC LỤC

1. [Tổng quan hệ thống](#1-tổng-quan-hệ-thống)
2. [Kiến trúc & hạ tầng](#2-kiến-trúc--hạ-tầng)
3. [Mô hình dữ liệu (Database)](#3-mô-hình-dữ-liệu-database)
4. [Quy ước mã QR / Barcode / lệnh đặc biệt](#4-quy-ước-mã-qr--barcode--lệnh-đặc-biệt)
5. [Đặc tả API đầy đủ](#5-đặc-tả-api-đầy-đủ)
6. [Business logic theo từng domain](#6-business-logic-theo-từng-domain)
7. [Bản đồ màn hình & tính năng UI hiện tại](#7-bản-đồ-màn-hình--tính-năng-ui-hiện-tại)
8. [Tích hợp phần cứng & bên thứ ba](#8-tích-hợp-phần-cứng--bên-thứ-ba)
9. [Cơ chế realtime & event bus nội bộ](#9-cơ-chế-realtime--event-bus-nội-bộ)
10. [Những gì hệ thống CHƯA có (gaps)](#10-những-gì-hệ-thống-chưa-có-gaps)
11. [Kế hoạch port sang Flutter (iOS)](#11-kế-hoạch-port-sang-flutter-ios)
12. [Phụ lục: bảng tra nhanh](#12-phụ-lục-bảng-tra-nhanh)

---

## 1. TỔNG QUAN HỆ THỐNG

**3D Manage** là hệ thống quản lý vận hành xưởng in 3D + cửa hàng bán hàng, gồm 6 nghiệp vụ lớn:

| # | Nghiệp vụ | Mô tả ngắn |
|---|-----------|------------|
| 1 | **Quản lý nhựa (Filament/Spool)** | Loại nhựa, cuộn nhựa, khối lượng còn lại, cân điện tử, vị trí kho/máy in |
| 2 | **Kho lưu trữ (Location)** | Ô kệ chứa cuộn nhựa, gán/tháo cuộn bằng quét QR |
| 3 | **Máy in (Printer)** | Máy in local + kết nối cloud (Bambu Lab qua Home Assistant, Klipper qua Moonraker), điều khiển từ xa |
| 4 | **Sản xuất (Orders)** | 2 chế độ: (a) **theo con** — đơn hàng → sản phẩm → miếng in (PrintItem có barcode) → mâm PEI → kiểm hàng đóng gói; (b) **số lượng lớn** — đơn → chia lượt mâm PEI theo máy, quẹt mã check-in/check-out từng lượt |
| 5 | **In tem nhãn** | In QR/Barcode/tem tùy chỉnh qua máy in nhiệt XPrinter USB (TSPL) |
| 6 | **Hàng hóa cửa hàng (Store)** | Tồn kho bán hàng, giá vốn → giá sàn/lẻ/KM tự tính, combo, ảnh, file in, đồng bộ MISA eShop |

Ngoài ra có 2 tính năng hạ tầng:
- **Trạm cân MQTT**: ESP32 + loadcell publish khối lượng realtime qua MQTT WebSocket.
- **Kiểm kho (Inventory session)**: phiên kiểm kê quét từng cuộn nhựa.

**Đặc điểm quan trọng cho việc làm app:**
- Toàn bộ giao diện hiện tại **tối ưu cho desktop/tablet ngang** (sidebar cố định 288px, bảng nhiều cột).
- **Không có xác thực người dùng** — API mở hoàn toàn, chỉ chạy trong LAN.
- Nhiều tính năng **phụ thuộc phần cứng cắm vào máy chủ** (máy in tem USB) hoặc **súng quét barcode HID** (bắt sự kiện bàn phím) — cần thiết kế lại cho iPhone.

---

## 2. KIẾN TRÚC & HẠ TẦNG

### 2.1. Sơ đồ tổng thể

```
┌──────────────┐   HTTP/JSON   ┌───────────────────────┐   Prisma   ┌────────────┐
│  Trình duyệt │ ────────────► │  Next.js App Router   │ ─────────► │ PostgreSQL │
│  / Tablet    │               │  (UI + API routes)    │            │  (docker)  │
│  ➜ FLUTTER   │               └───┬───────────┬───────┘            └────────────┘
└──────┬───────┘                   │           │
       │ WebSocket MQTT            │           │ REST (Long-Lived Token)
       │ (qua rewrite /mqtt)       │           ▼
       ▼                           │    ┌──────────────────┐
┌──────────────┐                   │    │  Home Assistant  │──► Máy in Bambu Lab
│  Mosquitto   │ ◄── ESP32 cân     │    └──────────────────┘
│  :9001 (ws)  │     (MQTT)        │    ┌──────────────────┐
│  :1883       │                   │    │    Moonraker     │──► Máy in Klipper
└──────────────┘                   │    └──────────────────┘
                                   │
                                   ▼ ghi trực tiếp /dev/usb/lp0 (TSPL binary)
                            ┌──────────────┐
                            │ XPrinter USB │ (tem nhiệt 40×30mm, 203 DPI)
                            └──────────────┘
                                   │
                                   ▼ HTTPS
                            ┌──────────────────────┐
                            │ MISA eShop API       │ (amisapp.misa.vn)
                            └──────────────────────┘
```

### 2.2. Stack & phiên bản

| Thành phần | Phiên bản | Ghi chú |
|-----------|-----------|---------|
| Next.js | ^16.2.12 | App Router, Turbopack |
| React | 19.2.4 | |
| Prisma | ^5.11 | `@prisma/client` |
| PostgreSQL | 15-alpine | docker container `3d_manage_postgres` |
| Tailwind CSS | v4 | qua `@tailwindcss/postcss` |
| mqtt.js | ^5.15.2 | WebSocket client |
| qrcode | ^1.5.4 | sinh QR (dataURL) |
| qr-scanner-wechat | ^0.1.3 | WASM decode QR từ camera |
| lucide-react | ^0.363 | icon |
| next-themes | ^0.4.6 | dark mode (mặc định `dark`, không theo system) |
| sharp | ^0.35 | nén thumbnail ảnh hàng hóa |
| vitest | ^1.4 | test |

### 2.3. Biến môi trường

| Biến | Mặc định | Ý nghĩa |
|------|----------|---------|
| `DATABASE_URL` | `postgresql://postgres:mysecretpassword@localhost:5432/filament_db` | Kết nối Postgres |
| `PRINTER_DEVICE_PATH` | `/dev/usb/lp0` | Cổng USB máy in tem |

### 2.4. Cấu hình mạng đáng lưu ý (`next.config.ts`)

- `rewrites`: `/mqtt` → `http://127.0.0.1:9001` (proxy WebSocket tới Mosquitto).
  → **App Flutter phải nối MQTT trực tiếp tới broker `ws://<host>:9001`** hoặc qua domain đã proxy (`wss://3d.quocan.click/mqtt`).
- `allowedDevOrigins`: tự động lấy IP LAN + `2d.quocan.click`, `3d.quocan.click`.
- `images.remotePatterns`: cho phép `cloud-slice-prod.s3.us-east-2.amazonaws.com`, `cdn.anycubic-cloud.anycubic.com`.

### 2.5. Chạy hệ thống

```bash
docker compose up -d          # PostgreSQL
npm install --legacy-peer-deps
npx prisma migrate deploy
npm run dev                   # next dev --hostname 0.0.0.0
```

Kiểm tra tổng quát:
```bash
npx tsc --noEmit && npm test && npx next build && npx eslint src
```

### 2.6. Cấu trúc thư mục

```
src/
├── app/
│   ├── page.tsx                    # Trang chủ — điều phối 11 tab + súng quét toàn cục
│   ├── layout.tsx                  # ThemeProvider + ScaleProvider (1 kết nối MQTT duy nhất)
│   ├── scale/page.tsx              # Màn hình trạm cân toàn màn hình
│   ├── hang-hoa-cua-hang/page.tsx  # URL riêng cho tab cửa hàng
│   └── api/                        # 44 REST operations
├── components/
│   ├── Dashboard/                  # dashboard-tab
│   ├── Filament/                   # 18 component: modal cuộn, kho, máy in, in tem, kiểm kho
│   ├── Orders/                     # 6 component: đơn hàng, miếng in, mâm PEI, kiểm hàng
│   ├── Printer/                    # CloudPrinterCard, PrinterDetailsModal
│   ├── Store/                      # store-management-tab (2611 dòng — lớn nhất)
│   ├── Settings/                   # misa-settings-tab
│   ├── scale-provider.tsx          # Context MQTT cân
│   └── theme-provider.tsx
├── services/                       # Business logic (Filament, Printer, Location, Inventory, Misa)
│   └── printer-integration/        # PrinterManager + BambuLabProvider + MoonrakerProvider
├── hooks/useScaleMqtt.ts
├── utils/                          # db, tspl-printer, barcode, api-response, dinh-gia-hang-hoa, anh-dai-dien, inventory-helpers
├── types/                          # filament.types, result
└── config/scale.ts
prisma/                             # schema + 8 migrations
public/audio/                       # 0-9.mp3, active/spool/done/tab_*.mp3 — đọc số khi cân
```

---

## 3. MÔ HÌNH DỮ LIỆU (DATABASE)

15 bảng. Toàn bộ tên trường giữ nguyên như Prisma schema (client Flutter phải map đúng).

### 3.1. Sơ đồ quan hệ

```
Filament 1──n Spool n──1 Location
                 │
                 ├──1 Printer n──1 CloudAccount
                 ├──n Task3DSpoolUsage n──1 Task3D n──1 Printer
                 └──n InventoryItem n──1 InventorySession

Order 1──n OrderProduct 1──n PrintItem n──1 PeiSheet n──1 Printer
                                        └──1 Printer

BulkOrder 1──n BulkRun n──1 Printer          (chế độ sản xuất số lượng lớn)

StoreProduct (self-relation: parent ──n children combo)
StoreConfig (singleton "main")
MisaCredential (singleton "default")
PrintJob (log lệnh in tem)
```

### 3.2. Chi tiết từng bảng

#### `Location` — Kho lưu trữ
| Trường | Kiểu | Ghi chú |
|--------|------|---------|
| `id` | String **PK** | Người dùng tự nhập, VD `LOC-01` |
| `name` | String | Tên hiển thị |
| `createdAt` / `updatedAt` | DateTime | |
| `spools` | Spool[] | quan hệ ngược |

#### `Filament` — Loại nhựa (type + màu + hãng)
| Trường | Kiểu | Ghi chú |
|--------|------|---------|
| `id` | String **PK** uuid | |
| `type` | String | PLA, PETG, ABS, TPU... |
| `colorName` | String | Đỏ, Đen, Trắng... |
| `colorHex` | String? | Hiển thị UI, VD `#FF0000` |
| `brand` | String? | eSun, Creality... |
| — | | **UNIQUE(type, colorName, brand)** |

#### `Printer` — Máy in 3D
| Trường | Kiểu | Ghi chú |
|--------|------|---------|
| `id` | String **PK** | Tự nhập, VD `PRT-ENDER3`. Máy cloud tự sinh: `PRT-BB-<cloudId>` / `PRT-MK-<cloudId>` |
| `name` | String | |
| `model` | String? | |
| `status` | String = `idle` | `idle` \| `printing` \| `maintenance` |
| `cloudAccountId` | String? FK → CloudAccount (SetNull) | |
| `cloudPrinterId` | String? | ID thực tế trên cloud/HA (entity prefix) |

#### `CloudAccount` — Tài khoản kết nối cloud
| Trường | Kiểu | Ghi chú |
|--------|------|---------|
| `id` | uuid **PK** | |
| `provider` | String | `bambulab` \| `moonraker` (code có nhắc `anycubic` nhưng chưa cài) |
| `email` | String? | **Thực chất lưu URL** (HA URL hoặc Moonraker URL) |
| `token` | Text | HA Long-Lived Access Token / API key — **KHÔNG BAO GIỜ trả về client** |
| `isActive` | Boolean = true | Tự set `false` khi connect thất bại |
| — | | **UNIQUE(provider, email)** |

#### `Spool` — Cuộn nhựa (thực thể trung tâm)
| Trường | Kiểu | Ghi chú |
|--------|------|---------|
| `id` | String **PK** | Người dùng tự nhập, VD `PLA-WHT-01` |
| `filamentId` | FK → Filament (Cascade) | |
| `locationId` | String? FK → Location (SetNull) | **loại trừ lẫn nhau với printerId** |
| `printerId` | String? FK → Printer (SetNull) | |
| `printerSlot` | Int? | Slot AMS 1-4 |
| `initialWeightG` | Float | Khối lượng nhựa ban đầu (VD 1000) |
| `emptySpoolWeightG` | Float = 220 | Khối lượng vỏ cuộn |
| `remainingWeightG` | Float | Chỉ tính phần nhựa |
| `status` | String = `active` | `active` \| `depleted` \| `archived` |
| Index | | filamentId, locationId, printerId, status |

#### `PrintJob` — Log lệnh in tem
| Trường | Kiểu | Ghi chú |
|--------|------|---------|
| `id` | uuid **PK** | |
| `qrCode` | String | Nội dung QR/barcode; tem bitmap dùng hằng `CUSTOM-BITMAP` |
| `label` | String | JSON string `{line1,line2,line3}` hoặc text |
| `status` | String = `pending` | `pending` \| `completed` \| `failed` |

#### `Task3D` — Lệnh in 3D (job)
| Trường | Kiểu | Ghi chú |
|--------|------|---------|
| `id` | uuid **PK** | |
| `printerId` | String? FK (SetNull) | |
| `name` | String? | Tên vật in |
| `status` | String = `printing` | `printing` \| `completed` \| `failed` \| `cancelled` |
| `estimatedEndTime` | DateTime? | = now + durationMinutes |
| `durationMinutes` | Int? | |

#### `Task3DSpoolUsage` — Lượng nhựa dùng cho 1 task
`id`, `taskId` FK(Cascade), `spoolId` FK?(SetNull), `usedWeightG` Float, `createdAt`.

#### `InventorySession` / `InventoryItem` — Phiên kiểm kho
- `InventorySession`: `id`, `active` Boolean=true, timestamps.
- `InventoryItem`: `id`, `sessionId` FK(Cascade), `spoolId` FK→Spool(Cascade), `scannedAt`. **UNIQUE(sessionId, spoolId)**.

#### `PeiSheet` — Mâm in PEI
`id` uuid, `name` (VD "Mâm PEI Số 1"), `printerId` FK?(SetNull), `items` PrintItem[].

#### `Order` — Đơn hàng
| Trường | Kiểu | Ghi chú |
|--------|------|---------|
| `id` | uuid **PK** | |
| `orderCode` | String? **UNIQUE** | Mã đơn tự nhập |
| `customerName` | String? | mặc định lưu `"Khách lẻ"` nếu để trống |
| `status` | String = `pending` | `pending` \| `printing` \| `completed` (hiện chưa có luồng cập nhật tự động) |

#### `OrderProduct` — Sản phẩm trong đơn
`id` uuid, `orderId` FK(Cascade), `name`, `quantity` Int (số bộ/hộp), `price` Float=0, `items` PrintItem[].

#### `PrintItem` — Miếng in (tem barcode)
| Trường | Kiểu | Ghi chú |
|--------|------|---------|
| `id` | String **PK** | **Barcode 8 chữ số** sinh ngẫu nhiên duy nhất |
| `productId` | FK → OrderProduct (Cascade) | |
| `name` | String | Tên miếng, VD "Nắp hộp" |
| `status` | String = `pending` | `pending` \| `printing` \| `completed` (code có nhắc `pre` khi quét) |
| `isChecked` | Boolean = false | Đã kiểm hàng đóng gói |
| `peiSheetId` | FK? (SetNull) | |
| `printerId` | FK? (SetNull) | |

#### `BulkOrder` — Đơn sản xuất số lượng lớn
Đơn vị quản lý là **1 lượt in (1 mâm PEI đầy)**, không phải từng con — đơn vài nghìn con thì không dán tem từng con nổi. Không dùng chung bảng nào với `Order`/`PrintItem`.

| Trường | Kiểu | Ghi chú |
|--------|------|---------|
| `id` | uuid **PK** | |
| `orderCode` | String? **UNIQUE** | VD `SLL-001` |
| `customerName` | String? | mặc định `"Khách lẻ"` |
| `productName` | String | tên sản phẩm đang chạy |
| `totalQuantity` | Int | tổng số con cả đơn |
| `perSheetQty` | Int | số con in được trên 1 mâm PEI |
| `note` | String? | |
| `status` | String = `pending` | `pending` \| `printing` \| `completed` — **tự suy từ trạng thái các lượt** (`trangThaiDon()`) |

#### `BulkRun` — 1 lượt in (1 mâm PEI trên 1 máy)
Số lượt = `ceil(totalQuantity / perSheetQty)`, chia **vòng tròn** cho các máy chọn lúc tạo đơn nên máy nào cũng có PEI 1, PEI 2… (logic ở `src/utils/bulk-production.ts`, có test).

| Trường | Kiểu | Ghi chú |
|--------|------|---------|
| `id` | String **PK** | **Barcode 8 chữ số**, sinh bằng `generateUniqueBarcode()` — không trùng với `PrintItem.id` |
| `orderId` | FK → BulkOrder (Cascade) | |
| `printerId` | FK? (SetNull) | |
| `printerName` | String | snapshot tên máy lúc chia lượt, để bảng vẫn đọc được khi máy bị xóa |
| `seq` | Int | thứ tự lượt trong cả đơn (1..N) |
| `peiIndex` | Int | lượt PEI thứ mấy **trên chính máy đó** |
| `quantity` | Int | số con của lượt (lượt cuối có thể lẻ) |
| `status` | String = `pending` | `pending` → `printing` → `completed` |
| `startedAt` / `finishedAt` | DateTime? | mốc quẹt check-in / check-out, **không nhập tay** |

#### `StoreProduct` — Hàng hóa cửa hàng
| Trường | Kiểu | Ghi chú |
|--------|------|---------|
| `id` | String **PK** | Client sinh: `SP-YYMMDD-XXXXX` |
| `maQR` | String **UNIQUE** | Mặc định = id; combo con = `<maQR mẹ>-1/-2/-5` |
| `ten`, `danhMuc` (=`Chưa phân loại`), `donVi` (=`cái`), `nhaCungCap`, `ghiChu` | String | |
| `giaVon` | Float | **Giá gốc người dùng nhập** |
| `tyLeLoiNhuan` | Float = 40 | **% lợi nhuận người dùng nhập** — kéo theo cả 3 giá bán (combo con dùng chung với mẹ) |
| `gia` | Float | Giá bán sàn — **server tự tính** từ `giaBanLe` + phí sàn |
| `giaBanLe` | Float | = giaVon × (1 + tyLeLoiNhuan/100) — server tự tính |
| `giaKhuyenMai` | Float | Giá niêm yết để KM 25% → về đúng `gia` |
| `soLuong` | Int | Tồn kho (combo con: tự tính từ mẹ) |
| `nguongCanhBao` | Int = 5 | Ngưỡng "sắp hết" |
| `thongTinRieng` | Json? | map cột tùy biến `{fieldId: value}` |
| `anhDaiDien` | Text? | thumbnail 96×96 JPEG q55 base64 (server sinh bằng sharp) |
| `anh` | Json? | mảng `{id,ten,duLieu(base64),loai,dungLuong}` |
| `tepIn` | Json? | file thiết kế/in (PDF/STL/3MF/gcode), cùng shape |
| `lichSu` | Json? | mảng `{id,thoiGian(ISO),noiDung}` |
| `ngayTao` / `ngayCapNhat` | **String** (ISO) | cố tình để String để round-trip chính xác với client |
| `parentId` | String? self-FK (Cascade) | combo con → sản phẩm mẹ |
| `soLuongCombo` | Int? | 1 / 2 / 5; null = sản phẩm mẹ |

#### `StoreConfig` — singleton `id = "main"`, `truongRieng` Json (mảng `{id, ten}`).

#### `MisaCredential` — singleton `id = "default"`
`bearerToken`, `cookie`, `deviceId`, `msBid`, `dbid`, `tid`, `tco`, `brid`, `lastCheckedAt`, `lastCheckOk`, `lastCheckMessage`, `updatedAt`.

---

## 4. QUY ƯỚC MÃ QR / BARCODE / LỆNH ĐẶC BIỆT

### 4.1. Tiền tố mã (dùng để nhận diện khi quét)

| Tiền tố | Thực thể | Ví dụ |
|---------|----------|-------|
| `LOC-` | Kho lưu trữ | `LOC-01` |
| `PRT-` | Máy in | `PRT-ENDER3`, `PRT-BB-x1c` |
| `PRT-xx-L1..L4` | **Slot AMS của máy in** | `PRT-01-L2` |
| `CLR-` | Mã màu nhựa (tem màu) | `CLR-DO`, `CLR-TRANG` |
| (tự do) | Cuộn nhựa | `PLA-WHT-01` |
| 8 chữ số | Miếng in (PrintItem) | `48120593` |
| `SP-YYMMDD-XXXXX` | Hàng hóa cửa hàng | `SP-260811-A3F2K` |

**Chuẩn hóa khi quét:** code được `.replace(/-/g,'').toUpperCase()` rồi so khớp — nên `PLAWHT01` và `PLA-WHT-01` là một.

### 4.2. QR lệnh (command QR) — quét thay cho bấm nút

| Mã | Nơi hiệu lực | Tác dụng |
|----|--------------|----------|
| `CMD-INV-RESET` | Tab Kiểm kho | Bắt đầu phiên kiểm kho mới |
| `CMD-INV-TOGGLE-ALL` | Tab Kiểm kho | Bật/tắt hiển thị mọi trạng thái cuộn |
| `CMD-WEIGHT-TAB` | Modal cân | Chuyển ô nhập đang active (total → remaining → empty) |
| `CMD-WEIGHT-DONE` | Modal cân | Lưu & đóng |
| `PRT-xx-L1..4` | Toàn cục | Bật chế độ "quét cuộn để gán vào slot AMS" |

> Component `qr-commands-modal.tsx` chịu trách nhiệm hiển thị & in các QR lệnh này.

### 4.3. Quy tắc luồng quét toàn cục (`src/app/page.tsx`)

Súng quét HID được bắt bằng `keydown` toàn cục: gom ký tự, reset buffer nếu >120ms giữa 2 phím, `Enter` = kết thúc mã (tối thiểu 3 ký tự). Bỏ qua khi đang focus vào INPUT/TEXTAREA.

Sau khi có mã:
1. Tab `print-qr` / `create-job` / `check-inventory` → tab tự xử lý (không làm gì ở tầng toàn cục).
2. Tab `production` → nếu mã toàn số, phát event `productionNumericScanned`.
3. Nếu đang có **scanMode** (đang ở chế độ gán/tháo kho hoặc máy in) và mã là cuộn nhựa → gọi `PUT /api/spools/:id` gán/tháo.
4. Mã là kho → mở modal quản lý kho.
5. Mã là máy in (kèm slot) → bật scanMode gán slot; không slot → mở modal quản lý máy in.
6. Mã là cuộn nhựa → mở modal cập nhật khối lượng (cân).
7. Không khớp → popup "Không tìm thấy mã".

---

## 5. ĐẶC TẢ API ĐẦY ĐỦ

### 5.1. Quy ước response

Thành công:
```json
{ "status": "success", "data": <T>, "message": "..." }
```
Thất bại:
```json
{ "status": "error", "data": null, "message": "Thông báo tiếng Việt",
  "error": { "code": "VALIDATION_ERROR|DATABASE_ERROR|BAD_REQUEST|ALREADY_EXISTS|SCAN_FAILED", "details": "..." } }
```
> ⚠️ Chưa hoàn toàn nhất quán: một số route mới dùng helper `ok()/fail()` (không có field `error`), một số route cũ trả đủ `data: null` + `error`. **Client phải luôn kiểm tra `body.status === 'success'`, không dựa vào HTTP status code.**

Mã HTTP dùng: 200, 201 (tạo máy in), 400, 401 (login cloud lỗi), 404, 500, 502.

**Không có xác thực. Không có phân trang. Không có filter/sort phía server** (trừ `GET /api/print-jobs?status=`).

---

### 5.2. Dashboard

#### `GET /api/dashboard/stats`
```jsonc
// data
{
  "totalSpools": 42, "activeSpools": 30, "depletedSpools": 5, "lowSpools": 4,   // low = active && remaining/initial < 0.2
  "totalRemainingWeightG": 28450.5,
  "spoolsByMaterialType": { "PLA": 25, "PETG": 10 },
  "spoolsByColor": { "Đen": 8, "Trắng": 6 }
}
```

---

### 5.3. Filament (loại nhựa)

#### `GET /api/filaments`
Trả **toàn bộ** loại nhựa, mỗi loại kèm `spools[]` (đã include `location` và `printer` đầy đủ), sắp xếp `type ASC`, spool `createdAt DESC`.
→ **Đây là nguồn dữ liệu chính của app**: danh sách cuộn nhựa được suy ra bằng cách flatten `filaments[].spools[]`.

```jsonc
// data: FilamentWithSpools[]
[{
  "id":"uuid","type":"PLA","colorName":"Trắng","colorHex":"#FFFFFF","brand":"eSun",
  "createdAt":"...","updatedAt":"...",
  "spools":[{
    "id":"PLA-WHT-01","filamentId":"uuid","locationId":"LOC-01","location":{...},
    "printerId":null,"printer":null,"printerSlot":null,
    "initialWeightG":1000,"emptySpoolWeightG":220,"remainingWeightG":735,
    "status":"active","createdAt":"...","updatedAt":"..."
  }]
}]
```

#### `POST /api/filaments`
Body: `{ type*, colorName*, colorHex?, brand? }` → 400 nếu thiếu type/colorName; 400 `ALREADY_EXISTS` nếu trùng (so sánh **case-insensitive** type+color+brand).

#### `DELETE /api/filaments/[id]`
Xóa loại nhựa → **Cascade xóa hết cuộn thuộc loại đó**.

---

### 5.4. Spool (cuộn nhựa)

#### `POST /api/spools`
Body:
```jsonc
{
  "id": "PLA-WHT-01",              // * bắt buộc, unique
  "filamentId": "uuid",            // HOẶC bộ (type + colorName [+ colorHex, brand])
  "type": "PLA", "colorName": "Trắng", "colorHex": "#FFF", "brand": "eSun",
  "locationId": "LOC-01",          // loại trừ lẫn nhau với printerId
  "printerId": "PRT-01",
  "initialWeightG": 1000,          // *
  "emptySpoolWeightG": 220,        // mặc định 220
  "remainingWeightG": 1000,        // *
  "status": "active"
}
```
Logic: nếu không có `filamentId` → tìm loại nhựa khớp (case-insensitive), **không có thì tạo mới tự động**. Nếu truyền cả `locationId` và `printerId` → ưu tiên `locationId`, xóa `printerId`.
Response `data` = spool đã include `filament` + `location`.

#### `PUT /api/spools/[id]`
Body (mọi trường optional): `{ newId, brand, locationId, printerId, printerSlot, initialWeightG, emptySpoolWeightG, remainingWeightG, status }`
- `newId` → đổi mã cuộn (kiểm tra trùng).
- `brand` → **chuyển cuộn sang Filament khác** (tìm/tạo loại nhựa cùng type+color nhưng brand mới).
- `locationId` truthy → tự set `printerId = null`; và ngược lại.
- `printerSlot` chỉ giữ khi có `printerId`, ngược lại về `null`.
- Validate: `remaining >= 0` và `remaining <= initial`.
- `status` mặc định: nếu remaining = 0 → `depleted`.

#### `PUT /api/spools/[id]/weight`
Body `{ remainingWeightG }`. Validate như trên. Chuyển trạng thái: `0 → depleted`; `depleted + >0 → active`; **`archived` giữ nguyên**.

#### `DELETE /api/spools/[id]`

---

### 5.5. Location (kho)

| Endpoint | Body | Ghi chú |
|----------|------|---------|
| `GET /api/locations` | — | kèm `spools[]` (include `filament`), sort `createdAt ASC` |
| `POST /api/locations` | `{ id*, name* }` | kiểm tra trùng id |
| `PUT /api/locations/[id]` | `{ name* }` | |
| `DELETE /api/locations/[id]` | — | Spool.locationId → null (SetNull) |

---

### 5.6. Printer (máy in)

#### `GET /api/printers`
Kèm: `spools[]` (include `filament`), `tasks[]` (chỉ 1 task `status=printing` mới nhất), `cloudAccount` (**chỉ `{id, provider, email, isActive}` — KHÔNG có token**). Sort `createdAt DESC`.

#### `POST /api/printers` → 201
Body `{ id*, name*, model?, status? }`.

#### `PUT /api/printers/[id]` — Body `{ name?, model?, status? }`
#### `DELETE /api/printers/[id]`
Xử lý lỗi Prisma: `P2025` → "Máy in không tồn tại"; `P2003` → "còn dữ liệu liên quan".

---

### 5.7. Cloud printer (Bambu Lab / Moonraker)

#### `POST /api/printers/bambulab/login`
Body `{ url*, apiKey*, reset? }` — `url` = URL Home Assistant, `apiKey` = Long-Lived Access Token.
Luồng: test `GET {url}/api/config` → nếu lỗi trả **401**. Lưu/ cập nhật `CloudAccount` (`reset:true` → xóa account cũ rồi tạo mới). Đăng ký provider vào `PrinterManager`, `connect()` chạy nền.
```jsonc
// data
{ "accountId":"uuid", "email":"http://192.168.x.x:8123", "isExistingAccount": false,
  "cloudPrinters":[{ "id":"x1_carbon", "name":"X1 Carbon", "status":"idle", "linkedLocalId": null }] }
```

#### `POST /api/printers/moonraker/login` — Body `{ url*, apiKey? }` (tương tự, `GET {url}/printer/info`)

#### `POST /api/printers/bambulab/link` & `POST /api/printers/moonraker/link`
Body:
```jsonc
{ "accountId":"uuid",
  "mappings":[{ "cloudPrinterId":"x1_carbon", "cloudPrinterName":"X1C", "model":"X1 Carbon",
                "localPrinterId":"NEW" }] }   // "NEW" = tạo máy mới id PRT-BB-<cloudId> / PRT-MK-<cloudId>
```

#### `GET /api/printers/cloud/accounts`
`data`: `[{id, provider, email}]` — chỉ account `isActive=true`, không token.

#### `GET /api/printers/cloud/discover?accountId=...`
Lấy danh sách máy in từ tài khoản cloud đã lưu (không cần nhập lại URL/token). Lỗi kết nối → **502**.

#### `GET /api/printers/cloud/status` hoặc `?printerId=PRT-01`
- Có `printerId`: `data` = `PrinterStatusData` hoặc `{status:'offline'}`.
- Không có: `data` = `{ "<localPrinterId>": PrinterStatusData }` cho **mọi máy đã link cloud** (gọi song song).

`PrinterStatusData`:
```jsonc
{
  "status": "idle|printing|offline|maintenance|error",
  "nozzleTemp": 210, "nozzleTargetTemp": 220,
  "bedTemp": 60, "bedTargetTemp": 60,
  "progress": 47,                        // 0-100
  "remainingTimeSeconds": 10380,
  "fileName": "abc.gcode.3mf",
  "previewUrl": "http://ha/api/image_proxy/...",
  "materials": [ {"name":"PLA","color":"#FF0000"}, null, null, null ],  // 4 khay AMS, null = trống
  "extendedInfo": {
    "provider": "bambulab",
    "payload": { "name","current_print","layer_num","total_layers","remaining_time",
                 "temperatures":{...}, "cooling_fan_speed","speed_level",
                 "nozzles":[{"nozzle_diameter","nozzle_type"}], "chamber_light": true,
                 "firmware_version","print_weight","print_length","print_bed_type",
                 "printable_objects","skipped_objects","start_time","end_time","previewUrl" }
  }
}
```

#### `POST /api/printers/cloud/control`
Body `{ printerId*, action*, value? }`.

| action | value | Bambu (qua HA) | Moonraker |
|--------|-------|----------------|-----------|
| `light` | `{on: bool}` | `light.<prefix>_chamber_light` turn_on/off | `POST /api/light` (KX-Bridge) |
| `temp-nozzle` | `{target: n}` | `number.<prefix>_nozzle_target_temperature` | gcode `M104 S<n>` |
| `temp-bed` | `{target: n}` | `number.<prefix>_bed_target_temperature` | gcode `M140 S<n>` |
| `fan` | `{speed: 0-100}` | `number.<prefix>_part_cooling_fan_speed` | gcode `M106 S<0-255>` |
| `pause` / `resume` / `stop` | — | `button.<prefix>_pause/resume/stop_printing` | `/printer/print/pause\|resume\|cancel` |
| `sync-ams` | `{spools: Spool[]}` | gọi `bambu_lab.set_filament` cho từng slot | không hỗ trợ |

`sync-ams` map loại nhựa → filament id Bambu: PLA `GFL99`, PETG `GFG99` (220-260°C), ABS `GFB99` (240-280°C), TPU `GFU99`; mặc định PLA 190-230°C. Màu hex bổ sung alpha `FF`.

#### `POST /api/printers/cloud/filament`
Body `{ printerId*, amsId*, trayId*, type*, colorHex* }` — **hiện `BambuLabProvider.setFilament()` luôn trả false** (chưa cài đặt). Trả 400 với thông báo không hỗ trợ.

#### `GET /api/printers/status/[accountId]/[printerId]`
Đọc status từ cache **đồng bộ** (không lazy-load provider) → 404 nếu chưa có.

---

### 5.8. Task3D (lệnh in 3D)

#### `GET /api/tasks3d`
Danh sách task `createdAt DESC`, include `printer` + `usages[].spool.filament`.

#### `POST /api/tasks3d`
Body:
```jsonc
{ "printerId":"PRT-01", "durationMinutes":180, "name":"Hộp A",
  "spools":[{"id":"PLA-WHT-01","weightG":250}] }
```
Trong 1 transaction:
1. `Printer.status = 'printing'`
2. Tạo `Task3D` (`estimatedEndTime = now + durationMinutes`, `status='printing'`)
3. Với mỗi cuộn: trừ `remainingWeightG` (không âm), `depleted` nếu về 0, **`locationId = null` + `printerId = <máy in>`** (cuộn rời kho, lên máy), tạo `Task3DSpoolUsage`.

> ⚠️ **Không có endpoint cập nhật/hoàn thành/hủy Task3D.** Task chỉ chuyển trạng thái ngầm ở UI dựa trên `estimatedEndTime`.

---

### 5.9. Inventory (kiểm kho)

| Endpoint | Hành vi |
|----------|---------|
| `GET /api/inventory/session` | Lấy phiên `active=true`, **tự tạo nếu chưa có**; include `items` sort `scannedAt DESC` |
| `DELETE /api/inventory/session` | Set mọi phiên active = false, tạo phiên mới |
| `POST /api/inventory/scan` | Body `{spoolId*}` → kiểm tra cuộn tồn tại (400 nếu không), **upsert** InventoryItem (quét lại chỉ cập nhật `scannedAt`) |

`POST /scan` response:
```jsonc
{ "item": {...}, "spool": { "id","filamentType","filamentColorName","filamentColorHex","filamentBrand","remainingWeightG" } }
```

---

### 5.10. Orders (đơn hàng)

#### `GET /api/orders`
Toàn bộ đơn kèm `products[].items[]`, sort `createdAt DESC`.

#### `POST /api/orders`
```jsonc
{ "customerName":"Anh A", "orderCode":"DH001",
  "products":[{ "name":"Hộp A", "quantity":5, "price":120000,
                "piecesPerProduct":[{"name":"Mặt A","count":1},{"name":"Mặt B","count":2}] }] }
```
- `orderCode` trùng → 400.
- **Số tem sinh ra = `count × quantity`** cho từng loại miếng. Ví dụ trên: 5 tem "Mặt A" + 10 tem "Mặt B".
- Barcode sinh **trước** transaction (dùng chung `Set` chống trùng trong batch), sau đó `createMany`.

#### `GET /api/orders/[id]`
`id` chấp nhận **cả `Order.id` (uuid) lẫn `orderCode`** → dùng cho màn kiểm hàng.

#### `PUT /api/orders/[id]` — cập nhật đơn (logic phức tạp nhất hệ thống)
Body giống POST + `products[].id` (có id = sản phẩm cũ, không id = thêm mới).

**Bước 1 — kiểm tra trước khi ghi:** sản phẩm bị bỏ khỏi danh sách mà **có tem `status !== 'pending'`** → 400 "đã có tem đang in/in xong, không thể xóa bỏ".

**Bước 2 — tính diff (ngoài transaction):** với mỗi tên miếng, `targetCount = count × quantity`:
- thiếu → sinh thêm barcode mới
- thừa → **chỉ xóa tem `pending`** (tối đa số pending hiện có)

**Bước 3 — 1 transaction:** update order + products, xóa tem thừa, xóa sản phẩm bị bỏ, tạo sản phẩm mới + tem, tạo tem bổ sung.

#### `DELETE /api/orders/[id]`
Chặn nếu bất kỳ tem nào `status !== 'pending'`. Cascade Order → OrderProduct → PrintItem.

---

### 5.11. PrintItem (miếng in)

| Endpoint | Ghi chú |
|----------|---------|
| `GET /api/print-items` | Toàn bộ, include `product.order`, `peiSheet`, `printer`; sort `createdAt DESC` |
| `GET /api/print-items/[id]` | include `product.order` |
| `PATCH /api/print-items/[id]` | Body bất kỳ trong `{status, peiSheetId, printerId, isChecked}` (chỉ ghi field được gửi) |
| `DELETE /api/print-items/[id]` | |
| `PATCH /api/print-items/batch` | Body `{itemIds: string[], status?, printerId?}` → `updateMany` |

**Vòng đời trạng thái khi quét barcode (tab Miếng in):** `pending → printing`, `pre → printing`, `printing → completed`, khác → `pending`.

---

### 5.12. PeiSheet (mâm in)

| Endpoint | Ghi chú |
|----------|---------|
| `GET /api/pei-sheets` | include `items`, `printer`; sort `createdAt DESC` |
| `POST /api/pei-sheets` | `{name}` |
| `PATCH /api/pei-sheets/[id]` | `{name?, printerId?}` |
| `DELETE /api/pei-sheets/[id]` | PrintItem.peiSheetId → null |

---

### 5.12b. Bulk Orders / Bulk Runs (sản xuất số lượng lớn)

| Endpoint | Ghi chú |
|----------|---------|
| `GET /api/bulk-orders` | include `runs` (kèm `printer`, sort `seq ASC`); sort `createdAt DESC` |
| `POST /api/bulk-orders` | `{productName, totalQuantity, perSheetQty, printerIds[], orderCode?, customerName?, note?}` → **tự chia lượt + cấp mã vạch cho từng lượt**. `printerIds` giữ nguyên thứ tự người dùng chọn (máy đầu nhận lượt 1) |
| `GET /api/bulk-orders/[id]` | |
| `PATCH /api/bulk-orders/[id]` | `{orderCode?, customerName?, productName?, note?, status?}` — **không chia lại lượt**, muốn đổi số lượng thì xóa đơn tạo lại |
| `DELETE /api/bulk-orders/[id]` | Xóa luôn các `BulkRun` (Cascade) |
| `POST /api/bulk-runs/scan` | `{code}` → quẹt lần 1 set `printing` + `startedAt`, lần 2 set `completed` + `finishedAt`; lần 3 trả lỗi 400 kèm giờ đã xong. Cập nhật lại `BulkOrder.status` sau mỗi lần quẹt |
| `PATCH /api/bulk-runs/[id]` | Sửa tay `{status?, printerId?, quantity?, startedAt?, finishedAt?}`. `status: 'pending'` **xóa cả 2 mốc thời gian** (dùng khi quẹt nhầm) |

---

### 5.13. Print Jobs (in tem nhiệt)

> ⚠️ **Tất cả endpoint này ghi trực tiếp vào `/dev/usb/lp0` của máy chủ.** App Flutter gọi được nhưng máy in phải cắm vào server, không phải iPhone.

#### `POST /api/print-jobs` — in 1 tem
```jsonc
{ "qrCode":"PLA-WHT-01",
  "label":"{\"line1\":\"PLA-WHT-01\",\"line2\":\"PLA\",\"line3\":\"TRẮNG\"}",  // JSON string
  "layout":"printerSlot", "slotNumber": 2 }    // optional: layout tem slot (in 2 trang)
```
Sinh TSPL 40×30mm → ghi USB → lưu `PrintJob` với status `completed`/`failed`. Lỗi in → HTTP 500 nhưng vẫn có `data` = job.

#### `POST /api/print-jobs/batch` — in nhiều tem barcode đơn hàng
```jsonc
{ "jobs":[ { "qrCode":"48120593", "labelData":{"line1":"","line2":"Hộp A - Mặt A","line3":"1-1"} } ] }
```
Dùng layout **Code 128** (`buildOrderBarcodeTSPLCommand`), nối chuỗi TSPL rồi ghi 1 lần, `createMany` log.

#### `POST /api/print-jobs/custom` — in tem bitmap tùy chỉnh
```jsonc
{ "bitmapBase64":"<base64 9600 bytes>", "copies": 1, "label":"mô tả" }
```
- Bitmap **bắt buộc đúng 9600 bytes** = 320×240 px, 1-bit/pixel, 40 bytes/dòng, MSB first.
- `copies` clamp 1..20.
- Client render label lên `<canvas>` 320×240 → chuyển mono bitmap → base64. **Đây là cách duy nhất in được tiếng Việt có dấu.**

#### `GET /api/print-jobs?status=` — 50 job gần nhất
#### `PUT /api/print-jobs/[id]` — `{status}`

---

### 5.14. Store Products (hàng hóa cửa hàng)

#### `GET /api/store-products`
```jsonc
{ "sanPham": [ /* StoreProduct[] — anh[]/tepIn[] chỉ có metadata, duLieu = "" */ ],
  "truongRieng": [ {"id":"viTri","ten":"Vị trí kệ"} ] }   // null = client dùng bộ mặc định
```
Sort `ngayCapNhat DESC`. **Cố tình bỏ base64** của ảnh/file in để không tải hàng chục MB.

#### `GET /api/store-products/[id]/anh` → `{ "anh": AnhSanPham[] }` (có base64 đầy đủ)
#### `GET /api/store-products/[id]/tep-in` → `{ "tepIn": TepIn[] }`

#### `PUT /api/store-products` — **đồng bộ TOÀN BỘ dữ liệu (full replace)**
Body `{ sanPham: SanPhamPayload[], truongRieng: [] }`.

Quy tắc server:
1. **Xóa** mọi StoreProduct có id không nằm trong `sanPham` gửi lên.
2. `anh`/`tepIn` **là `undefined` (không gửi field)** → giữ nguyên dữ liệu cũ. Gửi mảng rỗng = xóa hết. → Client **bắt buộc** bỏ field nếu chưa lazy-load ảnh/file của hàng hóa đó.
3. `gia`, `giaBanLe`, `giaKhuyenMai` **luôn tính lại từ `giaVon` + `tyLeLoiNhuan`** (bỏ qua giá client gửi). `tyLeLoiNhuan` thiếu/âm/không phải số → về mặc định 40.
4. Combo con: `giaVon`, `tyLeLoiNhuan` và `soLuong` **tính lại từ sản phẩm mẹ trong chính payload này** (không đọc DB cũ).
5. Sản phẩm mẹ được upsert trước con (sắp xếp theo `parentId`).
6. `anhDaiDien` sinh bằng sharp từ `anh[0]` (chỉ khi có gửi `anh`).
7. Transaction `timeout: 60s, maxWait: 10s`.

> ⚠️ Đây là **API nặng nhất** — client web debounce 800ms rồi PUT lại toàn bộ. Với app mobile cần cân nhắc (xem §11.6).

---

### 5.15. MISA eShop

| Endpoint | Ghi chú |
|----------|---------|
| `GET /api/misa/credential` | Trả bản public: `hasToken`, `tokenPreview` (`...10 ký tự cuối`), `hasCookie`, `deviceId`, `msBid`, `dbid`, `tid`, `tco`, `brid`, `updatedAt`, `lastCheckedAt`, `lastCheckOk`, `lastCheckMessage` |
| `PUT /api/misa/credential` | Body các field trên — **chỉ ghi đè field gửi lên và khác rỗng** |
| `POST /api/misa/check-token` | Ping `POST https://amisapp.misa.vn/eshop/g2/api/system/dBOptions/get-by-optionids` body `["ManageLotAndExceedDate"]`; nếu response có `IsAuthExpired: true` → token hết hạn. Lưu kết quả vào DB |

Header gửi tới MISA: `Authorization: Bearer <token>`, `Cookie`, `x-deviceid`, `x-ms-bid`, `x-ems-context: {dbid,tid,tco,lang:'vi',brid,shtype:3,ica:false}`.

---

## 6. BUSINESS LOGIC THEO TỪNG DOMAIN

### 6.1. Cuộn nhựa & khối lượng

**Quy tắc loại trừ vị trí:** một cuộn chỉ ở **một trong hai**: trong kho (`locationId`) hoặc trên máy in (`printerId`). Gán bên này tự xóa bên kia. Áp dụng ở: `createSpoolUnified`, `updateSpool`, `assignSpoolToPrinter`, `POST /api/tasks3d`.

**Chuyển trạng thái tự động:**
- `remainingWeightG = 0` → `depleted`
- `depleted` + cân lại > 0 → `active`
- `archived` **không tự hồi sinh**

**Validate:** `0 ≤ remainingWeightG ≤ initialWeightG`.

**Công thức cân:** người dùng cân **cả cuộn** → `remainingWeightG = tổng cân − emptySpoolWeightG` (clamp `[0, initialWeightG]`). `emptySpoolWeightG` mặc định 220g.

**Cảnh báo màu ở bảng cuộn nhựa:** ≤150g đỏ, ≤330g vàng, còn lại bình thường. Dashboard tính "sắp hết" = `active && remaining/initial < 0.2`.

**Đổi thương hiệu cuộn** không sửa `Filament.brand` mà **chuyển cuộn sang Filament khác** (tìm/tạo theo type+color+brand mới).

### 6.2. Định giá hàng hóa cửa hàng (`src/utils/dinh-gia-hang-hoa.ts`)

Hằng số: phí sàn cố định **3.000đ**, phí % sàn **30%**, tỷ lệ KM sàn **25%**, % lợi nhuận mặc định **40%**.

Dây chuyền tính (đổi `tyLeLoiNhuan` là cả 3 giá đổi theo):
```
giaBanLe        = round( giaVon × (1 + tyLeLoiNhuan/100) )   // tyLeLoiNhuan mặc định 40
giaBanSan (gia) = round( (giaBanLe + 3000) / (1 − 0.30) )
giaKhuyenMai    = round( gia / (1 − 0.25) )
```
Ràng buộc: **bán trên sàn lời đúng bằng bán lẻ** — sau khi sàn trừ phí cố định + 30%, số thu về đúng bằng `giaBanLe`.
(Bản tổng quát của ràng buộc gốc 2026-08-06 "lợi nhuận sàn = 1 giá vốn": đặt `tyLeLoiNhuan = 100` là ra công thức cũ.)

**Combo con** (tự sinh 3 sản phẩm: gộp 1 / 2 / 5 cái):
```
maQR con        = <maQR mẹ>-1 / -2 / -5
giaVon con      = round(giaVon mẹ × hệ số),  hệ số: {1: 1.5, 2: 2, 5: 4}
soLuong con     = floor(soLuong mẹ / soLuongCombo)     // luôn tính "sống", không lưu độc lập
```
Xóa mẹ → Cascade xóa con. Tồn kho combo **không sửa trực tiếp được** (phải sửa ở mẹ).

**Thống kê kho chỉ tính sản phẩm mẹ** (combo dùng chung tồn kho vật lý, cộng vào sẽ đếm trùng).

**Migration 1 lần cho dữ liệu cũ:** nút "Chuyển giá cũ → giá vốn" lấy `gia` hiện tại chia đôi làm `giaVon` rồi tính lại toàn bộ (chỉ cho sản phẩm mẹ có `giaVon = 0 && gia > 0`).

**Bảng tính giá vốn tham khảo** (nút "Tính giá vốn" trên thanh công cụ tab Store — `ModalTinhGiaVon`):
```
giá 1 sản phẩm = (soGam × tienMoiGam + soGio × tienMoiGio) / soSanPham
```
Hoàn toàn **tách rời** dữ liệu hàng hóa: không đọc/ghi sản phẩm nào, chỉ nhớ lần nhập trước trong localStorage (`quan-ly-cua-hang-tinh-gia-von-v1`). Người dùng tự xem số rồi nhập tay vào ô Giá vốn nếu muốn.

### 6.3. Sinh barcode miếng in (`src/utils/barcode.ts`)

Số ngẫu nhiên 8 chữ số `10000000..99999999`, loop cho tới khi không trùng DB **và** không trùng `Set` các mã đã cấp trong cùng batch.

### 6.4. Sinh lệnh TSPL (`src/utils/tspl-printer.ts`)

Tem chuẩn **40mm × 30mm = 320 × 240 dots @ 203 DPI**.

Xử lý chuỗi trước khi in (font firmware không hỗ trợ Unicode):
1. `removeDiacritics()` — NFD + bỏ dấu + `đ→d`, `Đ→D`
2. `sanitizeTSPL()` — `"` → `'`, xuống dòng → space (chống chèn lệnh TSPL lạ)
3. `.toUpperCase()`

**4 hàm sinh lệnh:**

| Hàm | Layout |
|-----|--------|
| `buildTSPLCommand(qr, {line1,line2,line3})` | QR cell=8 bên trái + line2 dưới QR + vạch dọc X=176 + line1/line3 xoay 270° bên phải |
| `buildOrderBarcodeTSPLCommand(barcode, data)` | Tên miếng to (tự wrap tối đa 2 dòng, 16 ký tự/dòng) + Code128 (`128M`, cao 80, ẩn text) + STT căn giữa |
| `buildPrinterSlotTSPLCommand(qr, slot)` | **2 trang**: trang 1 QR cell=9 + số slot; trang 2 số slot khổng lồ (font 3, scale 6×6) |
| `buildBitmapTSPLCommand(buffer, copies)` | `BITMAP 0,0,40,240,0,` + 9600 bytes binary + `PRINT n,1` |
| `buildCustomLabelTSPLCommand(opts)` | 4 template: `qr-text`, `barcode-text`, `text-only`, `qr-large`; font `sm/md/lg` = scale 1/2/3 |

Gửi: `fs.promises.writeFile(PRINTER_DEVICE_PATH, ...)` — `sendToPrinter` (utf-8) và `sendToPrinterBinary` (raw Buffer).

### 6.5. Lọc & sắp xếp kiểm kho (`src/utils/inventory-helpers.ts`)

`filterAndSortSpoolsForInventory(spools, scannedMap, searchQuery, showAllStatuses, filterScanStatus)`:
1. Lọc status (mặc định chỉ `active`)
2. Lọc theo `all | scanned | unscanned`
3. Lọc từ khóa (id / type / color / brand, case-insensitive)
4. Sắp xếp: **chưa quét lên trước** → trong mỗi nhóm `active` trước → cuối cùng theo `remainingWeightG` tăng dần

### 6.6. Rendering client-side cho tem bitmap (`print-label-tab.tsx`)

- Tự cài đặt **Code 128 subset B** (`encodeCode128B` + bảng `C128_PATTERNS`) để vẽ barcode lên canvas.
- `drawQROnCanvas` dùng `qrcode` → dataURL → vẽ vào canvas.
- `canvasToMonoBitmap`: grayscale `0.299R + 0.587G + 0.114B` có xét alpha, threshold → bit MSB-first, 40 bytes/dòng.
- Kết quả base64 gửi `POST /api/print-jobs/custom`.

---

## 7. BẢN ĐỒ MÀN HÌNH & TÍNH NĂNG UI HIỆN TẠI

### 7.1. Điều hướng

**3 route thật:**
- `/` — trang chủ, sidebar 11 mục (10 tab nội bộ + 1 link ngoài)
- `/hang-hoa-cua-hang` — tab cửa hàng (URL riêng để bookmark)
- `/scale` — màn hình trạm cân toàn màn hình (dùng cho tablet gắn cố định)

**Sidebar (`navigation` trong `page.tsx`):**

| key | Nhãn | Icon |
|-----|------|------|
| `dashboard` | Tổng quan | LayoutDashboard |
| `spools` | Cuộn nhựa | Database |
| `filaments` | Loại nhựa | Palette |
| `locations` | Kho lưu trữ | FolderOpen |
| `printers` | Máy in | Printer |
| `production` | Sản xuất | ShoppingBag |
| `store-products` | Hàng hóa cửa hàng | Store (→ `/hang-hoa-cua-hang`) |
| `print-qr` | In QR | QrCode |
| `print-label` | In Tem | Tag |
| `create-job` | Tạo job in | ListOrdered |
| `check-inventory` | Kiểm kho | PackageSearch |
| `settings` | Cài đặt | Settings |

**Header toàn cục:** ô tìm kiếm nhanh (lọc client-side cả loại nhựa + cuộn), select lọc vật liệu, nút Tải lại, nút Thêm cuộn, **widget trạm cân** (chấm xanh nhấp nháy khi kết nối + số gram realtime, bấm mở modal hiệu chuẩn).

**Toast & Confirm toàn cục:** component con phát `CustomEvent('appToast')` / `CustomEvent('appConfirm')` lên `window`, `page.tsx` lắng nghe và hiển thị.

---

### 7.2. Tab Tổng quan (Dashboard)
5 stat card: Tổng số cuộn, Đang sử dụng, Sắp hết (<20%), Đã dùng hết, Tổng khối lượng còn lại. Cộng biểu đồ phân bổ theo loại vật liệu / màu (`spoolsByMaterialType`, `spoolsByColor`).

### 7.3. Tab Cuộn nhựa
Bảng: Cuộn (id mono) | Vật liệu | Màu (chấm hex) | **Còn lại (click header để đảo chiều sort)** | Vị trí (icon kho/máy in) | Trạng thái | 4 nút (Cân, Sửa, In QR, Xóa).
Tô màu dòng theo khối lượng còn lại.

### 7.4. Tab Loại nhựa
Lưới card: chấm màu + `brand + type` + `colorName`, số cuộn, tổng còn lại, nút "Thêm cuộn màu này", nút xóa. Click chấm màu → **ColorDetailModal** (danh sách cuộn cùng màu + in tem `CLR-`).

### 7.5. Tab Kho lưu trữ
Lưới card kho + nút Thêm kho. Card: Quản lý / In QR.
**ManageLocationModal:** đổi tên, xóa, in QR, và 2 nút bật **scanMode**:
- "Quét QR cuộn nhựa để đưa cuộn vào kho này" (`action: add`)
- "…đưa cuộn ra khỏi kho này" (`action: remove`)

### 7.6. Tab Máy in
Nút: Thêm máy in / Kết nối cloud / Pair máy in. 4 chế độ hiển thị lưới (2×2, rộng, ×4, danh sách).

- Máy **không cloud** → card đơn giản.
- Máy **có cloud** → `CloudPrinterCard`: trạng thái realtime, nhiệt độ nozzle/bed (nhập số để set), progress, ảnh preview, đèn buồng in, quạt, Pause/Resume/Stop, **nút "sync-ams"** đẩy thông tin cuộn nhựa lên AMS, 4 khay AMS hiển thị màu.
- `PrinterDetailsModal`: xem `extendedInfo` chi tiết (layer, firmware, khối lượng in, thời gian...).
- Polling `/api/printers/cloud/status`: **5 giây khi đang ở tab Máy in, 5 phút khi ở tab khác**.

**CloudLoginModal**: chọn provider, nhập URL + token, hiện danh sách máy in cloud để map sang máy in local (hoặc tạo mới).
**PairPrinterModal**: chọn account đã lưu → discover → ghép thêm máy.

### 7.7. Tab Sản xuất (5 sub-tab)

**a) Tạo & Quản lý Đơn** (`orders-tab.tsx` — 1096 dòng)
- Form tạo đơn: tên khách, mã đơn, danh sách sản phẩm (tên, số lượng, giá) + danh sách miếng in (tên, count/bộ).
- Danh sách đơn dạng accordion: sản phẩm → grid các tem.
- **Click chọn nhiều tem** (multi-select), **chuột phải → context menu**: đổi trạng thái hàng loạt (Chờ in / Đang in / Xong), gán/tháo máy in, in tem hàng loạt.
- In: tem 1 miếng, tem cả sản phẩm, tem cả đơn, tem mã đơn hàng.
- Sửa đơn (modal), xóa đơn.

**b) Miếng In & Quét Mã Vạch** (`print-items-tab.tsx`)
Ô nhập/quét barcode → tự động chuyển trạng thái tiếp theo. Bảng: Mã | Tên | Sản phẩm (Khách) | Mâm PEI | Trạng thái.

**c) Quản lý Mâm In PEI** (`pei-management-tab.tsx`)
Cột trái: tạo mâm mới; chọn mâm đích; checkbox "miếng in chờ xếp" (`!peiSheetId && status==='pending'`) → gán hàng loạt.
Cột phải: card từng mâm, chip các miếng (✔ xong / ▶ đang in), select gán mâm lên máy in.

**d) Kiểm Hàng Đóng Gói** (`order-check-tab.tsx`)
Nhập/quét mã đơn → hiện đơn + **thanh tiến độ `checkedItems / totalItems`**. Quét tem → `PATCH isChecked: true`. Cảnh báo "tem không thuộc đơn này" / "đã kiểm rồi".

**e) Sản Xuất SLL** (`bulk-production-tab.tsx`) — **chế độ 2, cho đơn lớn**
Không dán tem từng con nữa, đơn vị là 1 lượt mâm PEI.
- Form tạo đơn: khách, mã đơn, tên SP, **tổng số con**, **số con/mâm PEI**, ghi chú, **chọn máy in** (bấm theo thứ tự, số badge = thứ tự nhận lượt). Preview trực tiếp "sẽ chia N lượt trên M máy — máy X: n lượt…" tính bằng `chiaLuotIn()` ngay trên client.
- Ô quẹt mã ở đầu tab (autofocus, nghe cả event `productionNumericScanned` từ máy quét HID): **quẹt lần 1 = bắt đầu in, lần 2 = in xong**.
- Lưới card đơn: progress bar `số con đã xong / tổng`, badge trạng thái, in toàn bộ tem, xóa đơn. Bấm card để xem chi tiết.
- Bảng chi tiết **nhóm theo máy** (thu gọn được): Mã lượt | PEI | Số con | Trạng thái | Bắt đầu in | In xong | Thời lượng | thao tác (in tem lượt, ghi nhận bắt đầu/xong thủ công, đặt lại về chờ in khi quẹt nhầm).
- In tem qua `POST /api/print-jobs/batch` — `line1` = mã lượt, `line2` = tên SP, `line3` = `<máy> PEI <n> - <số> con`.

### 7.8. Tab In QR (`print-qr-tab.tsx`)
Quét/nhập mã → `normalizeCode()` đoán loại (kho / máy in / slot / màu / cuộn) → preview payload 3 dòng → in qua `POST /api/print-jobs`. Có nút mở camera (`ScanBarcodeModal`).

### 7.9. Tab In Tem (`print-label-tab.tsx` — 952 dòng)
- Chọn **nguồn dữ liệu**: cuộn / kho / máy in / tự nhập.
- Chọn **template**: `qr-text`, `barcode-text`, `text-only`, `qr-large`.
- Chọn **font**: sm / md / lg. Chọn **số bản** 1-20.
- **Preview canvas 320×240 = đúng bản in** (pixel-perfect, hỗ trợ tiếng Việt đầy đủ dấu).
- In qua `POST /api/print-jobs/custom` (bitmap).

### 7.10. Tab Tạo job in (`create-job-tab.tsx`)
Chọn máy in → **tự nạp các cuộn đang gắn trên máy đó** (còn nhựa) → nhập gram dùng cho từng cuộn → nhập thời lượng (giờ + phút) → `POST /api/tasks3d`.
Bên dưới: `PrintHistories` — timeline lịch sử task (badge trạng thái, đếm ngược theo `estimatedEndTime`).

### 7.11. Tab Kiểm kho (`check-inventory-tab.tsx`)
- Lấy phiên active, map `scannedMap`.
- Quét cuộn → `POST /api/inventory/scan` → đánh dấu đã quét, thêm vào lịch sử quét.
- Bộ lọc: tìm kiếm, hiện mọi trạng thái, `all/scanned/unscanned`.
- Danh sách sắp xếp theo `filterAndSortSpoolsForInventory`.
- Hỗ trợ QR lệnh `CMD-INV-RESET`, `CMD-INV-TOGGLE-ALL`.
- Có nút sửa / xóa cuộn ngay trong danh sách.

### 7.12. Tab Hàng hóa cửa hàng (`store-management-tab.tsx` — 2611 dòng, lớn nhất)

**Header:** 4 stat card (Mặt hàng, Tổng tồn kho, Giá trị kho, **Sắp hết hàng — bấm để lọc**).

**Thanh công cụ:** ô quét mã (lắng nghe HID), nút Tìm mã, nút **Kiểm tra MISA**, Thêm hàng hóa, Cột riêng, [Chuyển N giá cũ → giá vốn], [Thu gọn/Hiện combo], Xuất JSON, Nhập JSON.

**Bảng danh sách:** Hàng hóa (thumbnail + tên + badge `Combo x2`) | Danh mục | Giá vốn | Giá bán | Giá sau KM | Tồn kho | 2 cột tùy biến đầu | Thao tác.
Combo con **thụt vào dưới sản phẩm mẹ**, có nút chevron thu gọn.
Lọc: từ khóa, danh mục, chỉ sắp hết. Sắp xếp: Mới cập nhật / Tên A→Z / Tồn ít nhất / Giá trị kho cao nhất.

**Panel chi tiết (4 tab):**
- `thongTin`: QR code (sinh client bằng `qrcode`), các trường, **nhập/xuất kho: nút Cộng / Trừ / Đặt lại số lượng**
- `anh`: gallery (lazy-load ảnh gốc), phóng to, đặt ảnh đại diện, xóa
- `tepIn`: danh sách file in, mở/tải, in được trên trình duyệt nếu PDF/ảnh
- `lichSu`: nhật ký kho (mọi thay đổi đều ghi lịch sử tiếng Việt)

**Modal:** Thêm/Sửa hàng hóa (kèm upload ảnh + file in), Quản lý cột riêng.

**Cơ chế dữ liệu đặc biệt:**
- Tải: `GET /api/store-products`; nếu server trống mà `localStorage` có dữ liệu bản cũ (`quan-ly-cua-hang-san-pham-v1`) → **tự migrate 1 lần** lên DB.
- Lưu: **debounce 800ms → PUT toàn bộ**.
- Ảnh: nén về cạnh dài tối đa **1400px** trước khi lưu. File in: tối đa **150MB**.
- Lazy-load ảnh/file: cache theo `Map<id, ...>` trong `useRef`; hàng hóa chưa lazy-load thì **xóa hẳn field khỏi payload** để server không hiểu nhầm là "xóa hết".

### 7.13. Tab Cài đặt (`misa-settings-tab.tsx`)
Form nhập credential MISA: Bearer token, Cookie (hỗ trợ **dán JSON cookie export từ extension** rồi tự ghép chuỗi), `x-deviceid`, `x-ms-bid`, `dbid`, `tid`, `tco`, `brid`. Nút "Kiểm tra token" + hiển thị `lastCheckedAt` / `lastCheckOk` / `lastCheckMessage`.

### 7.14. Modal cân (`update-weight-modal.tsx` — 879 dòng)

Đây là màn hình nghiệp vụ phức tạp nhất về UX:
- 2 chế độ: **`calculated`** (nhập tổng cân → tự trừ vỏ) và **`direct`** (nhập thẳng còn lại). Mặc định `calculated`.
- 3 ô: `total` / `remaining` / `empty`, chuyển ô bằng phím / QR lệnh `CMD-WEIGHT-TAB`.
- **Nút "lấy số từ cân"**: đọc `liveWeight` từ MQTT, `remaining = clamp(round(cân) − emptyWeight, 0, initial)`.
- **Phát âm thanh offline** (`/public/audio/`): đọc từng chữ số `0.mp3`..`9.mp3` (playbackRate 1.35) + các cụm `active`, `spool`, `done`, `tab_total`, `tab_remaining`, `tab_empty`. Có xử lý trình duyệt chặn autoplay (`isAudioBlocked`).
- Quét QR cuộn nhựa khác **ngay trong modal** → tự lưu cuộn hiện tại rồi chuyển sang cuộn mới (phát "Đổi cuộn") → **luồng cân liên tục nhiều cuộn không cần chạm màn hình**.
- Chỉnh vị trí (select kho / máy in), đổi hãng, xóa cuộn.

### 7.15. Modal quét camera (`scan-barcode-modal.tsx`)
2 chế độ: **camera** (dùng `qr-scanner-wechat` WASM, `getUserMedia` facingMode environment, hỗ trợ **đèn flash** nếu thiết bị cho phép) và **nhập tay**. Có chế độ `continuous` (quét liên tục nhiều mã).

### 7.16. Modal hiệu chuẩn cân (`scale-calibration-modal.tsx`)
Hiển thị `rawWeight`, cho nhập offset bù trừ. Offset lưu `localStorage['scale_offset']` và phát `CustomEvent('scaleOffsetChanged')` để đồng bộ mọi component.

---

## 8. TÍCH HỢP PHẦN CỨNG & BÊN THỨ BA

### 8.1. Trạm cân MQTT

| Thông số | Giá trị |
|----------|---------|
| Topic | `esp-can/sensor/c__n_n___ng/state` (ESPHome sinh, tên đã bị mã hóa) |
| Broker URL | `ws(s)://<host trang hiện tại>/mqtt` — proxy tới `127.0.0.1:9001` |
| Payload | Chuỗi số gram, VD `"1234.5"` |
| Reconnect | `reconnectPeriod: 3000` — **không được gọi `client.end()` khi lỗi** (sẽ tắt vĩnh viễn auto-reconnect) |
| Offset | `localStorage['scale_offset']`; `weight = rawWeight + offset` |
| Kiến trúc | `ScaleProvider` bọc toàn app trong `layout.tsx` → **duy nhất 1 kết nối**, component con dùng `useScale()` |

### 8.2. Máy in tem XPrinter (TSPL over USB)
- Đường dẫn: `/dev/usb/lp0` (override bằng `PRINTER_DEVICE_PATH`)
- Giao thức: TSPL text hoặc binary bitmap
- **Chỉ hoạt động trên máy chủ Linux có máy in cắm USB** — không thể chuyển sang iPhone.

### 8.3. Bambu Lab qua Home Assistant (`BambuLabProvider`)

- Xác thực: `Authorization: Bearer <Long-Lived Access Token>`
- Kiểm tra kết nối: `GET {url}/api/config`
- Discovery: `GET {url}/api/states` → lọc entity `sensor.*_print_status` → `id` = prefix entity
- Polling **5 giây**, chỉ poll các printer đã từng được `getStatus()` gọi (`activePrinters` Set)
- Map trạng thái: `RUNNING|PREPARE → printing`, `PAUSE|FAILED → error`, `OFFLINE|UNAVAILABLE|UNKNOWN → offline`, `FINISH|IDLE → idle`
- ⚠️ **Sensor "Remaining time" của HA trả SỐ GIỜ THẬP PHÂN**, không phải phút. `parseRemainingMinutes()` xử lý cả 2 dạng (`"2.883"` và `"2h 53m"`).
- AMS: đọc `sensor.<prefix>_ams_1_tray_1..4`, đẩy `null` cho khay trống để giữ đúng vị trí index.
- Điều khiển: gọi `POST {url}/api/services/<domain>/<action>` với `entity_id`.

### 8.4. Moonraker / Klipper (`MoonrakerProvider`)

- Không cần token. Kiểm tra `GET {url}/printer/info`
- Discovery: `GET {url}/machine/system_info` → hostname làm id; **1 máy in / 1 URL**
- Polling 5s: `GET /printer/objects/query?print_stats&extruder&heater_bed&display_status`
- Thời gian còn lại **ước lượng**: `(printDuration / progress) − printDuration`
- Thumbnail: `GET /server/files/metadata?filename=` → chọn thumbnail lớn nhất → `{url}/server/files/gcodes/<relative_path>`

### 8.5. `PrinterManager` (singleton)

- Giữ `Map<accountId, IPrinterProvider>`, lưu vào `globalThis` ở dev để không mất qua HMR.
- **Lazy init**: provider chỉ được tạo khi có request đầu tiên (`getProviderAsync`), có **mutex** (`initPromises`) chống race tạo trùng.
- Connect thất bại với "Not authorized" / code 5 → tự set `CloudAccount.isActive = false`.
- `disconnect()` set cờ `isStopped` để chặn `connect()` đang chạy dở khởi động polling mồ côi.

### 8.6. MISA eShop
Xem §5.15. Lưu ý: **token hết hạn theo phiên đăng nhập trên web MISA**, phải vào tab Cài đặt cập nhật thủ công. Chưa có luồng đồng bộ nhập kho thực tế — hiện chỉ có kiểm tra token.

---

## 9. CƠ CHẾ REALTIME & EVENT BUS NỘI BỘ

### 9.1. Realtime thật
- **Chỉ có MQTT WebSocket** (số cân).
- **Không có WebSocket/SSE cho dữ liệu app** — trạng thái máy in dựa vào **HTTP polling** (5s / 5 phút).

### 9.2. Event bus qua `window.CustomEvent`

| Event | Phát bởi | Nghe bởi | Payload |
|-------|----------|----------|---------|
| `appToast` | mọi component con | `page.tsx` | `{message, type: 'success'\|'error'\|'info'}` |
| `appConfirm` | component con | `page.tsx` | `{title, message, onConfirm}` |
| `productionNumericScanned` | `page.tsx` (quét toàn cục) | `print-items-tab` | `string` (mã số) |
| `openOrderCheck` | (mở tab kiểm hàng) | `production-tab`, `order-check-tab` | mã đơn |
| `printItemScannedForCheck` | quét tem khi kiểm hàng | `order-check-tab` | `{id}` |
| `printItemUpdated` | sau khi đổi trạng thái tem | `orders-tab` | — |
| `scaleOffsetChanged` | `useScaleMqtt.setOffset` | `useScaleMqtt` (các instance khác) | `number` |

> **Với Flutter đây phải thay bằng** một event bus / state management thật (Riverpod, Bloc, hoặc `StreamController`).

---

## 10. NHỮNG GÌ HỆ THỐNG CHƯA CÓ (GAPS)

Cần biết trước khi làm app — đây là những chỗ **phải bổ sung ở backend**:

| # | Thiếu | Ảnh hưởng tới app mobile |
|---|-------|--------------------------|
| 1 | **Không có xác thực/phân quyền** | App public trên internet sẽ lộ toàn bộ dữ liệu. **Bắt buộc thêm auth** (xem §11.7) |
| 2 | **Không có phân trang / filter server-side** | `GET /api/filaments` trả toàn bộ cuộn kèm quan hệ; `GET /api/print-items` trả toàn bộ tem của mọi đơn — có thể vài nghìn record. Trên 4G/iPhone rất chậm |
| 3 | **Không có endpoint danh sách Spool riêng** | Phải tải qua `/api/filaments` rồi flatten |
| 4 | **Không có endpoint cập nhật/kết thúc Task3D** | Không đánh dấu được "in xong", không hoàn nhựa |
| 5 | **Không có endpoint cập nhật `Order.status`** | Trường tồn tại nhưng luôn `pending` |
| 6 | **Không có push/WebSocket cho dữ liệu** | Phải polling từ app, tốn pin |
| 7 | **`PUT /api/store-products` là full-replace** | App mobile PUT toàn bộ danh sách sau mỗi thao tác = rất tốn băng thông và dễ mất dữ liệu khi 2 thiết bị cùng sửa |
| 8 | **Không có ETag / updatedAt-based sync** | Không làm offline-first được nếu không bổ sung |
| 9 | **Ảnh/file lưu base64 trong cột Json** | Nên chuyển sang object storage + URL trước khi làm app |
| 10 | **In tem phụ thuộc USB máy chủ** | iPhone không in trực tiếp được; phải gọi API server (server phải online) |
| 11 | **Súng quét HID = `keydown` toàn cục** | iPhone không có; phải dùng camera hoặc Bluetooth HID scanner |
| 12 | **`setFilament` (Bambu) chưa cài đặt** | `POST /api/printers/cloud/filament` luôn trả lỗi |
| 13 | **Không có rate limit / validation schema (zod)** | Body sai kiểu có thể gây 500 |

---

## 11. KẾ HOẠCH PORT SANG FLUTTER (iOS)

> **Đã triển khai.** Mã nguồn app nằm ở [`mobile/`](mobile/) (Flutter, iOS 13+ / Android 10+),
> hướng dẫn chạy ở [`mobile/README.md`](mobile/README.md). Phần dưới đây giữ nguyên làm
> căn cứ thiết kế và danh sách việc còn lại ở backend (§11.6).

### 11.1. Chiến lược tổng thể

**Khuyến nghị: giữ nguyên backend Next.js làm API server, Flutter chỉ là client.** Lý do:
- Máy in tem USB, PrinterManager (giữ kết nối HA/Moonraker), Prisma/Postgres đều **phải ở server**.
- Rút ngắn thời gian: không phải viết lại business logic (định giá, TSPL, diff đơn hàng).

**Phạm vi app v1 nên tập trung vào việc "cầm điện thoại đi lại trong xưởng"**, chứ không copy 1:1 giao diện desktop:

| Ưu tiên | Tính năng | Lý do |
|---------|-----------|-------|
| 🟢 P0 | Quét QR/barcode bằng camera → mở nhanh cuộn / kho / máy in / tem / hàng hóa | Đây chính là giá trị lớn nhất của mobile |
| 🟢 P0 | Cân cuộn nhựa (MQTT realtime + đọc số) | Đứng ngay cạnh cân |
| 🟢 P0 | Xem/sửa cuộn nhựa, gán/tháo kho & máy in | Nghiệp vụ đi lại nhiều nhất |
| 🟢 P0 | Kiểm kho (inventory session) | Bản chất là đi quét |
| 🟡 P1 | Xem trạng thái máy in cloud + điều khiển cơ bản | Xem từ xa |
| 🟡 P1 | Kiểm hàng đóng gói (order-check) | Quét tem lúc đóng gói |
| 🟡 P1 | Miếng in — quét đổi trạng thái | |
| 🟡 P1 | Hàng hóa cửa hàng: tra cứu + nhập/xuất kho nhanh | |
| 🟠 P2 | In tem (gọi API server in) | Chỉ là nút bấm |
| 🔴 P3 | Tạo/sửa đơn hàng phức tạp, quản lý mâm PEI, cài đặt MISA, xuất/nhập JSON | Giữ trên web, form quá phức tạp cho màn hình nhỏ |

### 11.2. Kiến trúc app đề xuất

```
lib/
├── main.dart
├── core/
│   ├── api/
│   │   ├── api_client.dart           # dio + interceptor (base URL, auth, log)
│   │   ├── api_result.dart           # sealed class Success/Failure ~ Result<T>
│   │   └── endpoints.dart            # hằng số đường dẫn
│   ├── config/app_config.dart        # base URL, MQTT URL — cho phép đổi trong Settings
│   ├── scan/
│   │   ├── code_normalizer.dart      # port normalizeCode() + nhận diện tiền tố
│   │   └── scan_router.dart          # port luồng quét toàn cục §4.3
│   └── theme/                        # dark-first, accent indigo #4f46e5
├── data/
│   ├── models/                       # freezed + json_serializable, 1 file / bảng
│   └── repositories/                 # filament_repo, printer_repo, order_repo, store_repo...
├── features/
│   ├── dashboard/ spools/ locations/ printers/ production/
│   ├── inventory/ scale/ store/ labels/
│   └── scanner/                      # màn hình quét dùng chung
└── shared/widgets/
```

**State management:** Riverpod 2 (`AsyncNotifier` cho từng list + `StreamProvider` cho MQTT).
**Routing:** go_router, hỗ trợ deep link `3dmanage://spool/PLA-WHT-01`.

### 11.3. Bảng ánh xạ package

| Chức năng web | Package Flutter đề xuất |
|---------------|------------------------|
| `fetch` + JSON | `dio` + `retrofit` (hoặc thủ công) |
| Model / immutable | `freezed` + `json_serializable` |
| State | `flutter_riverpod` |
| Routing | `go_router` |
| MQTT WebSocket | `mqtt_client` (dùng `MqttServerClient.withWebSocket` hoặc `MqttBrowserClient`) |
| Quét QR/barcode camera | `mobile_scanner` (ML Kit — nhanh hơn WASM, hỗ trợ Code128 + QR) |
| Sinh QR để hiển thị | `qr_flutter` |
| Đèn flash | có sẵn trong `mobile_scanner` |
| Phát âm thanh số (0-9.mp3) | `audioplayers` hoặc `just_audio` (bundle lại `public/audio/*` vào assets) |
| Lưu offset cân, base URL | `shared_preferences` |
| Cache ảnh | `cached_network_image` (sau khi backend chuyển ảnh sang URL) |
| Chọn ảnh/file hàng hóa | `image_picker` + `file_picker` |
| Nén ảnh (thay `CANH_ANH_TOI_DA=1400`) | `flutter_image_compress` |
| Số tiền VND | `intl` (`NumberFormat.currency(locale:'vi_VN', symbol:'₫')` — khớp `dinhDangTien`) |
| Rung phản hồi khi quét | `HapticFeedback` (built-in) |
| Đọc số bằng TTS (thay MP3) | `flutter_tts` (tùy chọn, tiếng Việt) |

### 11.4. Feasibility từng tính năng trên iPhone

| Tính năng web | Trên iPhone | Ghi chú triển khai |
|---------------|-------------|--------------------|
| Súng quét HID (`keydown`) | ❌ Không dùng được | Thay bằng **camera** (`mobile_scanner`). Nếu vẫn muốn dùng súng: chọn loại **Bluetooth HID**, iOS sẽ coi như bàn phím ngoài → dùng `RawKeyboardListener` + logic buffer 120ms giống web |
| Quét camera (`qr-scanner-wechat` WASM) | ✅ Tốt hơn | `mobile_scanner` dùng ML Kit native, nhanh & mượt hơn nhiều |
| MQTT trạm cân | ✅ Được | `mqtt_client` với WebSocket. **Lưu ý:** iOS đình chỉ socket khi app vào background → phải reconnect khi resume (`AppLifecycleState.resumed`) |
| Đọc số bằng MP3 | ✅ Được | Copy `public/audio/*.mp3` vào `assets/audio/`; `playbackRate 1.35` → `setPlaybackRate(1.35)` |
| In tem USB | ⚠️ Gián tiếp | iPhone **không** in trực tiếp. Gọi `POST /api/print-jobs*` → server in. **Server phải online cùng LAN/VPN.** |
| Render tem bitmap 320×240 | ✅ Được | Dùng `dart:ui` `PictureRecorder` + `Canvas` → `toByteData(ImageByteFormat.rawRgba)` → port `canvasToMonoBitmap()` sang Dart → base64 → `POST /print-jobs/custom` |
| Code 128 encoder | ✅ Port được | Port thẳng `encodeCode128B` + bảng `C128_PATTERNS` sang Dart (thuật toán thuần) |
| Điều khiển máy in cloud | ✅ Được | Chỉ là HTTP POST |
| Upload ảnh/file in cửa hàng | ⚠️ Cần đổi backend | base64 150MB qua HTTP trên 4G là không khả thi. Nên đổi sang multipart upload + object storage |
| Dark mode | ✅ | App hiện mặc định dark, không theo system |
| Xuất/nhập JSON | ⚠️ Hạn chế | `share_plus` để xuất; nhập thì dùng `file_picker`. Nên giữ tính năng này ở web |
| Sidebar 11 mục | ❌ Không phù hợp | Chuyển thành **BottomNavigationBar 4-5 tab** + menu "Thêm" |

### 11.5. Thiết kế lại điều hướng cho iPhone

```
BottomNavigationBar:
┌──────────┬──────────┬──────────────┬──────────┬──────────┐
│ Tổng quan│ Cuộn nhựa│  [QUÉT]  ⬤   │ Sản xuất │  Thêm    │
│  home    │ database │  nút tròn nổi│ shopping │  menu    │
└──────────┴──────────┴──────────────┴──────────┴──────────┘

"Thêm" (bottom sheet / trang list):
  • Kho lưu trữ    • Máy in       • Kiểm kho
  • Hàng hóa       • In tem       • Trạm cân
  • Cài đặt (base URL, MQTT, MISA)
```

**Nút QUÉT ở giữa** là trung tâm của app — mở camera toàn màn hình, sau khi quét route theo §4.3:

```dart
// scan_router.dart — pseudo
Future<void> handleScannedCode(String raw) async {
  final code = raw.trim();
  final normalized = code.replaceAll('-', '').toUpperCase();

  if (code.toUpperCase().startsWith('CMD-')) return handleCommand(code);

  final loc = locations.firstWhereOrNull((l) => l.id.norm == normalized);
  if (loc != null) return context.push('/locations/${loc.id}');

  // PRT-xx-L1..4
  final slot = RegExp(r'^(.*)L([1-4])$').firstMatch(normalized);
  if (slot != null) { /* bật scanMode gán slot AMS */ }

  final printer = printers.firstWhereOrNull((p) => p.id.norm == normalized);
  if (printer != null) return context.push('/printers/${printer.id}');

  final spool = spools.firstWhereOrNull((s) => s.id.norm == normalized);
  if (spool != null) return openWeighSheet(spool);

  if (RegExp(r'^\d{8}$').hasMatch(code)) return handlePrintItem(code);   // tem miếng in

  final product = storeProducts.firstWhereOrNull((p) => p.maQR == code || p.id == code);
  if (product != null) return context.push('/store/${product.id}');

  showNotFound(code);
}
```

**Màn hình cân (P0)** nên là bottom sheet toàn màn hình:
- số gram khổng lồ realtime từ MQTT
- nút "Lấy số từ cân" cực to
- nút Lưu, và **chế độ quét liên tục**: quét cuộn tiếp theo → tự lưu cuộn hiện tại (port logic §7.14)

### 11.6. Thay đổi backend cần làm trước/song song

Sắp theo mức độ bắt buộc:

**Bắt buộc (P0):**
1. **Xác thực API.** Đơn giản nhất: middleware Next.js kiểm tra header `X-API-Key` (so với env `API_KEY`), app lưu key trong Keychain (`flutter_secure_storage`). Nếu cần nhiều người dùng → JWT + bảng `User`.
2. **Endpoint danh sách cuộn nhựa riêng, có phân trang & filter:**
   `GET /api/spools?page&pageSize&q&status&locationId&printerId` → tránh tải toàn bộ `/api/filaments`.
3. **Phân trang cho `GET /api/print-items`** (`?orderId=&status=&page=`).

**Nên có (P1):**
4. `PATCH /api/tasks3d/[id]` — cập nhật `status` (completed/failed/cancelled) + set `Printer.status = 'idle'`.
5. `PATCH /api/orders/[id]/status`.
6. **API cửa hàng dạng CRUD từng bản ghi** thay cho full-replace:
   `POST /api/store-products` (tạo 1), `PATCH /api/store-products/[id]`, `DELETE /api/store-products/[id]`,
   `POST /api/store-products/[id]/inventory` (`{kieu:'cong'|'tru'|'dat', soLuong}`) — giữ nguyên logic ghi `lichSu` ở server.
   → Giữ `PUT` cũ cho web, thêm cái mới cho app.
7. **Upload ảnh/file dạng multipart** + lưu file ra ổ đĩa/S3, DB chỉ giữ URL.
8. **`?since=<ISO>` cho các endpoint list** để app sync tăng dần.

**Tùy chọn (P2):**
9. SSE/WebSocket đẩy trạng thái máy in (`/api/printers/stream`) thay polling.
10. Validation schema bằng `zod` cho toàn bộ body.
11. `GET /api/health` để app kiểm tra server trước khi thao tác.

### 11.7. Vấn đề kết nối mạng (rất quan trọng)

Server hiện **chỉ chạy trong LAN**, Postgres bind `127.0.0.1`, không có auth. App iPhone khi ra khỏi nhà sẽ mất kết nối. 3 phương án:

| Phương án | Ưu | Nhược |
|-----------|-----|-------|
| **Tailscale / WireGuard** (khuyến nghị) | Không phải mở port, mã hóa sẵn, giữ nguyên "không auth" tương đối an toàn | Phải cài app VPN trên iPhone, luôn bật |
| **Cloudflare Tunnel + Access** | Domain `3d.quocan.click` sẵn có, có auth ở tầng edge | MQTT WebSocket qua tunnel cần cấu hình thêm |
| **Mở port + reverse proxy + API key** | Đơn giản nhất | Rủi ro bảo mật cao nhất, **bắt buộc phải thêm auth trước** |

App phải cho phép **cấu hình base URL trong Settings** (LAN IP khi ở nhà / domain khi ra ngoài), và tốt nhất là tự thử lần lượt.

**MQTT qua internet:** `wss://3d.quocan.click/mqtt` (Next.js rewrite đã proxy sẵn) — cần đảm bảo reverse proxy hỗ trợ WebSocket upgrade.

### 11.8. Lộ trình đề xuất

| Sprint | Nội dung | Kết quả |
|--------|----------|---------|
| **0** | Backend: thêm API key auth, `GET /api/spools` có phân trang, `GET /api/health`. Dựng Tailscale. | Server sẵn sàng cho mobile |
| **1** | Flutter skeleton: config base URL, api_client, models (Spool/Filament/Location/Printer), Riverpod, go_router, bottom nav | App chạy được, xem danh sách cuộn nhựa |
| **2** | Màn quét (`mobile_scanner`) + `scan_router` + màn chi tiết cuộn / kho / máy in | Quét là mở đúng thứ |
| **3** | MQTT cân + màn hình cân (bottom sheet, audio đọc số, quét liên tục) | Thay được tablet ở trạm cân |
| **4** | Kiểm kho + gán/tháo kho & máy in bằng quét | Hoàn tất nhóm P0 |
| **5** | Máy in cloud: status + điều khiển; kiểm hàng đóng gói; miếng in đổi trạng thái | Nhóm P1 |
| **6** | Hàng hóa cửa hàng (tra cứu + nhập/xuất kho) — cần backend CRUD từng bản ghi | Nhóm P1 |
| **7** | In tem (gọi API), render bitmap trên Dart canvas | Nhóm P2 |
| **8** | Đánh bóng: offline cache, haptic, deep link, TestFlight | Phát hành |

### 11.9. Danh sách model Dart cần tạo (khớp API)

```
Filament, Spool, Location, Printer, CloudAccount(public), PrinterStatusData,
Task3D, Task3DSpoolUsage, InventorySession, InventoryItem,
Order, OrderProduct, PrintItem, PeiSheet, PrintJob, BulkOrder, BulkRun,
StoreProduct, TruongRieng, AnhSanPham, TepIn, LichSuKho,
MisaCredentialPublic, DashboardStats
```

**Bẫy khi parse JSON — lưu ý kỹ:**
- `StoreProduct.ngayTao` / `ngayCapNhat` là **String ISO**, không phải DateTime (cố ý). Các bảng khác dùng DateTime thật.
- `thongTinRieng`, `anh`, `tepIn`, `lichSu` là **Json nullable** → dùng `?? {}` / `?? []`.
- `PrinterStatusData.materials` là mảng **có phần tử `null`** (khay trống) — kiểu phải là `List<AmsTray?>`, độ dài luôn 4.
- `CloudAccount` trả về client **không có `token`** — đừng khai báo field bắt buộc.
- `Spool.emptySpoolWeightG` mặc định 220 (Float, không phải Int).
- API trả `status`/`message` là chuỗi **tiếng Việt** → hiển thị thẳng cho người dùng được.

---

## 12. PHỤ LỤC: BẢNG TRA NHANH

### 12.1. Toàn bộ endpoint (44 operations)

```
GET    /api/dashboard/stats

GET    /api/filaments
POST   /api/filaments
DELETE /api/filaments/[id]

POST   /api/spools
PUT    /api/spools/[id]
DELETE /api/spools/[id]
PUT    /api/spools/[id]/weight

GET    /api/locations
POST   /api/locations
PUT    /api/locations/[id]
DELETE /api/locations/[id]

GET    /api/printers
POST   /api/printers
PUT    /api/printers/[id]
DELETE /api/printers/[id]
POST   /api/printers/bambulab/login
POST   /api/printers/bambulab/link
POST   /api/printers/moonraker/login
POST   /api/printers/moonraker/link
GET    /api/printers/cloud/accounts
GET    /api/printers/cloud/discover?accountId=
GET    /api/printers/cloud/status[?printerId=]
POST   /api/printers/cloud/control
POST   /api/printers/cloud/filament
GET    /api/printers/status/[accountId]/[printerId]

GET    /api/tasks3d
POST   /api/tasks3d

GET    /api/inventory/session
DELETE /api/inventory/session
POST   /api/inventory/scan

GET    /api/orders
POST   /api/orders
GET    /api/orders/[id]          # id hoặc orderCode
PUT    /api/orders/[id]
DELETE /api/orders/[id]

GET    /api/print-items
GET    /api/print-items/[id]
PATCH  /api/print-items/[id]
DELETE /api/print-items/[id]
PATCH  /api/print-items/batch

GET    /api/pei-sheets
POST   /api/pei-sheets
PATCH  /api/pei-sheets/[id]
DELETE /api/pei-sheets/[id]

GET    /api/bulk-orders
POST   /api/bulk-orders
GET    /api/bulk-orders/[id]
PATCH  /api/bulk-orders/[id]
DELETE /api/bulk-orders/[id]
POST   /api/bulk-runs/scan
PATCH  /api/bulk-runs/[id]

GET    /api/print-jobs[?status=]
POST   /api/print-jobs
PUT    /api/print-jobs/[id]
POST   /api/print-jobs/batch
POST   /api/print-jobs/custom

GET    /api/store-products
PUT    /api/store-products
GET    /api/store-products/[id]/anh
GET    /api/store-products/[id]/tep-in

GET    /api/misa/credential
PUT    /api/misa/credential
POST   /api/misa/check-token
```

### 12.2. Tất cả enum trạng thái

| Bảng | Trường | Giá trị |
|------|--------|---------|
| Spool | `status` | `active`, `depleted`, `archived` |
| Printer | `status` | `idle`, `printing`, `maintenance` |
| PrinterStatusData | `status` | `idle`, `printing`, `offline`, `maintenance`, `error` |
| Task3D | `status` | `printing`, `completed`, `failed`, `cancelled` |
| Order | `status` | `pending`, `printing`, `completed` |
| PrintItem | `status` | `pending`, `printing`, `completed` (+ `pre` chỉ xuất hiện trong logic quét) |
| PrintJob | `status` | `pending`, `completed`, `failed` |
| BulkOrder | `status` | `pending`, `printing`, `completed` (tự suy từ các `BulkRun`) |
| BulkRun | `status` | `pending`, `printing`, `completed` |
| CloudAccount | `provider` | `bambulab`, `moonraker` |

### 12.3. Hằng số nghiệp vụ

| Hằng số | Giá trị | Nơi dùng |
|---------|---------|----------|
| Khối lượng vỏ cuộn mặc định | 220 g | `Spool.emptySpoolWeightG` |
| Ngưỡng "sắp hết" dashboard | remaining/initial < 20% | `getDashboardStats` |
| Màu cảnh báo bảng cuộn | ≤150g đỏ, ≤330g vàng | `SpoolsView` |
| Kích thước tem | 40×30 mm = 320×240 dots @203DPI | TSPL |
| Bitmap tem | 9600 bytes (40 bytes × 240 dòng) | `/api/print-jobs/custom` |
| Số bản in tối đa | 20 | `copies` clamp |
| Barcode miếng in | 8 chữ số, `10000000..99999999` | `generateUniqueBarcode` |
| Phí sàn cố định | 3.000 đ | định giá |
| Phí sàn % | 30% | định giá |
| Tỷ lệ KM sàn | 25% | định giá |
| % lợi nhuận mặc định | 40% | `TY_LE_LOI_NHUAN_MAC_DINH` |
| Giá bán lẻ | giaVon × (1 + %lợi nhuận) | định giá |
| Hệ số giá vốn combo | {1: 1.5, 2: 2, 5: 4} | combo |
| Cạnh ảnh tối đa | 1400 px | nén ảnh cửa hàng |
| Thumbnail | 96×96, JPEG q55 | `taoAnhDaiDien` (sharp) |
| Dung lượng file in tối đa | 150 MB | `DUNG_LUONG_TEP_IN_TOI_DA` |
| Debounce đồng bộ cửa hàng | 800 ms | `store-management-tab` |
| Timeout transaction cửa hàng | 60 s (maxWait 10 s) | `PUT /api/store-products` |
| Polling máy in cloud | 5 s (tab máy in) / 300 s (tab khác) | `page.tsx` |
| Polling provider | 5 s | Bambu & Moonraker |
| Khoảng phím súng quét | 120 ms | buffer scanner |
| Độ dài mã tối thiểu | 3 ký tự | buffer scanner |
| MQTT reconnect | 3000 ms | `useScaleMqtt` |
| Tốc độ phát audio số | 1.35× | modal cân |

### 12.4. File nguồn quan trọng cần đọc khi port

| Việc cần làm | Đọc file |
|--------------|----------|
| Luồng quét toàn cục | `src/app/page.tsx:405-533` |
| Logic cân + audio + quét liên tục | `src/components/Filament/update-weight-modal.tsx` |
| Định giá & combo | `src/utils/dinh-gia-hang-hoa.ts` |
| Sinh lệnh TSPL | `src/utils/tspl-printer.ts` |
| Render bitmap tem + Code128 | `src/components/Filament/print-label-tab.tsx:98-255` |
| Chuẩn hóa mã quét | `src/components/Filament/print-qr-tab.tsx:66-95` |
| Lọc/sắp xếp kiểm kho | `src/utils/inventory-helpers.ts` |
| Diff đơn hàng khi sửa | `src/app/api/orders/[id]/route.ts:493-654` |
| Đồng bộ cửa hàng | `src/app/api/store-products/route.ts` + `store-management-tab.tsx:476-556` |
| Tích hợp máy in | `src/services/printer-integration/` |
| MQTT cân | `src/hooks/useScaleMqtt.ts` + `src/config/scale.ts` |

---

*Tài liệu này mô tả trạng thái codebase tại thời điểm 2026-08-11. Khi backend thay đổi (đặc biệt là thêm auth/phân trang theo §11.6), cần cập nhật lại §5 và §10.*
