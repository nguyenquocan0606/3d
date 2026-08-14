# KẾ HOẠCH SỬA CHỮA CODEBASE — 3D Manage

> **TRẠNG THÁI (2026-07-26): ĐÃ THI CÔNG XONG các đợt 1–8.**
> Đã bỏ qua các mục tùy chọn theo kế hoạch: 2.9, 2.10, 3.6, 7.4, 7.5 (một phần).
> Còn lại làm dần: ~178 lỗi lint `no-explicit-any`, 22 `set-state-in-effect`, 2 `no-img-element`.
> Lưu ý khác với kế hoạch: CVE postcss/sharp vá bằng `overrides` trong package.json
> (next 16.2.12 chưa tự vá); mosquitto đã chạy sẵn bằng systemd nên chỉ ghi chú trong compose.

> Bối cảnh: Web dùng **cá nhân** (self-host, truy cập qua LAN + domain riêng).
> → Bảo mật hạ xuống mức "tối thiểu hợp lý", ưu tiên: **build được → dữ liệu không hỏng → tính năng chạy đúng → hiệu năng → dọn dẹp**.
>
> Trạng thái hiện tại: `next build` FAIL, test 25/25 pass, ESLint 217 error / 81 warning.

---

## GIAI ĐOẠN 1 — Sửa build & dọn rác (bắt buộc làm đầu tiên, ~30 phút)

Mục tiêu: `npx next build` chạy xanh. Không sửa được gì khác nếu chưa xong phần này.

### 1.1. Sửa `tsconfig.json` — loại trừ thư mục rác khỏi typecheck
- **File:** `tsconfig.json` (dòng 25–33, khối `include`/`exclude`)
- **Vấn đề:** `include: ["**/*.ts", "**/*.tsx"]` kéo cả `tmp-repo/` (repo Home Assistant của bên thứ 3, ~200 lỗi type) và các file `test_*.ts` ở root vào typecheck → build fail.
- **Cách sửa:**
  ```json
  "exclude": ["node_modules", "tmp-repo", "test_*.ts", "test-api.ts", "extract.js", "query_ha.js"]
  ```
  (hoặc gọn hơn: chuyển `include` thành chỉ `src/**/*`, `next-env.d.ts`, `.next/types/**/*.ts`)

### 1.2. Xóa file rác ở root
- **Files cần xóa:**
  - `test-api.ts`, `test_ace.ts`, `test_rest.ts` — import module Anycubic đã bị xóa (`AnycubicRestClient` không tồn tại) → chính là nguyên nhân build fail
  - `test_fetch.js`, `test_printers.mjs`, `test_tspl.js`, `test_tspl.ts` — script thử nghiệm cũ
  - `extract.js`, `query_ha.js` — script một lần
  - `kx-bridge-log_20260710-184638.txt` (116KB log)
  - `scripts/api.json` (2.7MB dump API)
  - `tsconfig.tsbuildinfo` (file build cache, đã có trong .gitignore)
  - Thư mục `tmp-repo/` (toàn bộ — là repo anycubic_cloud clone về tham khảo, không dùng nữa)
- **Lưu ý:** nếu muốn giữ script nào để tham khảo → chuyển vào thư mục `docs/` hoặc `_archive/` và thêm vào `exclude` của tsconfig.

### 1.3. Sửa lỗi type trong test
- **File:** `src/services/tests/filament.service.test.ts` (dòng 117, 149, 201, 251, 284, 318, 319, 355, 385)
- **Vấn đề:** mock object của Spool thiếu field `printerSlot` (đã thêm vào schema sau khi viết test) → 9 lỗi TS2345.
- **Cách sửa:** thêm `printerSlot: null` vào các mock spool object (hoặc tạo 1 helper `mockSpool(overrides)` dùng chung).

### ✅ Kiểm tra hoàn thành GĐ1:
```bash
npx tsc --noEmit && npx next build && npm test
```

---

## GIAI ĐOẠN 2 — Toàn vẹn dữ liệu & Database (~2-3 giờ)

Mục tiêu: dữ liệu không tự hỏng, có thể dựng lại DB trên máy mới.

