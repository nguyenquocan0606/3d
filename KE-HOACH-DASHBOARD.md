# Kế hoạch: Dashboard tổng hợp toàn hệ thống

> Tài liệu **hợp đồng** cho trang Tổng quan mới (web + app). Mọi metric ở đây đều
> ghi rõ **công thức**, **bảng nguồn**, **ngưỡng cảnh báo** và **bấm vào thì đi đâu**.
> Chỗ nào dữ liệu hiện chưa đủ để tính đúng thì nói thẳng ở §9, không tính bừa.
>
> Ngày lập: 2026-08-17. Nguồn: `prisma/schema.prisma`, `src/services/`, `src/app/api/`, `mobile/lib/`.

---

## 1. Hiện trạng

| Nơi | Nội dung hiện có |
|---|---|
| [dashboard-tab.tsx](src/components/Dashboard/dashboard-tab.tsx) | 5 ô số + 1 banner "Coming Soon" |
| [dashboard_screen.dart](mobile/lib/features/dashboard/dashboard_screen.dart) | 5 ô số + danh sách cuộn sắp hết + phân tách theo loại/màu |
| [filament.service.ts:417](src/services/filament.service.ts:417) | `getDashboardStats()` — nguồn duy nhất |

Ba vấn đề:

1. **Chỉ có nhựa.** Hệ thống có 8 nghiệp vụ (nhựa, kho, máy in, sản xuất theo con,
   sản xuất SLL, tem nhãn, hàng hóa, eShop) + 3 hạ tầng (thông báo, đồng bộ app, Zalo).
   Dashboard phản ánh đúng **một** trong số đó.
2. **Không có gì "cần làm ngay".** Toàn số tĩnh. Máy in lỗi 2 tiếng, đơn eShop sắp
   quá hạn chuẩn bị, token MISA hết hạn — dashboard im lặng hết.
3. **Cách tính không mở rộng được.** `getDashboardStats()` gọi `findMany` kéo **toàn bộ**
   Spool kèm `filament` về RAM rồi `filter`/`reduce` bằng JS. Thêm hàng hóa và đơn eShop
   theo kiểu đó là kéo vài trăm MB base64 (`StoreProduct.anh`, `tepIn`) mỗi lần mở trang.

---

## 2. Nguyên tắc thiết kế

**2.1. Ba tầng thông tin, đúng thứ tự này.**

```
┌─ Tầng 1: CẦN XỬ LÝ NGAY ──── đỏ/vàng, chỉ hiện khi có, mỗi dòng bấm được ─┐
├─ Tầng 2: ĐANG DIỄN RA ────── sản lượng hôm nay, máy đang in, đơn đang chạy ┤
└─ Tầng 3: XU HƯỚNG ────────── biểu đồ 30 ngày, bảng xếp hạng ──────────────┘
```

Người mở dashboard buổi sáng cần biết **"hôm nay phải xử lý cái gì"** trước, số liệu
tổng hợp sau. Đảo thứ tự này là dashboard đẹp mà vô dụng.

**2.2. Số nào không dẫn tới hành động thì bỏ.** Mỗi ô số phải trả lời được câu
"thấy con số này rồi tôi làm gì". Không trả lời được → xóa (xem §11).

**2.3. Mọi ô số bấm được.** Đích đến ghi ở cột "Bấm vào" trong §4. Web đổi tab kèm
bộ lọc, app `context.push` sang màn tương ứng.

**2.4. Đếm ở CSDL, không kéo bản ghi về đếm.** `groupBy` / `aggregate` / `$queryRaw`.
Không `findMany` rồi `.filter().length`.

**2.5. Chia API theo tần suất làm mới, không gộp một cục.** Trạng thái máy in phải hỏi
Home Assistant (chậm, có thể timeout); xu hướng 30 ngày quét bảng lớn. Nhồi chung một
endpoint thì cả trang chờ theo cái chậm nhất và cache hỏng hết. Xem §5.

**2.6. Khoảng thời gian dùng chung một chuẩn.** "Hôm nay" = từ 00:00 theo **múi giờ
xưởng = UTC+8**, không phải giờ máy khách và không phải UTC. Đặt một hằng số duy nhất
`MUI_GIO_XUONG = '+08:00'` trong `src/utils/thoi-gian.ts`, mọi truy vấn dashboard dùng
chung — không rải chuỗi múi giờ khắp nơi. Bộ lọc: `Hôm nay | 7 ngày | 30 ngày`, áp cho
tầng 2 và 3; tầng 1 luôn là "ngay lúc này".

**2.7. Biểu đồ và bảng xếp hạng chỉ có trên web.** App chỉ hiện cảnh báo + ô số + việc
đang chạy. Màn hình điện thoại vẽ chuỗi 30 ngày là không đọc được, mà lại tốn một endpoint
nặng trên 4G.

---

## 3. Bản đồ nguồn dữ liệu

