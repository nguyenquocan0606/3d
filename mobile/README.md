# 3D Manage Mobile (Flutter)

App di động cho hệ thống **3D Manage** — chạy trên **iOS 13+** và **Android 10+ (API 29)**.

App là **client thuần**: mọi nghiệp vụ vẫn nằm ở backend Next.js hiện có
(xem [`../TAI-LIEU-HE-THONG.md`](../TAI-LIEU-HE-THONG.md)). Máy chủ phải đang chạy thì app mới hoạt động.

---

## 1. Chạy lần đầu

macOS / Linux:

```bash
cd mobile && ./tool/setup_platforms.sh
```

Windows:

```bash
cd mobile && tool\setup_platforms.bat
```

Script sinh thư mục `android/` + `ios/` bằng `flutter create`, rồi tự vá:
- `minSdk = 29` (Android 10)
- quyền `CAMERA` / `INTERNET`, cho phép cleartext HTTP (máy chủ LAN chạy `http://`)
- iOS: `NSCameraUsageDescription`, `NSLocalNetworkUsageDescription`, ATS, deployment target 13.0

Đã lỡ chạy `flutter create` bằng tay rồi thì chỉ cần chạy riêng phần vá (chạy lại
bao nhiêu lần cũng được):

```bash
python tool/patch_platforms.py
```

Sau đó:

```bash
flutter run
```

App trỏ sẵn máy chủ xưởng `http://192.168.99.152:3000` — cài xong là dùng được ngay.
Đổi địa chỉ (khi ra ngoài xưởng qua VPN/domain, hoặc máy chủ đổi IP) ở tab
**Tất cả → Cài đặt**; nút **Khôi phục máy chủ xưởng** đưa về lại địa chỉ gốc.

## 2. Build bản phát hành

```bash
flutter build apk --release          # Android
flutter build appbundle --release    # Android (Google Play)
```

### iOS — bắt buộc máy Mac

Mã nguồn và cấu hình đã sẵn sàng cho iOS (mọi gói đang dùng đều hỗ trợ iOS), nhưng
Apple chỉ cho phép biên dịch iOS trên macOS. Trên Windows/Linux `flutter build ipa`
sẽ không chạy được — đây là giới hạn của Apple, không phải của dự án.

Trên máy Mac:

```bash
cd mobile
./tool/setup_platforms.sh   # sinh ios/ + vá Info.plist, Podfile
cd ios && pod install && cd ..
flutter run                 # thiết bị thật hoặc Simulator
flutter build ipa           # đóng gói phát hành
```

Lưu ý riêng của iOS:
- **Camera không chạy trên Simulator** — phải test quét mã trên iPhone thật.
- Cài lên máy thật cần Apple ID trong Xcode → *Signing & Capabilities* → chọn Team.
  Tài khoản miễn phí ký được app dùng 7 ngày; muốn lâu hơn cần Apple Developer Program.
- iOS 14+ sẽ hỏi quyền **Local Network** ở lần đầu gọi máy chủ LAN — phải bấm Cho phép,
  nếu lỡ từ chối thì vào *Cài đặt → 3D Manage → Mạng cục bộ* bật lại.
- Âm thanh đọc số khi cân đã đặt `AVAudioSessionCategory.playback` nên vẫn kêu khi
  iPhone gạt chế độ im lặng.

---

## 3. Điều hướng

Bản web có sidebar 11 mục — quá nhiều cho điện thoại. App rút gọn còn 4 tab + nút quét ở giữa:

```
┌──────────┬──────────┬────────────┬──────────┬──────────┐
│ Tổng quan│ Cuộn nhựa│  [ QUÉT ]  │  Máy in  │ Sản xuất │ + Tất cả
└──────────┴──────────┴────────────┴──────────┴──────────┘
```

Tab **Tất cả** là menu đầy đủ mọi tính năng, gom theo 5 nhóm (Quét & mã / Nhựa & kho /
Máy in & lệnh in / Sản xuất / Cửa hàng & hệ thống). Cùng menu đó mở nhanh được từ bất kỳ
màn hình chính nào qua nút **☰** trên thanh tiêu đề, khỏi phải quay về tab.

**Nút QUÉT là trung tâm của app.** Mỗi loại tem mở đúng màn thông tin của nó
(port `handleScannedCode` của `src/app/page.tsx`):

| Tem quét | Mở ra |
|---|---|
| Mã cuộn nhựa | Chi tiết cuộn — tồn, vị trí, nút cân ngay đầu màn |
| `CLR-…` tem màu | Mọi cuộn cùng màu + tổng nhựa còn |
| `LOC-…` kho | Chi tiết kho + cuộn đang chứa |
| `PRT-…` máy in | Trạng thái realtime + điều khiển |
| `PRT-…-L1..4` slot AMS | Bật chế độ gán cuộn vào line đó |
| `PEI-<id>` mâm in | Miếng in trên mâm + máy đang gắn |
| Mã đơn hàng | Chi tiết đơn + tiến độ tem |
| Barcode 8 số | Bảng đổi trạng thái miếng in |
| `SP-…` hàng hóa | Chi tiết + nhập/xuất kho |
| `CMD-…` | QR lệnh (reset kiểm kho…) |