### 2.1. Tạo lại migration baseline khớp schema ⭐ QUAN TRỌNG
- **File:** `prisma/migrations/` (toàn bộ)
- **Vấn đề:** migration init chỉ tạo **2/14 bảng** (Filament, Spool — Spool còn thiếu cột `locationId/printerId/printerSlot`). DB thật được tạo bằng `db push`. Nếu máy hỏng / cần dựng lại → `prisma migrate deploy` cho ra DB sai hoàn toàn.
- **Cách sửa (baseline lại, KHÔNG mất dữ liệu):**
  1. Backup DB trước: `docker exec 3d_manage_postgres pg_dump -U postgres filament_db > backup_$(date +%F).sql`
  2. Xóa 2 thư mục migration cũ trong `prisma/migrations/`
  3. Sinh baseline mới từ schema hiện tại:
     ```bash
     mkdir -p prisma/migrations/0_init
     npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/0_init/migration.sql
     npx prisma migrate resolve --applied 0_init
     ```
  4. Kiểm tra: `npx prisma migrate status` phải báo "Database schema is up to date"

### 2.2. Thêm index cho khóa ngoại ⭐ QUAN TRỌNG
- **File:** `prisma/schema.prisma`
- **Vấn đề:** DB thật (đã query xác nhận) **không có index nào** ngoài PK/unique. Prisma trên PostgreSQL không tự tạo index FK → mọi join/filter đều seq-scan.
- **Cách sửa:** thêm `@@index` vào các model:
  ```prisma
  model Spool {
    ...
    @@index([filamentId])
    @@index([locationId])
    @@index([printerId])
    @@index([status])          // dashboard lọc theo status thường xuyên
  }
  model Task3D           { ... @@index([printerId]) @@index([status]) }
  model Task3DSpoolUsage { ... @@index([taskId]) @@index([spoolId]) }
  model InventoryItem    { ... @@index([sessionId]) }
  model PeiSheet         { ... @@index([printerId]) }
  model OrderProduct     { ... @@index([orderId]) }
  model PrintItem        { ... @@index([productId]) @@index([peiSheetId]) @@index([printerId]) @@index([status]) }
  model Printer          { ... @@index([cloudAccountId]) }
  ```
  Rồi: `npx prisma migrate dev --name add_fk_indexes`

### 2.3. Thêm quan hệ FK cho `InventoryItem.spoolId`
- **File:** `prisma/schema.prisma` (model InventoryItem, dòng ~118-126)
- **Vấn đề:** `spoolId` là String trần, không có FK → xóa cuộn nhựa để lại bản ghi kiểm kho mồ côi, tab kiểm kho hiện "Đang tải thông tin cuộn..." mãi mãi.
- **Cách sửa:**
  ```prisma
  model InventoryItem {
    ...
    spoolId   String
    spool     Spool  @relation(fields: [spoolId], references: [id], onDelete: Cascade)
  }
  ```
  + thêm `inventoryItems InventoryItem[]` vào model Spool.
- **Lưu ý:** trước khi migrate phải dọn bản ghi mồ côi hiện có:
  ```sql
  DELETE FROM "InventoryItem" WHERE "spoolId" NOT IN (SELECT id FROM "Spool");
  ```

### 2.4. Gom PrismaClient về 1 singleton duy nhất
- **Files có `new PrismaClient()` riêng (8 chỗ, sửa thành `import prisma from '@/utils/db'`):**
  - `src/app/api/orders/route.ts` (dòng 4)
  - `src/app/api/orders/[id]/route.ts` (dòng 4)
  - `src/app/api/pei-sheets/route.ts` (dòng 4)
  - `src/app/api/pei-sheets/[id]/route.ts` (dòng 4)
  - `src/app/api/print-items/route.ts` (dòng 4)
  - `src/app/api/print-items/[id]/route.ts` (dòng 4)
  - `src/app/api/print-items/batch/route.ts` (dòng 4)
  - `src/instrumentation.ts` (dòng 9 — xem thêm mục 6.4, file này nên xóa logic luôn)
- **Vấn đề:** mỗi file mở 1 connection pool riêng → cạn connection Postgres khi chạy lâu.