| Nhóm | Bảng | Cột dùng để tính |
|---|---|---|
| Nhựa | `Spool`, `Filament`, `Task3DSpoolUsage` | `remainingWeightG`, `initialWeightG`, `status`, `locationId`, `printerId`, `usedWeightG`, `createdAt` |
| Kho | `Location`, `InventorySession`, `InventoryItem` | `active`, `scannedAt` |
| Máy in | `Printer`, `SuKienMayIn`, `Task3D` | `status`, `cloudAccountId`, `loai`, `mucDo`, `createdAt`, `daGui` |
| Sản xuất theo con | `Order`, `OrderProduct`, `PrintItem` | `status`, `isChecked`, `peiSheetId`, `updatedAt` |
| Sản xuất SLL | `BulkOrder`, `BulkRun` | `totalQuantity`, `quantity`, `defectQuantity`, `isRework`, `status`, `startedAt`, `finishedAt` |
| Mâm PEI | `PeiSheet`, `PrintItem` | `printerId`, `peiSheetId` |
| Tem nhãn | `PrintJob` | `status`, `createdAt` |
| Hàng hóa | `StoreProduct` | `soLuong`, `nguongCanhBao`, `giaVon`, `giaBanLe`, `parentId` |
| eShop | `EshopOrder`, `EshopOrderItem`, `EshopPickProgress`, `EshopSyncState`, `MisaCredential` | `totalRevenue`, `channelName`, `orderStatus`, `prepareDueTime`, `completeDate`, `daTruTonKhoLuc`, `tokenExpiresAt` |
| Đồng bộ app | `SyncAction`, `SyncTombstone` | `loai`, `ketQua`, `apDungLuc`, `thietBi` |
| Thông báo | `SuKienMayIn`, `ThietBiThongBao` | `daGui`, `hoatDong` |
| Zalo | `ZaloAccount`, `ZaloThread` | `trangThai`, `lastMessageAt`, `unreadCount` |
| Trạm cân | — (MQTT, phía client) | topic cân |

---

## 4. Danh mục metric đầy đủ

Ký hiệu: **⚡** = tính được ngay với dữ liệu hiện có · **⚠** = tính được nhưng có
cảnh báo về độ chính xác (đọc §9) · **⛔** = phải bổ sung backend trước (§9).

### 4.1. Tầng 1 — Cần xử lý ngay (`/api/dashboard/canh-bao`)

Mỗi cảnh báo trả về `{ ma, mucDo: 'loi'|'canhBao'|'tin', tieuDe, soLuong, chiTiet[], dichDen }`.
Không có gì thì mảng rỗng — UI ẩn cả khối.

| # | Cảnh báo | Điều kiện | Mức | Bấm vào | |
|---|---|---|---|---|---|
| C1 | Máy in đang lỗi | `SuKienMayIn` `loai='loi'` trong 24h **và** máy chưa có sự kiện `batDau`/`inTiep` sau đó | lỗi | Máy in → chi tiết máy | ⚡ |
| C2 | Máy in mất kết nối | sự kiện `mangMat` gần nhất mới hơn `mangLai` gần nhất | lỗi | Máy in | ⚡ |
| C3 | Lượt SLL chạy quá lâu | `BulkRun.status='printing'` và `now - startedAt > 2 × thời gian trung bình lượt của máy đó` (tối thiểu 90 phút) | cảnh báo | Đơn SLL → chi tiết | ⚡ |
| C4 | Cuộn sắp hết | `status='active'` và `remainingWeightG / initialWeightG < 0.2` | cảnh báo | Cuộn nhựa (lọc sắp hết) | ⚡ |
| C5 | Loại nhựa sắp cạn kho | tổng kg còn của một `(type,colorName)` < tiêu hao trung bình 7 ngày × 3 | cảnh báo | Loại nhựa | ⚠ |
| C6 | Cuộn không rõ chỗ | `status='active'`, `locationId IS NULL`, `printerId IS NULL` | tin | Cuộn nhựa (lọc chưa gán) | ⚡ |
| C7 | Hàng hóa dưới ngưỡng | `soLuong <= nguongCanhBao` (chỉ hàng mẹ, `parentId IS NULL`) | cảnh báo | Hàng hóa cửa hàng | ⚡ |
| C8 | Đơn eShop sắp tới hạn chuẩn bị | `prepareDueTime` trong 6h tới và `EshopPickProgress.status <> 'picked'` | lỗi nếu <2h, cảnh báo nếu <6h | eShop → đơn | ⚡ |
| C9 | Đơn eShop xong chưa trừ kho | `completeDate IS NOT NULL` và `daTruTonKhoLuc IS NULL` | cảnh báo | eShop (nút trừ tồn) | ⚡ |
| C10 | Token MISA sắp hết hạn | `tokenExpiresAt < now + 2h`, hoặc `lastCheckOk = false` | lỗi | Cài đặt → MISA | ⚡ |
| C11 | Đồng bộ eShop treo | `EshopSyncState.lastSyncAt < now - 3h` hoặc `lastSyncOk = false` | cảnh báo | eShop | ⚡ |
| C12 | Thao tác app bị từ chối | `SyncAction.ketQua='rejected'` trong 24h | lỗi | (web: bảng chi tiết; app: màn "Thao tác chưa đồng bộ") | ⚡ |
| C13 | Thông báo đẩy trượt | `SuKienMayIn.daGui = false` trong 24h | cảnh báo | Hoạt động máy in | ⚡ |
| C14 | Không còn thiết bị nhận push | `count(ThietBiThongBao where hoatDong) = 0` | cảnh báo | Cài đặt thông báo | ⚡ |
| C15 | Zalo mất kết nối | `ZaloAccount.trangThai <> 'dang_chay'` hoặc `lastMessageAt < now - 6h` | cảnh báo | Tin nhắn Zalo | ⚡ |
| C16 | Tin nhắn Zalo chưa đọc | `sum(ZaloThread.unreadCount) > 0` | tin | Tin nhắn Zalo | ⚡ |
| C17 | Phiên kiểm kho bỏ quên | `InventorySession.active = true` và `createdAt < now - 24h` | tin | Kiểm kho | ⚡ |
| C18 | Trạm cân mất tín hiệu | không có bản tin MQTT > 60s (tính ở client, không qua API) | tin | Trạm cân | ⚡ |
| C19 | Mâm PEI kẹt | `PeiSheet` gắn máy in nhưng mọi `PrintItem` của mâm đã `completed` > 2h | tin | Mâm PEI | ⚡ |
| C20 | Đơn hàng ì | `Order.status <> 'completed'` và `updatedAt < now - 7 ngày` | tin | Sản xuất → đơn | ⚡ |