Mã được chuẩn hóa bằng cách bỏ `-` và viết hoa, nên `PLAWHT01` = `PLA-WHT-01`.

Riêng tem màu cần xử lý thêm: máy in nhiệt không in được Unicode nên QR in ra đã
**bị bỏ dấu** (`CLR-Đỏ` → `CLR-DO`), trong khi DB vẫn lưu "Đỏ". App port lại hàm
`removeDiacritics` của backend để khớp ngược (`stripDiacritics` trong
`core/scan/code_normalizer.dart`).

Mâm PEI không có tiền tố nào ở backend (id là uuid) nên app tự quy ước tem là
`PEI-<id>`; in tem này từ màn chi tiết mâm.

---

## 4. Tính năng đã có

Nguyên tắc phân vai: **web quản trị (tạo/sửa dữ liệu gốc) — app vận hành.** Mọi tính năng
dính tới mã, QR và quét đều có trên app.

| Nhóm | Màn hình | Ghi chú |
|---|---|---|
| Quét & mã | Quét toàn cục, **QR lệnh** (bảng `CMD-*` + QR slot AMS), In tem nhãn | QR xem to trên màn hình hoặc in ra dán |
| Tổng quan | 5 chỉ số, cuộn sắp hết, phân bổ vật liệu/màu | widget số cân realtime |
| Cuộn nhựa | Danh sách (lọc/sắp xếp), chi tiết, **cân**, gán kho/máy in, xóa, in tem, QR | |
| **Thêm cuộn nhựa** | Tạo hàng loạt (tự tăng số mã), chọn loại nhựa có sẵn hoặc nhập mới, tự in tem | ngoại lệ tạo mới duy nhất |
| Cân | Số MQTT cực to, 2 chế độ, tare, **đọc số bằng loa**, quét cuộn kế tiếp tự lưu | mp3 lấy từ `public/audio` bản web |
| Kho | Danh sách, chi tiết, xóa, in tem, **quét đưa vào / lấy ra hàng loạt** | tạo kho làm ở web |
| Máy in | Trạng thái realtime, pause/resume/stop, đèn, nhiệt, quạt, khay AMS, đồng bộ AMS | poll 5s, chỉ khi đang mở màn |
| Lệnh in 3D | **Tạo lệnh in** (trừ nhựa, đưa cuộn lên máy, hẹn giờ), **lịch sử lệnh in** kèm đếm ngược | |
| Sản xuất | Đơn hàng + chi tiết, in lại tem, miếng in (quét đổi trạng thái), **kiểm hàng đóng gói**, **mâm PEI** | |
| Kiểm kho | Phiên kiểm, quét liên tục, tiến độ, bộ lọc, QR lệnh | thứ tự sắp xếp giống backend |
| Hàng hóa | Danh sách + lọc/sắp xếp, chi tiết, **nhập/xuất/đặt tồn kho**, ảnh, lịch sử, combo | |
| Trạm cân | Toàn màn hình, tare, hiệu chuẩn | |
| Cài đặt | Máy chủ, API key, MQTT, kiểm tra kết nối, kiểm tra MISA | |

### Cố ý **không** đưa lên app (giữ ở web)

Tất cả thao tác **tạo mới dữ liệu gốc** — trừ cuộn nhựa: tạo kho, tạo máy in, kết nối
cloud, tạo/sửa đơn hàng nhiều cấp, tạo mâm PEI, tạo/sửa hàng hóa kèm upload ảnh & file in,
xuất/nhập JSON, nhập credential MISA.

Riêng hàng hóa còn một lý do kỹ thuật: `PUT /api/store-products` hiện là *full-replace*
(§5.14 tài liệu hệ thống) — mỗi lần ghi phải đẩy lại toàn bộ danh sách, không nên làm
nặng thêm qua 4G.

---

## 5. Cấu trúc mã

```
lib/
├── main.dart                 # khởi tạo SharedPreferences, locale vi_VN, ProviderScope
├── router.dart               # go_router + StatefulShellRoute (mỗi tab 1 stack riêng)
├── core/
│   ├── api/api_client.dart   # Dio + bóc format {status, data, message} của backend
│   ├── config/app_settings.dart
│   ├── scale/                # MQTT trạm cân + phát âm thanh đọc số
│   ├── scan/                 # phân loại mã + điều phối sau khi quét + chế độ hàng loạt
│   ├── format/               # tiền VND, gram, thời lượng + công thức định giá cửa hàng
│   ├── theme/app_theme.dart  # dark-first, accent indigo — bám design system bản web
│   └── widgets/common.dart
├── data/
│   ├── models/               # 1 file / nhóm bảng, fromJson viết tay (không cần codegen)
│   ├── repositories/         # 1 file / domain, ánh xạ 1-1 với API routes
│   └── providers.dart        # Riverpod: filaments, spools (ghép phẳng), printers, orders...
└── features/                 # 1 thư mục / màn hình
```