### 2.5. Bọc transaction cho `PUT /api/orders/[id]` ⭐ QUAN TRỌNG
- **File:** `src/app/api/orders/[id]/route.ts` (hàm PUT, dòng 44-211)
- **Vấn đề:** hàm update đơn hàng chạy ~10 lệnh ghi DB tuần tự **không có transaction**, và ở dòng 193 có `throw new Error(...)` giữa chừng (khi sản phẩm có tem đã in không xóa được) → đơn hàng bị sửa nửa vời, không rollback.
- **Cách sửa:** bọc toàn bộ logic từ "Cập nhật tên khách hàng" đến "Tạo PrintItem mới" trong `prisma.$transaction(async (tx) => {...})`, đổi mọi `prisma.` bên trong thành `tx.`. Kiểm tra "sản phẩm có tem đã in" **trước khi** bắt đầu ghi để trả lỗi 400 sạch sẽ thay vì throw giữa chừng.

### 2.6. Sửa `generateUniqueBarcode` trùng mã trong cùng 1 batch
- **Files:** `src/app/api/orders/route.ts` (dòng 7-17), `src/app/api/orders/[id]/route.ts` (dòng 7-17)
- **Vấn đề:** hàm chỉ check trùng với DB, không check với các mã vừa sinh trong cùng request (chưa insert) → đơn nhiều tem có xác suất trùng → `createMany` fail cả lô.
- **Cách sửa:** truyền thêm 1 `Set<string>` các mã đã cấp trong request:
  ```ts
  async function generateUniqueBarcode(taken: Set<string>) {
    while (true) {
      const id = Math.floor(10000000 + Math.random() * 90000000).toString();
      if (taken.has(id)) continue;
      const exists = await prisma.printItem.findUnique({ where: { id } });
      if (!exists) { taken.add(id); return id; }
    }
  }
  ```
  Tiện thể: tách hàm này ra file chung `src/utils/barcode.ts` (đang bị copy-paste 2 nơi).

### 2.7. Sửa `updateSpoolWeight` tự "hồi sinh" cuộn archived
- **File:** `src/services/filament.service.ts` (dòng 250)
- **Vấn đề:** `status: remainingWeightG === 0 ? 'depleted' : 'active'` → cuộn đang `archived` cập nhật cân là bật lại `active`.
- **Cách sửa:** `status: remainingWeightG === 0 ? 'depleted' : (spool.status === 'depleted' ? 'active' : spool.status)` — chỉ đổi trạng thái khi hết nhựa, hoặc khi cuộn từng depleted mà giờ có nhựa lại.

### 2.8. Sửa HTTP 550 (typo)
- **File:** `src/app/api/spools/[id]/route.ts` (dòng 36)
- **Cách sửa:** `{ status: 550 }` → `{ status: 500 }`.

### 2.9. Chống tạo trùng loại nhựa khi brand = NULL
- **File:** `src/services/filament.service.ts` (`createFilament` dòng 52, `createSpoolUnified` dòng 164, `updateSpool` dòng 307)
- **Vấn đề:** unique index `(type, colorName, brand)` của Postgres không chặn được nhiều bản ghi cùng type+color khi `brand IS NULL` → race giữa check-rồi-create tạo bản trùng.
- **Cách sửa (mức đủ dùng cá nhân):** giữ nguyên logic check hiện tại nhưng chuẩn hóa brand rỗng thành chuỗi `''` thay vì `null` **HOẶC** (tốt hơn, cần Prisma hỗ trợ) đổi migration tạo unique index có `NULLS NOT DISTINCT`:
  ```sql
  ALTER TABLE "Filament" DROP CONSTRAINT ...;
  CREATE UNIQUE INDEX "Filament_type_colorName_brand_key"
    ON "Filament" (type, "colorName", brand) NULLS NOT DISTINCT;
  ```
  (dùng migration SQL thủ công vì Prisma 5 chưa có cú pháp này). Chọn 1 trong 2, đơn giản nhất là quy ước `brand` luôn là string, rỗng = `''`.

### 2.10. `getActiveSession` chống tạo 2 phiên song song
- **File:** `src/services/inventory.service.ts` (dòng 14-39)
- **Vấn đề:** findFirst-rồi-create không atomic → 2 thiết bị cùng mở tab kiểm kho lúc DB trống có thể tạo 2 phiên active.
- **Cách sửa (đủ dùng):** bọc trong `prisma.$transaction`, hoặc đơn giản là sau khi create thì `updateMany` deactivate các phiên active khác có `createdAt` cũ hơn. Mức cá nhân: chấp nhận rủi ro thấp, chỉ cần khi `resetSession` deactivate ALL trước khi create (đã đúng) — có thể để đây là việc "nice to have".