**Quy tắc gộp:** tối đa 5 dòng hiện trực tiếp, còn lại gom "và N cảnh báo khác".
Sắp xếp: lỗi → cảnh báo → tin, trong cùng mức thì mới nhất lên trước.

### 4.2. Tầng 2 — KPI đang diễn ra (`/api/dashboard/tong-quan?range=`)

**Sản xuất SLL**

| Metric | Công thức | |
|---|---|---|
| Số con in xong trong kỳ | `SUM(quantity - defectQuantity)` của `BulkRun` `status='completed'`, `finishedAt` trong kỳ | ⚡ |
| Số con lỗi trong kỳ | `SUM(defectQuantity)` cùng điều kiện | ⚡ |
| Tỉ lệ lỗi | `SUM(defectQuantity) / SUM(quantity)` | ⚡ |
| Lượt đã xong / đang in / còn chờ | `COUNT` theo `status` | ⚡ |
| Lượt in bù | `COUNT(isRework = true)` trong kỳ | ⚡ |
| Thời gian trung bình 1 lượt | `AVG(finishedAt - startedAt)` trên lượt `completed` | ⚡ |
| Đơn SLL đang chạy | `BulkOrder.status='printing'`, kèm tiến độ `SUM(quantity-defect của run completed) / totalQuantity` | ⚡ |
| Lượt đang in ngay lúc này | danh sách `BulkRun.status='printing'` + tên máy + số phút đã trôi | ⚡ |

**Sản xuất theo con**

| Metric | Công thức | |
|---|---|---|
| Miếng in theo trạng thái | `PrintItem` `groupBy(status)` | ⚡ |
| Miếng in xong trong kỳ | `status='completed'` và `updatedAt` trong kỳ | ⚠ |
| Đã kiểm đóng gói | `COUNT(isChecked = true)` / tổng `completed` | ⚡ |
| Miếng in chưa xếp mâm | `status='pending'` và `peiSheetId IS NULL` | ⚡ |
| Đơn theo trạng thái | `Order` `groupBy(status)` | ⚡ |
| Mâm PEI đang gắn máy | `PeiSheet.printerId IS NOT NULL` | ⚡ |

**Máy in** (endpoint riêng, xem §5.4)

| Metric | Công thức | |
|---|---|---|
| Tổng / đang in / rảnh / offline | `Printer.status` + trạng thái thật từ `PrinterManager` | ⚡ |
| Tiến độ từng máy | `tienDo`, `tenFile`, `nhietVoi`, `nhietBan` từ `/api/printers/cloud/status` | ⚡ |
| Số lần lỗi 7 ngày theo máy | `SuKienMayIn` `groupBy(printerId)` với `loai IN ('loi','mangMat')` | ⚡ |
| Số giờ in trong kỳ theo máy | ghép cặp `batDau` → `inXong` trên `SuKienMayIn` (window `LAG`) | ⚠ |
| Máy chưa liên kết cloud | `cloudAccountId IS NULL` | ⚡ |

**Nhựa**

| Metric | Công thức | |
|---|---|---|
| Tổng cuộn / active / depleted / archived | `Spool` `groupBy(status)` | ⚡ |
| Tổng kg còn | `SUM(remainingWeightG)` với `status='active'` | ⚡ |
| Kg còn theo loại vật liệu | `groupBy(filamentId)` rồi cộng theo `Filament.type` | ⚡ |
| Kg còn theo màu | như trên, theo `colorName` | ⚡ |
| Nhựa đã trừ trong kỳ | `SUM(Task3DSpoolUsage.usedWeightG)` theo `createdAt` | ⚠ |
| Cuộn đang nằm trên máy in | `printerId IS NOT NULL`, nhóm theo máy + `printerSlot` | ⚡ |
| Số ngày còn lại theo loại | `kg còn / (tiêu hao 30 ngày ÷ 30)` | ⚠ |
| Giá trị tồn nhựa (tiền) | — | ⛔ |

**Kho & kiểm kho**

| Metric | Công thức | |
|---|---|---|
| Số ô kho / số cuộn mỗi ô | `Location` + `COUNT(Spool)` | ⚡ |
| Ô kho trống | `COUNT(spools) = 0` | ⚡ |
| Phiên kiểm kho đang mở | `InventorySession.active` + `COUNT(items)` / tổng cuộn active | ⚡ |
| Cuộn chưa quét trong phiên | cuộn `active` không có `InventoryItem` trong phiên | ⚡ |

**Hàng hóa & eShop**

| Metric | Công thức | |
|---|---|---|
| Số mặt hàng | `COUNT(StoreProduct where parentId IS NULL)` | ⚡ |
| Số mặt hàng dưới ngưỡng / hết hàng | `soLuong <= nguongCanhBao` / `soLuong <= 0` | ⚡ |
| Giá trị tồn theo giá vốn | `SUM(soLuong * giaVon)` — **raw SQL**, xem §7.2 | ⚠ |
| Giá trị tồn theo giá bán lẻ | `SUM(soLuong * giaBanLe)` | ⚠ |
| Đơn eShop trong kỳ | `COUNT(EshopOrder where refDate in kỳ)` | ⚡ |
| Doanh thu trong kỳ | `SUM(totalRevenue)` | ⚠ |
| Đơn theo kênh | `groupBy(channelName)` | ⚡ |
| Đơn theo trạng thái | `groupBy(orderStatus)` | ⛔ (thiếu bảng dịch mã) |
| Đơn chờ nhặt / đang nhặt / đã nhặt | `EshopPickProgress.status` + đơn chưa có dòng progress | ⚡ |
| Top 10 SKU bán chạy 30 ngày | `EshopOrderItem` `groupBy(skuCode)` `SUM(quantity)`, join `EshopOrder.refDate` | ⚡ |
| SKU bán chạy mà sắp hết | giao của top SKU với `soLuong <= nguongCanhBao` → **"cần in bổ sung"** | ⚡ |
| Trạng thái đồng bộ | `EshopSyncState.lastSyncAt`, `lastRunVia`, `lastCount`, `agentLastOkAt` | ⚡ |

