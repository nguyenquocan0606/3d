# Kế hoạch: App Android chạy độc lập khi mất mạng

Mục tiêu: app Flutter có CSDL SQLite riêng, thợ quét và thao tác bình thường khi
mất mạng, có mạng lại thì tự đồng bộ. Tài liệu này là **hợp đồng** — schema, API
và code app đều bám theo đây.

---

## 1. Nguyên tắc: hai luồng một chiều, không phải đồng bộ hai chiều

Đồng bộ hai chiều thật (hai bên cùng sửa một ô rồi hòa giải) cần CRDT hoặc màn
giải xung đột thủ công. Hệ thống này **không cần** vì phân vai đã rõ từ đầu:
web quản trị, app vận hành.

| Loại dữ liệu | Ai sở hữu | Chiều chảy |
|---|---|---|
| Dữ liệu gốc: đơn hàng, hàng hóa, máy in, kho, mâm PEI, loại nhựa | Server | Xuống app (chỉ đọc) |
| Thao tác của thợ: quét, cân, quẹt lượt in, nhập/xuất kho | App | Lên server |

Hai chiều nhưng không bao giờ tranh nhau cùng một ô.

---

## 2. Danh mục thao tác

### 2.1. Nhóm A — chạy được offline, đi qua outbox

| Mã thao tác | Việc | Luật khi server từ chối |
|---|---|---|
| `spool.weigh` | Ghi khối lượng còn lại của cuộn | LWW theo `taoLuc`; server mới hơn thì bỏ qua |
| `spool.bind` | Gán/tháo cuộn vào kho / máy in / slot AMS | LWW theo `taoLuc` |
| `spool.create` | Tạo cuộn nhựa mới | Trùng mã → **từ chối, báo thợ** |
| `printItem.setStatus` | Đổi trạng thái miếng in | **Chỉ tiến không lùi**; server đã ≥ đích → coi như xong |
| `printItem.setChecked` | Kiểm hàng đóng gói | Idempotent, đã kiểm rồi thì thôi |
| `printItem.assignSheet` | Xếp miếng in vào mâm PEI | LWW theo `taoLuc` |
| `bulkRun.checkIn` | Bắt đầu lượt in (kèm máy in đã quẹt) | Lượt không còn `pending` → **từ chối, báo thợ** |
| `bulkRun.checkOut` | Chốt in xong (kèm số con lỗi) | Lượt không còn `printing` → **từ chối, báo thợ** |
| `inventory.scanSpool` | Quét kiểm kho | Idempotent |
| `store.adjustStock` | Nhập / xuất kho hàng hóa | **Cộng dồn `+N/-N`**, không phải phép gán |

Hai luật đáng chú ý:

**`printItem.setStatus` không dùng LWW.** Trạng thái là chuỗi tiến tới
(`pending → printing → completed`). Nếu máy offline gửi lên "đặt thành printing"
mà server đã `completed` rồi thì LWW sẽ **kéo lùi** tem đã xong — sai. Luật đúng
là chỉ tiến.

**`store.adjustStock` phải là phép cộng.** Hai máy cùng offline, mỗi máy xuất 10
cái: phép gán sẽ mất một lần xuất, phép cộng ra đúng 20. Đây cũng là lý do
`PUT /api/store-products` (full-replace) không dùng được cho luồng này.

Tồn kho xuống âm thì **vẫn ghi và cảnh báo**, không chặn — kho thực tế đã âm rồi,
giấu con số đi chỉ làm mất dấu vết.

### 2.2. Nhóm B — bắt buộc có mạng

Không vào outbox. Mất mạng thì báo lỗi rõ ràng cho thợ.

- Tạo/sửa/xóa dữ liệu gốc: loại nhựa, kho, máy in, mâm PEI, đơn hàng, đơn SLL.
- Xóa cuộn nhựa, xóa đơn.
- Tạo job in — trừ nhựa nhiều cuộn trong một transaction, không thể hòa giải sau.
- In tem — cần máy in USB cắm ở máy chủ, offline thì vô nghĩa.
- Đồng bộ hàng hóa full-replace — luồng này bị thay bằng `store.adjustStock`.

---

## 3. Giao thức

### 3.1. Kéo thay đổi về (delta)

```
GET /api/sync?since=<iso8601>
```

```jsonc
{
  "serverTime": "2026-08-16T18:20:00.000Z",  // mốc `since` cho lần sau
  "changes": { "spools": [...], "printItems": [...] },
  "deleted": { "spools": ["C-PLA-R-01"] }
}
```

Lọc theo `updatedAt > since`. Hầu hết model đã có sẵn `updatedAt`.

`serverTime` phải lấy từ **đồng hồ server**, không phải đồng hồ máy — PDA lệch giờ
là chuyện thường, lấy giờ máy sẽ tạo lỗ hổng bỏ sót thay đổi.

### 3.2. Đẩy outbox lên

```
POST /api/sync/actions
```