### ✅ Kiểm tra hoàn thành GĐ2:
```bash
npx prisma migrate status   # up to date
npm test                    # 25/25 pass
# Test tay: sửa đơn hàng có tem đã in → không được để đơn hỏng nửa vời
```

---

## GIAI ĐOẠN 3 — Sửa bug tích hợp máy in & cân (~2 giờ)

### 3.1. `sendCommandAsync` / `setFilamentAsync` không lazy-load provider ⭐
- **File:** `src/services/printer-integration/PrinterManager.ts` (dòng 110-111 và 133-134)
- **Vấn đề:** 2 hàm này dùng `this.providers.get(accountId)` — sau khi server restart, Map trống → lệnh điều khiển (pause/stop/đèn/nhiệt độ/sync AMS) **luôn fail** cho đến khi có ai đó gọi status trước. Chỉ `getStatusAsync` có lazy-load qua `getProviderAsync`.
- **Cách sửa:** đổi cả 2 chỗ thành:
  ```ts
  const provider = await this.getProviderAsync(accountId);
  ```

### 3.2. `printerManagerGlobal` ghi mà không đọc → mất provider mỗi lần HMR
- **File:** `src/services/printer-integration/PrinterManager.ts` (dòng 154-164)
- **Vấn đề:** biến global chỉ được gán, không bao giờ được đọc lại → dev mode mỗi lần hot-reload tạo PrinterManager mới, mất hết provider + để rơi các `setInterval` polling cũ chạy mồ côi (leak).
- **Cách sửa:** làm giống `src/utils/db.ts`:
  ```ts
  export const printerManager = globalThis.printerManagerGlobal ?? createPrinterManager();
  if (process.env.NODE_ENV !== 'production') globalThis.printerManagerGlobal = printerManager;
  ```

### 3.3. MQTT không tự reconnect khi lỗi
- **File:** `src/hooks/useScaleMqtt.ts` (dòng 66-69)
- **Vấn đề:** handler `error` gọi `client.end()` → chết vĩnh viễn, trạm cân treo "Mất kết nối" cho tới khi F5. (mqtt.js mặc định tự reconnect nếu KHÔNG gọi `end()`.)
- **Cách sửa:** bỏ `client.end()` trong handler error, chỉ log + `setIsConnected(false)`. Có thể thêm option `mqtt.connect(brokerUrl, { reconnectPeriod: 3000 })` cho rõ ràng.

### 3.4. Hai kết nối MQTT song song khi mở modal cân
- **Files:** `src/app/page.tsx` (dòng ~123) + `src/components/Filament/update-weight-modal.tsx` (dòng ~40) + `src/app/scale/page.tsx` + `src/components/Filament/scale-calibration-modal.tsx`
- **Vấn đề:** mỗi component gọi `useScaleMqtt` tự mở 1 connection riêng tới broker → mở modal là có 2-3 kết nối trùng.
- **Cách sửa (gọn):** tạo React Context `ScaleProvider` ở `layout.tsx`/`page.tsx` giữ 1 connection duy nhất, các component con dùng `useScaleContext()`. Topic + broker URL cũng đang hardcode lặp 4 chỗ (`esp-can/sensor/c__n_n___ng/state`) → đưa vào 1 file `src/config/scale.ts`.

### 3.5. Dọn `MoonrakerProvider` đang nửa sống nửa chết
- **File:** `src/services/printer-integration/PrinterManager.ts` (dòng 78-83)
- **Vấn đề:** Moonraker bị comment "temporarily disabled" trong `getProviderAsync` nhưng route `POST /api/printers/moonraker/login` vẫn tạo + register provider bình thường → hành vi khó đoán (login được nhưng restart server là mất).
- **Cách sửa:** chọn 1 trong 2 — (a) bật lại lazy-load Moonraker trong `getProviderAsync` (bỏ comment, 3 dòng), hoặc (b) tắt hẳn route login/link. Khuyến nghị (a) vì code provider vẫn hoạt động.