**Hạ tầng**

| Metric | Công thức | |
|---|---|---|
| Tem đã in trong kỳ | `PrintJob` `groupBy(status)` theo `createdAt` | ⚡ |
| Thao tác app 24h | `SyncAction` `groupBy(loai, ketQua)` | ⚡ |
| Thiết bị gửi thao tác | `groupBy(thietBi)` | ⚡ |
| Thiết bị nhận push | `COUNT(ThietBiThongBao where hoatDong)` | ⚡ |
| Sự kiện máy in 24h theo loại | `SuKienMayIn` `groupBy(loai)` | ⚡ |

### 4.3. Tầng 3 — Xu hướng (`/api/dashboard/xu-huong?days=30`)

Tất cả là chuỗi thời gian theo ngày, **phải có cả ngày rỗng** (dùng `generate_series`,
xem §7.3) — nếu không biểu đồ sẽ nối liền qua ngày nghỉ và bịa ra xu hướng không có thật.

| Chuỗi | Nguồn | |
|---|---|---|
| Sản lượng con/ngày | `BulkRun.finishedAt` × `(quantity - defectQuantity)` | ⚡ |
| Tỉ lệ lỗi/ngày | `SUM(defect)/SUM(quantity)` theo ngày | ⚡ |
| Nhựa trừ/ngày (g) | `Task3DSpoolUsage.createdAt` × `usedWeightG` | ⚠ |
| Đơn eShop/ngày + doanh thu/ngày | `EshopOrder.refDate` | ⚡ |
| Sự kiện lỗi máy in/ngày | `SuKienMayIn` `loai='loi'` | ⚡ |
| Tem in/ngày | `PrintJob.createdAt` | ⚡ |
| Thao tác app/ngày (applied vs rejected) | `SyncAction.apDungLuc` | ⚡ |

**Bảng xếp hạng** (cùng endpoint):
- Top 5 máy in theo số con hoàn thành 30 ngày (`BulkRun` `groupBy(printerId)`).
- Top 5 máy in theo số lần lỗi 30 ngày.
- Top 5 màu/loại nhựa tiêu hao nhiều nhất 30 ngày.
- Top 10 SKU bán chạy 30 ngày.

### 4.4. Feed hoạt động (`/api/dashboard/hoat-dong?limit=30`)

Trộn 5 nguồn, sắp theo thời gian giảm dần, mỗi dòng `{ luc, nhom, tieuDe, moTa, dichDen }`:

| Nguồn | Lọc | Hiển thị |
|---|---|---|
| `SuKienMayIn` | 30 gần nhất | "Máy X: in xong Y" |
| `BulkRun` | `startedAt`/`finishedAt` trong 24h | "PEI 3 máy X: bắt đầu / xong (2 lỗi)" |
| `SyncAction` | 24h | "PDA kho 1: quẹt check-out — bị từ chối" |
| `EshopOrder` | `syncedAt` 24h | "Về 12 đơn TikTok Shop" |
| `PrintJob` | 24h | "In 8 tem" |

Lấy 30 dòng mỗi nguồn rồi merge và cắt — không `UNION ALL` 5 bảng khác cấu trúc trong SQL,
khó bảo trì hơn nhiều so với gộp ở TypeScript.

---

## 5. Hợp đồng API

### 5.1. `GET /api/dashboard/canh-bao`
Nhẹ nhất, chỉ đếm. Poll 30s. Không cache (hoặc cache 10s).

```jsonc
{
  "status": "success",
  "data": {
    "tinhLuc": "2026-08-17T09:12:03.000Z",
    "canhBao": [
      { "ma": "C1", "mucDo": "loi", "tieuDe": "Máy in báo lỗi", "soLuong": 1,
        "chiTiet": [{ "id": "PRT-A1", "nhan": "Bambu A1 — Nozzle clog", "luc": "..." }],
        "dichDen": { "web": "printers", "app": "/printer/PRT-A1" } }
    ],
    "tongTheoMuc": { "loi": 1, "canhBao": 3, "tin": 2 }
  }
}
```

### 5.2. `GET /api/dashboard/tong-quan?range=today|7d|30d`
Toàn bộ §4.2 trừ máy in realtime. Cache 60s theo `range`. Poll 60s.