```jsonc
{ "actions": [{ "id": "<uuid sinh tại máy>", "type": "printItem.setStatus",
                "payload": { }, "taoLuc": "2026-08-16T18:19:03.000Z" }] }
```

```jsonc
{ "results": [{ "id": "<uuid>", "status": "applied|duplicate|rejected",
                "message": "..." }] }
```

**Idempotency là bắt buộc, không phải tùy chọn.** Mất mạng giữa lúc POST thì app
không biết server đã nhận chưa; gửi lại mà không chống trùng là quẹt hai lần.
Bảng `SyncAction` lưu uuid đã áp dụng, gặp lại thì trả `duplicate`.

Gửi **theo thứ tự** và dừng ở lỗi mạng đầu tiên — thao tác sau có thể phụ thuộc
thao tác trước (quẹt máy in rồi mới chốt lượt).

### 3.3. Server báo có thay đổi

Không dựng WebSocket mới. Hệ thống **đã có MQTT broker** cho trạm cân — publish
lên topic `3dmanage/sync` sau mỗi lần ghi, app đang nối sẵn rồi:

```jsonc
{ "tables": ["printItems"], "at": "2026-08-16T18:20:00.000Z" }
```

App nhận được thì gọi delta. Không có MQTT thì rơi về poll 60s.

---

## 4. Việc phải làm ở backend

1. **Thêm `deletedAt`** cho các bảng app đọc. Hiện **chưa bảng nào có** — không có
   xóa mềm thì máy offline vĩnh viễn không biết bản ghi nào đã bị xóa.
2. **Bảng `SyncAction`** — lưu uuid, loại, thời điểm áp dụng, kết quả.
3. **`GET /api/sync`** — delta theo `since`.
4. **`POST /api/sync/actions`** — nhận mẻ, áp dụng theo luật §2.1.
5. **Publish MQTT** sau mỗi lần ghi.
6. **Thao tác tồn kho từng dòng** thay `PUT` full-replace của hàng hóa.

## 5. Việc phải làm ở app

1. SQLite bằng **`sqflite`** — không dùng `drift`, vì repo có nguyên tắc không
   dùng code generation (README §5).
2. Bảng cache cho dữ liệu đọc + bảng `outbox`.
3. Repository đọc từ SQLite thay vì gọi thẳng mạng.
4. Worker nền: đẩy outbox → kéo delta.
5. **Màn "Thao tác chưa đồng bộ"** — thợ phải nhìn thấy và tự xử những thao tác
   bị từ chối. Không có màn này thì thao tác lỗi biến mất trong im lặng, đó là
   kiểu hỏng tệ nhất của hệ thống offline.
6. Chỉ báo trạng thái trên thanh: đang offline / còn N thao tác chờ gửi.

---

## 6. Thứ tự thi công

| Bước | Nội dung | Trạng thái |
|---|---|---|
| 1 | Prisma: bia mộ + `SyncAction` + migration | ✅ đã chạy, đã kiểm chứng backfill |
| 2 | `GET /api/sync` (delta) | ✅ thử thật trên 539 bản ghi |
| 3 | `POST /api/sync/actions` + 10 luật §2.1 | ✅ thử thật, chống gửi trùng chạy đúng |
| 4 | Ghi bia mộ ở 8 route xóa + báo MQTT | ✅ thử vòng đời xóa đầu-cuối |
| 5 | App: SQLite + outbox + cache + worker | ✅ code xong, đã compile và test |
| 6 | App: repository đọc từ cache, ghi vào outbox | ✅ hoàn tất tất cả repository (8 thao tác Nhóm A) |
| 7 | App: chỉ báo trạng thái trên thanh | ✅ `_SyncStatusBar` trong `app_shell.dart` |
| 8 | App: màn thao tác chưa đồng bộ | ✅ `pending_actions_screen.dart` + mục trong `quick_menu.dart` |

### Ghi chú sau khi hoàn tất bước 6-8

**Tám thao tác Nhóm A đã có trong outbox** (xem §2.1). Mỗi thao tác:
- Ghi vào bảng `outbox` trong SQLite cục bộ ngay khi thợ bấm.
- Vá cache tức thì (`vaTamThoi` / `themTamThoi`) để UI phản hồi không cần đợi mạng.
- Worker nền đẩy lên server khi có kết nối; kết quả cập nhật ngược vào cache qua delta.

**Nhóm B (bắt buộc mạng)** — tạo/sửa/xóa dữ liệu gốc, tạo job in, in tem — vẫn gọi API trực tiếp và báo lỗi rõ khi mất mạng.

**Màn "Chưa đồng bộ"** (`/pending-sync`) có thể mở qua:
- Bấm vào thanh trạng thái ở đầu app (chỉ hiện khi có việc cần xử lý).
- Mục "Chưa đồng bộ" trong menu nhanh (tab "Tất cả" → Cloud Sync).

`flutter analyze`: 4 `info` pre-existing trong `scan_router.dart`, không có warning/error mới.
`flutter test`: 54 tests pass.
`flutter build apk --release`: build thành công.