**Không dùng code generation** (freezed/json_serializable) — `fromJson` viết tay để
`flutter pub get && flutter run` là chạy được ngay, không cần `build_runner`.

---

## 6. Những chỗ khác bản web (và vì sao)

| Bản web | App | Lý do |
|---|---|---|
| Súng quét HID bắt `keydown` toàn cục | Camera (`mobile_scanner`) | Điện thoại không có bàn phím ngoài. Nếu dùng súng Bluetooth HID, iOS coi như bàn phím — có thể bổ sung sau bằng `RawKeyboardListener`. |
| MQTT qua rewrite `/mqtt` của Next.js | Nối thẳng `ws://<host>:9001` | Ổn định hơn; vẫn đổi được trong Cài đặt (VD `wss://3d.quocan.click/mqtt`). |
| Poll trạng thái máy in 5s / 5 phút | Chỉ poll khi đang mở màn Máy in | Tiết kiệm pin. |
| Tem in bitmap render trên canvas | Gửi nội dung, server sinh TSPL | Bản xem trước trong app là mô phỏng bố cục, không pixel-perfect. |
| `window.CustomEvent` cho toast/confirm | `ScaffoldMessenger` + `showDialog` | |
| Ảnh hàng hóa base64 hiển thị trực tiếp | `Image.memory` sau khi decode data URL | Ảnh gốc chỉ tải khi mở tab Ảnh (lazy như bản web). |

---

## 7. Việc cần làm ở backend trước khi phát hành rộng

Chi tiết ở §10 và §11.6 của `TAI-LIEU-HE-THONG.md`. Tóm tắt mức ưu tiên:

1. **Xác thực API** — hiện API mở hoàn toàn. App đã gửi sẵn header `X-API-Key`, chỉ cần backend kiểm tra.
2. **Phân trang** cho `GET /api/spools` (chưa có endpoint riêng — app đang phải tải `/api/filaments` rồi làm phẳng) và `GET /api/print-items`.
3. **CRUD từng bản ghi cho hàng hóa** thay `PUT` full-replace — mỗi lần nhập/xuất kho hiện đang đẩy lại toàn bộ danh sách.
4. `PATCH /api/tasks3d/[id]` để kết thúc lệnh in, `GET /api/health` cho màn Cài đặt.


---

## 8. CI/CD (GitHub Actions)

Workflow ở [`.github/workflows/mobile.yml`](../.github/workflows/mobile.yml) — đặt ở
**gốc repo**, không phải trong `mobile/`. Nếu bạn tách `mobile/` thành repo riêng thì
chỉ cần sửa `APP_DIR: mobile` thành `APP_DIR: .`.

| Job | Máy | Kết quả |
|---|---|---|
| `analyze` | Ubuntu | `flutter analyze` + `flutter test` |
| `android` | Ubuntu | `app-release.apk` |
| `ios` | **macOS** | `.ipa` |

`android/` và `ios/` không commit vào repo nên workflow tự sinh bằng
`flutter create --platforms=…` (dạng lệnh này chỉ thêm platform, không đụng `lib/`),
rồi chạy `tool/patch_platforms.py` để vá quyền và cấu hình.

### iOS không cần tài khoản Apple trả phí

Không nạp secret nào thì job iOS build **bản chưa ký** và đóng gói `.ipa` thủ công
(IPA thực chất là zip chứa `Payload/`). Tải artifact `ios-ipa` về rồi cài bằng
**Sideloadly** hoặc **AltStore** — công cụ đó tự ký bằng Apple ID miễn phí, app dùng
được 7 ngày rồi phải ký lại.

### iOS có ký sẵn

Nạp 4 secret vào repo (*Settings → Secrets and variables → Actions*):

| Secret | Nội dung |
|---|---|
| `IOS_CERT_P12` | Chứng chỉ Apple Distribution (`.p12`) đã `base64` |
| `IOS_CERT_PASSWORD` | Mật khẩu file `.p12` |
| `IOS_PROVISION_PROFILE` | Provisioning profile (`.mobileprovision`) đã `base64` |
| `IOS_TEAM_ID` | Team ID 10 ký tự trong Apple Developer |

Có đủ secret thì job tự chuyển sang nhánh ký và xuất IPA ad-hoc cài thẳng được.

Bước nạp chứng chỉ dùng lệnh `security` của macOS chứ không dùng action bên thứ ba —
chứng chỉ ký là thứ nhạy cảm nhất trong pipeline, không nên đưa qua code lạ. Keychain
tạm cũng được xóa ở bước cuối kể cả khi build lỗi.

Tạo base64 để dán vào secret:

```bash
base64 -i Certificates.p12 | pbcopy
```