```jsonc
{
  "data": {
    "ky": { "tu": "...", "den": "...", "nhan": "Hôm nay" },
    "sanXuatSLL": { "conXong": 420, "conLoi": 12, "tiLeLoi": 0.028,
                    "luot": { "xong": 6, "dangIn": 2, "cho": 9 }, "luotInBu": 1,
                    "phutTrungBinhMoiLuot": 74,
                    "donDangChay": [{ "id": "...", "orderCode": "SLL-012", "productName": "Móc khóa rồng",
                                      "daXong": 420, "tong": 1000, "phanTram": 42 }],
                    "luotDangIn": [{ "id": "38271940", "may": "Bambu A1", "peiIndex": 3,
                                     "soCon": 70, "batDauLuc": "...", "phutDaTroi": 51 }] },
    "sanXuatTheoCon": { "mieng": { "pending": 120, "printing": 15, "completed": 300 },
                        "daKiem": 250, "chuaXepMam": 40, "don": { "pending": 3, "printing": 1, "completed": 12 } },
    "nhua": { "tongCuon": 84, "theoTrangThai": { "active": 61, "depleted": 20, "archived": 3 },
              "kgCon": 43.2, "gDaTruTrongKy": 2100,
              "theoLoai": [{ "ten": "PLA", "soCuon": 40, "kg": 22.1 }],
              "theoMau":  [{ "ten": "Đen", "hex": "#000000", "soCuon": 12, "kg": 7.4 }],
              "duBaoCanKiet": [{ "loai": "PLA Trắng", "kgCon": 1.2, "soNgayConLai": 4 }],
              "chuaGanCho": 3 },
    "kho": { "soO": 24, "oTrong": 5,
             "phienKiemKho": { "id": "...", "daQuet": 40, "tong": 61, "moLuc": "..." } },
    "hangHoa": { "soMatHang": 312, "duoiNguong": 14, "hetHang": 3,
                 "giaTriTonGiaVon": 42150000, "giaTriTonBanLe": 61300000 },
    "eshop": { "soDon": 37, "doanhThu": 5820000,
               "theoKenh": [{ "ten": "TikTok Shop", "soDon": 30, "doanhThu": 4900000 }],
               "nhat": { "cho": 4, "dangNhat": 1, "daNhat": 32 },
               "xongChuaTruKho": 2,
               "dongBo": { "lucCuoi": "...", "ok": true, "qua": "agent", "soDon": 12,
                           "tokenHetHanLuc": "..." },
               "canInBoSung": [{ "sku": "MK-RONG", "ten": "Móc khóa rồng", "ban30Ngay": 120, "ton": 4 }] },
    "haTang": { "tem": { "completed": 40, "failed": 1 },
                "thaoTacApp24h": { "applied": 210, "rejected": 3,
                                   "theoLoai": [{ "loai": "bulkRun.checkOut", "so": 42 }] },
                "thietBiPush": 2, "zaloChuaDoc": 5 }
  }
}
```

### 5.3. `GET /api/dashboard/xu-huong?days=30`
Cache 5 phút. Gọi 1 lần lúc mở trang + khi đổi khoảng.

```jsonc
{ "data": {
    "ngay": ["2026-07-19", "..."],
    "chuoi": { "conXong": [120, 0, 340], "tiLeLoi": [0.02, null, 0.03],
               "nhuaTru": [1200, 0, 2400], "donEshop": [4, 6, 2],
               "doanhThu": [600000, 0, 300000], "loiMayIn": [0, 1, 0], "tem": [12, 0, 5] },
    "xepHang": { "mayTheoSanLuong": [...], "mayTheoLoi": [...],
                 "nhuaTieuHao": [...], "skuBanChay": [...] } } }
```

`tiLeLoi` để `null` (không phải `0`) ở ngày không có lượt nào — 0% và "không sản xuất"
là hai chuyện khác nhau, vẽ thành 0 là nói dối biểu đồ.

### 5.4. Máy in realtime — **dùng lại** `GET /api/printers/cloud/status`
Đã có sẵn ([route.ts](src/app/api/printers/cloud/status/route.ts)), gọi song song mọi máy
qua `PrinterManager`. Poll riêng 15s. **Không** gộp vào `/tong-quan`: Home Assistant lag
là kéo sập cả dashboard, và không cache chung được.

### 5.5. `GET /api/dashboard/hoat-dong?limit=30`
Cache 30s.

### 5.6. Đẩy tín hiệu làm mới
`sync-notify.service.ts` đã publish MQTT `3dmanage/sync` sau mỗi lần ghi
([baoThayDoi](src/services/sync-notify.service.ts:64)). Web đã nối MQTT sẵn cho trạm cân →
nhận `{tables:[...]}` thì invalidate `canh-bao` + `tong-quan` ngay, khỏi chờ hết chu kỳ poll.

---

## 6. Cấu trúc code

```
src/types/dashboard.types.ts        # toàn bộ shape ở §5, dùng chung server ↔ client
src/services/dashboard.service.ts   # tính toán, không biết gì về HTTP
src/app/api/dashboard/canh-bao/route.ts
src/app/api/dashboard/tong-quan/route.ts
src/app/api/dashboard/xu-huong/route.ts
src/app/api/dashboard/hoat-dong/route.ts
src/utils/bo-nho-dem.ts             # cache TTL trong RAM (§7.4)
src/components/Dashboard/
  dashboard-tab.tsx                 # khung + bộ lọc kỳ + tự làm mới
  khoi-canh-bao.tsx
  khoi-kpi.tsx                      # lưới StatCard
  khoi-san-xuat.tsx                 # đơn SLL đang chạy + lượt đang in
  khoi-may-in.tsx                   # dùng /printers/cloud/status
  khoi-xu-huong.tsx                 # biểu đồ
  khoi-hoat-dong.tsx                # feed
  bieu-do-cot.tsx / bieu-do-duong.tsx   # SVG thuần, xem §8.3
```

`getDashboardStats()` cũ **giữ nguyên** cho tới khi app chuyển xong (app đang gọi
`/api/dashboard/stats`), sau đó xóa. Không sửa tại chỗ — endpoint mới là bản thay thế.

Đặt tên hàm/biến tiếng Việt như các service mới (`thong-bao`, `sync`), không trộn kiểu cũ.