### 3.6. Sửa polling thông minh hơn cho BambuLab (hạ tải Home Assistant)
- **File:** `src/services/printer-integration/providers/bambulab/BambuLabProvider.ts` (dòng 204-238)
- **Vấn đề:** fetch **toàn bộ** `/api/states` của HA (hàng nghìn entity) mỗi 5 giây, kể cả khi không ai xem tab máy in.
- **Cách sửa (mức đủ dùng):**
  - Tăng interval lên 10-15s, hoặc
  - Chỉ poll khi có request status trong vòng 2 phút gần nhất (lưu `lastRequestedAt`, trong `pollStatus` nếu quá 2 phút không ai hỏi thì skip). UI đang tự poll 5s khi mở tab printers nên cách này khớp tự nhiên.

### ✅ Kiểm tra hoàn thành GĐ3:
- Restart server → bấm nút đèn/pause trên CloudPrinterCard phải chạy ngay lần đầu.
- Tắt broker MQTT rồi bật lại → widget cân tự xanh lại không cần F5.

---

## GIAI ĐOẠN 4 — In tem TSPL (~1 giờ)

### 4.1. Escape nội dung TSPL (chống hỏng lệnh in)
- **File:** `src/utils/tspl-printer.ts` (dòng 117-125, 212-223, 250-258)
- **Vấn đề:** `line1/2/3`, `qrCode`, `barcode` nhúng thẳng vào chuỗi lệnh trong dấu `"..."`. Tên sản phẩm chứa `"` làm hỏng lệnh; chứa xuống dòng thì chèn được lệnh TSPL lạ. (Mức cá nhân: chủ yếu là bug làm in sai, không phải lỗ hổng.)
- **Cách sửa:** thêm hàm sanitize dùng chung, gọi trong cả 3 hàm build:
  ```ts
  function sanitizeTSPL(s: string): string {
    return s.replace(/"/g, "'").replace(/[\r\n]/g, ' ');
  }
  ```
  Áp vào ngay sau `removeDiacritics(...)`.

### 4.2. Ghi máy in không chặn event loop
- **File:** `src/utils/tspl-printer.ts` (dòng 141-143) + 2 nơi gọi: `src/app/api/print-jobs/route.ts` (dòng 81), `src/app/api/print-jobs/batch/route.ts` (dòng 46)
- **Vấn đề:** `fs.writeFileSync('/dev/usb/lp0', ...)` block toàn bộ server trong lúc máy in nhận dữ liệu (in batch nhiều tem là treo mọi request khác).
- **Cách sửa:** đổi sang `fs.promises.writeFile`, hàm thành `async sendToPrinter(...)`, cập nhật 2 call-site thêm `await`. Cập nhật luôn test `src/utils/tests/tspl-printer.test.ts` nếu có mock hàm này.

### 4.3. Ghi DB batch bằng `createMany`
- **File:** `src/app/api/print-jobs/batch/route.ts` (dòng 53-58)
- **Vấn đề:** vòng lặp `await prisma.printJob.create` từng bản ghi.
- **Cách sửa:** `await prisma.printJob.createMany({ data: dbJobsToCreate })`.

---

## GIAI ĐOẠN 5 — Bảo mật mức "cá nhân đủ dùng" (~1 giờ)

> Theo yêu cầu: không đặt nặng. Nhưng có 2 việc rẻ mà đáng làm vì web đang expose ra internet (`3d.quocan.click`):

### 5.1. Ngừng trả token Home Assistant về client ⭐ (5 phút, nên làm)
- **File:** `src/services/printer.service.ts` (dòng 31)
- **Vấn đề:** `include: { cloudAccount: true }` → `GET /api/printers` trả nguyên `token` (Long-Lived Access Token HA — ai có nó là điều khiển được cả nhà). UI chỉ cần biết "có cloud hay không".
- **Cách sửa:**
  ```ts
  cloudAccount: { select: { id: true, provider: true, email: true, isActive: true } }
  ```
- Kiểm tra thêm: `grep -rn "cloudAccount" src/components src/app/page.tsx` để chắc UI không đọc field `token` (hiện không đọc).