---

## 7. Kỹ thuật truy vấn

### 7.1. Đếm bằng groupBy, không kéo bản ghi

```ts
// ĐÚNG
const theoTrangThai = await prisma.spool.groupBy({
  by: ['status'],
  _count: { _all: true },
  _sum: { remainingWeightG: true },
});

// SAI (cách hiện tại đang làm)
const spools = await prisma.spool.findMany({ include: { filament: true } });
const active = spools.filter(s => s.status === 'active').length;
```

### 7.2. ⚠ Không bao giờ `findMany` trên `StoreProduct` mà không có `select`

`anh` và `tepIn` là base64 (ảnh + file STL/3MF) — tổng có thể vài trăm MB. Dashboard
chỉ cần 4 cột, phải tính bằng raw SQL:

```ts
const [ton] = await prisma.$queryRaw<Array<{ giaVon: number; banLe: number; duoiNguong: bigint }>>`
  SELECT COALESCE(SUM("soLuong" * "giaVon"), 0)   AS "giaVon",
         COALESCE(SUM("soLuong" * "giaBanLe"), 0) AS "banLe",
         COUNT(*) FILTER (WHERE "soLuong" <= "nguongCanhBao") AS "duoiNguong"
  FROM "StoreProduct" WHERE "parentId" IS NULL`;
```

**Đã chốt: combo con KHÔNG có tồn riêng, nó ăn theo tồn của hàng mẹ.** Vì vậy **mọi**
metric tồn kho, giá trị tồn và cảnh báo dưới ngưỡng đều lọc `parentId IS NULL` —
cộng cả combo con là đếm trùng cùng một món hàng 2–4 lần. Áp cho: giá trị tồn (giá vốn
và bán lẻ), số mặt hàng, C7 (dưới ngưỡng), "hết hàng", và cột `ton` của "cần in bổ sung".

Riêng "top SKU bán chạy" thì ngược lại — `EshopOrderItem.skuCode` là mã combo con
(`...-1`/`-2`/`-5`), phải **quy về mã mẹ** (cắt hậu tố) rồi mới cộng, và nhân số lượng
với `soLuongCombo` để ra số cái thật. Không quy đổi thì bán 10 combo 5 cái ra "10 cái"
thay vì 50.

### 7.3. Chuỗi thời gian phải có ngày rỗng

```sql
SELECT d::date AS ngay,
       COALESCE(SUM(r."quantity" - r."defectQuantity"), 0) AS so_con
FROM generate_series($1::date, $2::date, '1 day') d
LEFT JOIN "BulkRun" r
  ON r."finishedAt" >= d AND r."finishedAt" < d + interval '1 day'
 AND r."status" = 'completed'
GROUP BY d ORDER BY d;
```

Giờ: Postgres chạy UTC, **xưởng ở UTC+8**. Ranh giới ngày phải quy đổi
(`(r."finishedAt" AT TIME ZONE 'UTC' AT TIME ZONE '+08')::date`), nếu không "hôm nay"
sẽ bắt đầu lúc 8h sáng và cả ca sáng bị đẩy sang ngày hôm trước. Quy tắc này áp cho
**mọi** truy vấn có mốc ngày: chuỗi xu hướng, "hôm nay", và cả biên `tu`/`den` của
`range` — trộn nửa UTC nửa +08 là số ở hai khối lệch nhau mà không ai hiểu vì sao.

### 7.4. Cache TTL trong RAM

```ts
// src/utils/bo-nho-dem.ts
const kho = new Map<string, { han: number; duLieu: unknown }>();

export async function boNhoDem<T>(khoa: string, ttlMs: number, tinh: () => Promise<T>): Promise<T> {
  const co = kho.get(khoa);
  if (co && co.han > Date.now()) return co.duLieu as T;
  const duLieu = await tinh();
  kho.set(khoa, { han: Date.now() + ttlMs, duLieu });
  return duLieu;
}
```

Đủ dùng vì chỉ có **một** tiến trình Next. Nhớ xóa khóa liên quan khi `baoThayDoi()` chạy,
nếu không thợ quẹt xong mà dashboard 60s sau mới đổi.

### 7.5. Chạy song song, chịu lỗi từng phần

`Promise.allSettled` chứ không `Promise.all`: MISA/HA hỏng không được làm chết cả trang.
Nhóm nào lỗi thì trả `null` kèm `loi: "..."`, UI hiện "—" ở ô đó thay vì trang trắng.

### 7.6. Index cần thêm

```prisma
model BulkRun          { @@index([status, finishedAt]) }
model Task3DSpoolUsage { @@index([createdAt]) }
model PrintJob         { @@index([createdAt]) }
model EshopOrder       { @@index([prepareDueTime]) }
model StoreProduct     { @@index([parentId, soLuong]) }
```

Đổi schema → **phải restart dev server** rồi mới `npx prisma migrate dev`, không thì
Prisma Client cũ vẫn nằm trong RAM.

---

## 8. Giao diện web