### 5.2. Chặn truy cập lạ ở tầng hạ tầng (không cần code)
- **Không sửa code.** Lựa chọn 1 trong 2, ghi vào README:
  - (a) Bỏ expose domain public, chỉ dùng LAN/VPN (Tailscale/WireGuard) — khuyến nghị, và/hoặc
  - (b) Bật Basic Auth / Access rule ở reverse proxy (Cloudflare Access, nginx `auth_basic`) trước khi tới Next.js.
- Nếu muốn có lớp trong app: 1 file `src/middleware.ts` ~15 dòng check cookie/secret đơn giản là đủ (tùy chọn, không bắt buộc).

### 5.3. docker-compose: đừng mở Postgres ra ngoài
- **File:** `docker-compose.yml` (dòng ports)
- **Cách sửa:** `ports: - "127.0.0.1:5432:5432"` (thêm bind localhost). Password giữ nguyên cũng được (mức cá nhân) nhưng không để port public.

---

## GIAI ĐOẠN 6 — Hiệu năng & kiến trúc (~3-4 giờ)

### 6.1. Tab "Hàng hóa cửa hàng": thoát khỏi localStorage ⭐ (việc lớn nhất giai đoạn này)
- **File:** `src/components/Store/store-management-tab.tsx` (1073 dòng, dòng 175-206 phần storage)
- **Vấn đề:**
  1. Toàn bộ sản phẩm + **ảnh base64** lưu localStorage → giới hạn ~5MB, vài tấm ảnh là `setItem` throw `QuotaExceededError` **không được bắt** → mất thao tác đang làm.
  2. Không sync giữa các thiết bị (mâu thuẫn với mọi tab khác đều dùng DB).
  3. Mất trắng khi clear browser data.
- **Cách sửa (đề xuất theo mức độ):**
  - **Bước tối thiểu (30 phút):** bọc try/catch quanh 2 chỗ `setItem` (dòng 196, 201) + toast báo "Hết dung lượng, hãy xóa bớt ảnh". Chuyển ảnh sang nén trước khi lưu (canvas resize về ≤800px, JPEG 0.7).
  - **Bước đúng đắn (2-3 giờ):** thêm model Prisma:
    ```prisma
    model StoreProduct {
      id        String   @id
      ten       String
      maQR      String   @unique
      danhMuc   String?
      gia       Float    @default(0)
      soLuong   Int      @default(0)
      thuocTinh Json?    // các trường tùy biến
      lichSu    Json?    // lịch sử kho
      createdAt DateTime @default(now())
      updatedAt DateTime @updatedAt
      images    StoreProductImage[]
    }
    model StoreProductImage {
      id        String @id @default(uuid())
      productId String
      product   StoreProduct @relation(fields: [productId], references: [id], onDelete: Cascade)
      data      Bytes        // hoặc lưu file ra public/uploads + giữ path
      mimeType  String
    }
    ```
    - Thêm route: `src/app/api/store-products/route.ts` (GET/POST) + `src/app/api/store-products/[id]/route.ts` (PUT/DELETE)
    - Trong tab: thay các cặp `localStorage.getItem/setItem` bằng fetch; giữ nút Xuất/Nhập JSON hiện có làm công cụ migrate dữ liệu cũ (đã có sẵn chức năng export).

### 6.2. Giảm polling tab kiểm kho
- **File:** `src/components/Filament/check-inventory-tab.tsx` (dòng 95-106)
- **Vấn đề:** poll `/api/inventory/session` mỗi 2.5s; interval nằm trong effect phụ thuộc `allSpools` → mỗi lần cha refetch là clear/tạo lại interval.
- **Cách sửa:** tách interval ra effect `[]` riêng (dùng ref để đọc `allSpools` mới nhất), tăng chu kỳ lên 5s. Chỉ poll khi tab đang hiển thị (`document.visibilityState === 'visible'`).

### 6.3. `/api/printers/cloud/status` gọi tuần tự
- **File:** `src/app/api/printers/cloud/status/route.ts` (dòng 29-35)
- **Vấn đề:** `for...await` từng máy in.
- **Cách sửa:** `await Promise.all(linkedPrinters.map(...))`.

### 6.4. Xóa dead code `instrumentation.ts`
- **File:** `src/instrumentation.ts`
- **Vấn đề:** mở PrismaClient riêng, query accounts, log ra rồi... không làm gì (auto-connect đã bị gỡ). Tốn 1 connection + chậm boot.
- **Cách sửa:** rút gọn `register()` thành no-op (hoặc chỉ giữ `console.log` phiên bản), xóa import Prisma/Provider.