### 8.1. Bố cục (desktop ≥1280px, lưới 12 cột)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Tổng quan            [Hôm nay ▾]  ⟳ cập nhật 12s trước   ● 3 lỗi 5 cảnh báo│
├──────────────────────────────────────────────────────────────────────────┤
│ ❗ KHỐI CẢNH BÁO — chỉ hiện khi có, tối đa 5 dòng + "N cảnh báo khác"      │
├──────────────────────────────────────────────────────────────────────────┤
│ [Con in xong] [Tỉ lệ lỗi] [Máy đang in] [Nhựa còn] [Đơn chờ nhặt] [Dưới ngưỡng] │
├───────────────────────────────────────┬──────────────────────────────────┤
│ ĐANG SẢN XUẤT (7 cột)                 │ HOẠT ĐỘNG GẦN ĐÂY (5 cột)         │
│  • Đơn SLL + thanh tiến độ            │  feed 30 dòng, cuộn riêng         │
│  • Lượt đang in + số phút đã trôi     │                                   │
│  • Lưới máy in (tiến độ, nhiệt, file) │                                   │
├───────────────────────────────────────┴──────────────────────────────────┤
│ XU HƯỚNG 30 NGÀY — 4 biểu đồ: sản lượng · tỉ lệ lỗi · nhựa · doanh thu     │
├──────────────────────────────────────────────────────────────────────────┤
│ BẢNG XẾP HẠNG — máy theo sản lượng · máy hay lỗi · nhựa tiêu hao · SKU bán chạy │
├──────────────────────────────────────────────────────────────────────────┤
│ TỒN KHO & HẠ TẦNG — nhựa theo loại/màu · kho · tem · đồng bộ app · eShop   │
└──────────────────────────────────────────────────────────────────────────┘
```

Tablet (768–1279px): 2 cột → 1 cột, KPI 6 ô xuống 2 hàng 3.

### 8.2. Quy ước hiển thị

- **Màu theo ngữ nghĩa, không theo thẩm mỹ:** đỏ = phải xử lý ngay, hổ phách = sắp thành
  vấn đề, lục = tốt, lam = trung tính. Một ô số không có vấn đề thì **không tô màu**.
- **Số 0 phải khác số chưa tải.** Chưa có dữ liệu → skeleton; lỗi → "—" + tooltip lý do.
- **Mọi mốc thời gian hiện tương đối** ("12 phút trước") + tuyệt đối ở `title`.
- Tiền dùng `dinhDangTien` sẵn có; khối lượng < 1000g hiện `g`, ≥ hiện `kg` 2 số lẻ.
- Ô KPI: nhãn nhỏ · số lớn · phụ đề = so sánh với kỳ trước (`↑ 12% so với hôm qua`).

### 8.3. Biểu đồ — không thêm thư viện

Repo hiện không có thư viện chart nào và cố ý gọn dependency. 4 biểu đồ ở đây đều là cột
và đường đơn giản → viết 2 component SVG (~80 dòng mỗi cái) là đủ, không kéo `recharts`
(+2.5MB) vào. Yêu cầu tối thiểu: `viewBox` co giãn, tooltip theo hover cột, trục Y 3 mốc,
ngày rỗng để đứt đoạn (không nối liền).

### 8.4. Làm mới

```ts
canh-bao   : 30s      tong-quan : 60s
xu-huong   : 5 phút   printers  : 15s
```

Dừng toàn bộ khi `document.hidden`, gọi lại ngay khi tab hiện lại. Nhận MQTT `3dmanage/sync`
thì làm mới `canh-bao` + `tong-quan` ngoài chu kỳ. Không dùng `setInterval` lồng trong
`useEffect` không cleanup — lỗi kinh điển làm chồng nhiều vòng poll.

---

## 9. App (Flutter)

Thứ tự khối **khác web** — màn hình nhỏ, thợ cầm đi lại:

```
1. Cảnh báo (nếu có)          — thẻ đỏ/vàng, bấm mở thẳng màn liên quan
2. Trạm cân (giữ nguyên)      — đang là thứ dùng nhiều nhất
3. KPI 4 ô: con xong hôm nay · tỉ lệ lỗi · máy đang in · nhựa còn
4. Lượt đang in (danh sách ngang, kèm số phút đã trôi)
5. Cuộn sắp hết (giữ nguyên)

KHÔNG có trên app: mọi biểu đồ, sparkline, chuỗi xu hướng và bảng xếp hạng (§2.7).
```

Ba ràng buộc:

- **Đọc được khi mất mạng.** Ghi bản trả về gần nhất vào `cache_store`, mở lại lúc offline
  thì hiện kèm nhãn *"Số liệu lúc 09:12"* — số liệu cũ có nhãn thì dùng được, số liệu cũ
  giả vờ mới thì nguy hiểm.
- **Gọi `/canh-bao` + `/tong-quan` thôi**, không bao giờ gọi `/xu-huong` — biểu đồ là
  chuyện của web (§2.7).
- Cảnh báo **C12 (thao tác bị từ chối)** phải dẫn tới màn "Thao tác chưa đồng bộ" —
  màn này còn nợ, xem [KE-HOACH-DONG-BO-OFFLINE.md](KE-HOACH-DONG-BO-OFFLINE.md) bước 8.

---

## 10. Metric hiện CHƯA tính đúng được

Ghi rõ để không ai vẽ biểu đồ dựa trên số sai:

| # | Metric | Vì sao chưa được | Cần làm gì |
|---|---|---|---|
| 1 | **Nhựa tiêu hao thật** | `Task3DSpoolUsage` chỉ ghi lúc **tạo job** (dự kiến trừ), còn `spool.weigh` sửa thẳng `remainingWeightG` mà không sinh dòng nào. Hai nguồn lệch nhau và không đối chiếu được | Ghi một dòng nhật ký cho mỗi lần cân (delta khối lượng), hoặc chấp nhận gọi metric này là **"nhựa đã trừ theo job"** chứ không phải "tiêu hao" |
| 2 | **Thời gian in / công suất máy** | `Task3D` không có endpoint kết thúc — mọi task nằm mãi ở `printing`, `estimatedEndTime` không ai cập nhật | Thêm `PATCH /api/tasks3d/[id]` (xong/hủy + hoàn nhựa). Trước mắt suy ra từ cặp `batDau`→`inXong` của `SuKienMayIn` (chỉ có với máy đã liên kết cloud) |
| 3 | **Giá trị tồn nhựa (tiền)** | `Filament` không có cột giá | Thêm `giaMoiKg Float?` vào `Filament` |
| 4 | **Đơn eShop theo trạng thái** | `orderStatus` là số MISA (30/35/40/45/50), không có bảng dịch trong repo | Chốt bảng dịch mã → hằng số trong `src/services/eshop.service.ts` |
| 5 | **Doanh thu chuẩn** | `totalRevenue` vs `totalAmount` chưa rõ cái nào đã trừ phí sàn/giảm giá | Đối chiếu 1 đơn thật với MISA rồi ghi chú vào schema |
| 6 | **Miếng in xong theo thời gian** | `PrintItem` không có `completedAt`; đang phải mượn `updatedAt` (sửa gì cũng đổi) | Thêm `completedAt DateTime?`, set khi chuyển `completed` |
| 7 | **Đơn trễ hạn (mode theo con)** | `Order` không có hạn giao | Thêm `dueDate DateTime?` |
| 8 | **Ai làm việc gì** | Không có người dùng; `SyncAction.thietBi` là thứ gần nhất | Xem mục "không có người dùng" ở đợt rà soát trước |

**Cách xử lý trong bản đầu:** metric ⚠ vẫn hiện nhưng gắn chú thích ngay trên UI
(icon ⓘ + câu giải thích), metric ⛔ không hiện. Hiện số sai không kèm cảnh báo tệ hơn
là không hiện.

---

## 11. Metric bị loại (và vì sao)

Ghi lại để lần sau khỏi bàn lại:

| Bỏ | Lý do |
|---|---|
| Tổng số bản ghi mỗi bảng | Không dẫn tới hành động nào |
| Biểu đồ tròn phân bố màu nhựa | Đã có bảng "kg theo màu" chính xác hơn; tròn > 5 lát là không đọc được |
| Số bia mộ `SyncTombstone` | Chỉ số nội bộ của cơ chế đồng bộ |
| "Số cuộn tạo trong tháng" | Không phản ánh vận hành |
| Tổng số tin nhắn Zalo | Chỉ số chưa đọc mới đáng quan tâm |
| Đồng hồ đo tròn (gauge) cho công suất | Chiếm chỗ gấp 3 một ô số mà nói cùng một thứ |
| Nhiệt độ đầu phun trên trang tổng quan | Thuộc màn chi tiết máy in |

---

## 12. Thứ tự thi công

| Đợt | Nội dung | Cách kiểm chứng | Xong |
|---|---|---|---|
| 1 | `dashboard.types.ts` + `dashboard.service.ts` + `GET /canh-bao` | `curl` ra đủ 20 mã cảnh báo, tự tạo dữ liệu lỗi để thử ít nhất C1/C4/C8/C12 | ✅ đã curl trên DB thật, C12 bắt được 2 thao tác cân bị từ chối |
| 2 | `GET /tong-quan` + cache + `allSettled` | So số với truy vấn SQL tay trên DB thật; tắt Home Assistant xem trang còn sống không | ✅ đối chiếu SQL tay 4 chỉ số; sửa được bug tính cả hàng lỗi vào sản lượng |
| 3 | Web: khối cảnh báo + KPI + click-through | Bấm từng ô phải sang đúng tab/bộ lọc | 🔶 code xong, `tsc`+`eslint`+`next build` xanh — **chưa mở trình duyệt kiểm** |
| 4 | Web: đang sản xuất + máy in + feed hoạt động | Chạy 1 lượt SLL thật, xem lượt hiện lên và số phút chạy đúng | 🔶 như trên |
| 5 | `GET /xu-huong` + 2 component SVG + bảng xếp hạng | Ngày không sản xuất phải đứt đoạn, không về 0 | 🔶 API đã trả `tiLeLoi: null` đúng ở ngày nghỉ; phần vẽ chưa xem mắt |
| 6 | App: cảnh báo + KPI + lượt đang in + cache offline (không biểu đồ) | Bật máy bay: vẫn thấy số cũ kèm nhãn giờ | ✅ analyze 4 info (pre-existing), test 72/72 xanh, APK build OK |
| 7 | Index §7.6 + đo lại thời gian phản hồi | `/tong-quan` < 400ms khi cache nguội | ✅ 4 endpoint đo được 39–63ms khi cache nguội |
| 8 | Các mục ⛔ ở §10 (từng cái một, có changelog riêng) | | ⬜ |

Sau mỗi đợt: `npx tsc --noEmit && npm test && npx eslint src`, và một file changelog
tiếng Anh trong `docs/changes/` theo `docs/changes/README.md`.

---

## 13. Tiêu chí nghiệm thu

Dashboard coi là xong khi trả lời được cả 8 câu dưới đây **mà không phải mở tab khác**:

1. Có máy in nào đang lỗi/mất kết nối không?
2. Hôm nay xưởng ra bao nhiêu con, lỗi bao nhiêu phần trăm?
3. Lượt in nào đang chạy, trên máy nào, đã bao lâu?
4. Đơn SLL đang chạy còn bao nhiêu phần trăm nữa xong?
5. Loại nhựa nào sắp cạn, còn đủ cho mấy ngày?
6. Đơn eShop nào sắp tới hạn chuẩn bị hàng?
7. Hàng hóa nào bán chạy mà sắp hết → cần in bổ sung?
8. Có thao tác nào của thợ bị hệ thống từ chối mà chưa ai xử lý không?