### 6.5. Thống nhất format response API
- **Vấn đề:** 3 kiểu đang trộn lẫn: `{status:'success', data}` / `{success:true, data}` / trả mảng trần (`src/app/api/tasks3d/route.ts` dòng 22 trả `NextResponse.json(tasks)` trần).
- **Cách sửa (đủ dùng, không cần refactor lớn):**
  1. Tạo helper `src/utils/api-response.ts`: `ok(data, message?)` và `fail(message, status=500)`.
  2. Ưu tiên sửa ngay 2 chỗ lệch nhất: `tasks3d/route.ts` (mảng trần) và nhóm `printers/cloud/*` + `printers/*/login|link` (`success:true`) → về `{status:'success'}` cho khớp với cách client check `data.status === 'success'`.
  3. Các route còn lại sửa dần khi động vào.
- **Lưu ý:** đổi response `tasks3d` phải sửa cả client đọc nó: `grep -rn "tasks3d" src/components` (hiện `print-histories.tsx` đang đọc mảng trần).

### 6.6. Gộp 3 định nghĩa `Result<T>` trùng lặp
- **Files:** `src/services/filament.service.ts` (dòng 12), `src/services/printer.service.ts` (dòng 4), `src/services/location.service.ts` (dòng 3), + `ServiceResult` trong `src/services/inventory.service.ts`
- **Cách sửa:** tạo `src/types/result.ts` export 1 type duy nhất, 4 file import lại.

### 6.7. Thêm endpoint xóa đơn hàng (thiếu tính năng)
- **File mới:** thêm `DELETE` vào `src/app/api/orders/[id]/route.ts`
- **Logic:** chỉ cho xóa khi không có PrintItem nào `status !== 'pending'` (giống rule đang có ở PUT); xóa theo cascade (schema đã có `onDelete: Cascade` từ Order → OrderProduct → PrintItem).
- **UI:** thêm nút xóa trong `src/components/Orders/orders-tab.tsx` với confirm.

---

## GIAI ĐOẠN 7 — Chất lượng code & vệ sinh (làm dần, ~4-6 giờ nếu làm hết)

### 7.1. ESLint: xử lý theo nhóm (hiện 217 error / 81 warning)
Thứ tự đáng làm:
1. **`react-hooks/immutability` (8 lỗi) — có thể là bug thật:** các hàm `handleScanCode`, `handleNumberScan`, `handleTabScan`, `handleDoneScan`, `submitData`, `fetchOrder`, `processScannedCode` được gọi trong `useEffect` **trước khi khai báo** (function expression) → effect giữ closure cũ:
   - `src/components/Filament/update-weight-modal.tsx` (dòng 185-212) — nặng nhất
   - `src/components/Filament/check-inventory-tab.tsx` (dòng 111)
   - `src/components/Filament/print-qr-tab.tsx` (dòng 33)
   - `src/components/Orders/order-check-tab.tsx` (dòng 22)
   - **Cách sửa:** chuyển các handler thành `useCallback` khai báo **trước** effect, thêm vào deps.
2. **`react-hooks/exhaustive-deps` (7):** xem từng cái, đa số sửa được bằng useCallback ở bước trên.
3. **`no-unused-vars` (72):** xóa import/biến thừa — chạy `npx eslint src --fix` trước, còn lại xóa tay.
4. **`no-explicit-any` (184):** không cần diệt hết một lần. Ưu tiên: `src/types/filament.types.ts` (dòng 70,72: `location?: any`, `printer?: any` → khai type Location/Printer thật), `src/services/printer-integration/types.ts`, các service. Component sửa dần.
5. **`set-state-in-effect` (22):** đa phần là pattern load-from-props, chấp nhận được — để cuối.

### 7.2. Vá lỗ hổng dependencies (3 high)
```bash
npm install next@16.2.12 eslint-config-next@16.2.12
npm audit --omit=dev   # phải về 0 high
```
(next 16.2.12 vá postcss/sharp inherited CVEs — cùng minor, rủi ro thấp.)

### 7.3. `@types/qrcode` đặt nhầm chỗ
- **File:** `package.json` (dòng 14)
- **Cách sửa:** chuyển `@types/qrcode` từ `dependencies` sang `devDependencies`. Kiểm tra `@types/jsbarcode` có được dùng không (không thấy import `jsbarcode` trong src → xóa luôn cả 2 nếu không dùng).

### 7.4. Đồng nhất ngôn ngữ đặt tên
- **File:** `src/components/Store/store-management-tab.tsx`
- **Vấn đề:** biến tiếng Việt không dấu (`sanPham`, `bieuMau`, `truongRieng`...) trong khi toàn codebase dùng tiếng Anh (comment tiếng Việt thì OK, đó là convention chung của repo).
- **Cách sửa:** làm CÙNG LÚC với mục 6.1 (đằng nào cũng viết lại phần data layer). Nếu không làm 6.1 thì bỏ qua — không đáng refactor riêng.

### 7.5. Bổ sung test cho phần dễ vỡ nhất
Hiện chỉ có 3 file test (utils + filament service). Đáng thêm (theo thứ tự lợi ích):
1. `generateUniqueBarcode` (sau khi tách ra `src/utils/barcode.ts` — mục 2.6)
2. Logic merge items trong `PUT /api/orders/[id]` (tách hàm tính diff `piecesPerProduct` ra pure function rồi test)
3. `sanitizeTSPL` (mục 4.1) — thêm case vào `tspl-printer.test.ts`
4. `PrinterManager.getProviderAsync` (mock prisma + provider)

### 7.6. docker-compose bổ sung MQTT broker
- **File:** `docker-compose.yml`
- **Vấn đề:** `next.config.ts` rewrite `/mqtt` → `127.0.0.1:9001` nhưng compose không có service mosquitto → dựng máy mới là thiếu.
- **Cách sửa:** thêm service:
  ```yaml
  mosquitto:
    image: eclipse-mosquitto:2
    ports:
      - "127.0.0.1:9001:9001"
    volumes:
      - ./mosquitto.conf:/mosquitto/config/mosquitto.conf
  ```
  + tạo `mosquitto.conf` bật websocket listener 9001. (Nếu broker thật đang chạy chỗ khác — ví dụ trên HA — thì thay bằng ghi chú trong README.)

### 7.7. Viết `README.md` + `CLAUDE.md`
- Repo chưa có README. Ghi: cách chạy (docker compose up + prisma migrate + npm run dev), kiến trúc (HA bridge cho BambuLab, MQTT cân, máy in tem USB), các biến env (`DATABASE_URL`, `PRINTER_DEVICE_PATH`), sơ đồ tab UI.

---

## THỨ TỰ THI CÔNG ĐỀ XUẤT

| Đợt | Mục | Thời lượng | Kết quả |
|-----|-----|-----------|---------|
| 1 | GĐ1 (1.1→1.3) | ~30 phút | ✅ Build xanh |
| 2 | 2.1, 2.2, 2.3 | ~1 giờ | ✅ DB dựng lại được, có index |
| 3 | 2.4→2.8 + 5.1 + 5.3 | ~1.5 giờ | ✅ Hết bug ghi dữ liệu, hết lộ token |
| 4 | GĐ3 (3.1→3.5) | ~2 giờ | ✅ Điều khiển máy in ổn định sau restart, cân tự reconnect |
| 5 | GĐ4 (4.1→4.3) | ~1 giờ | ✅ In tem an toàn, không treo server |
| 6 | 6.2, 6.3, 6.4, 6.5, 6.7 | ~2 giờ | ✅ Bớt tải, API nhất quán, xóa được đơn |
| 7 | 6.1 (store tab → DB) | ~2-3 giờ | ✅ Hàng hóa cửa hàng sync đa thiết bị |
| 8 | GĐ7 (7.1→7.7) | làm dần | ✅ Lint sạch, có test, có README |

Các mục đánh dấu ⭐ là "đau nhất nếu không sửa". Mục 2.9, 2.10, 3.6, 7.4, 7.5 là tùy chọn — bỏ qua được nếu muốn gọn.

## LỆNH KIỂM TRA TOÀN CỤC (chạy sau mỗi đợt)

```bash
npx tsc --noEmit && npm test && npx next build && npx eslint src
```
