# Quotes on the mobile app

## What changed (mobile)

- **New screens** under `mobile/lib/features/bao_gia/`:
  - `bao_gia_screen.dart` — quote list (port of `src/components/PhieuBaoGia/danh-sach.tsx`): the 4 monthly figures,
    search, one tab per classification label (remembered per device), status filters with counts, create, copy link,
    change label, duplicate, delete.
  - `soan_bao_gia_screen.dart` — quote editor (port of `trinh-soan.tsx`): status, label, title, valid-until date,
    delivery time, customer (with suggestions from earlier quotes, call / open-link buttons), line items, discounts,
    VAT, invoice / deposit / QR mode, notes and terms, totals with amount in words and the workshop-only profit block.
    A bottom bar shows the total and a **Gửi khách** button.
  - `sua_dong_sheet.dart` — bottom sheet for one line: name, spec, quantity, unit, grams × price/g + print hours ×
    price/h (unit price computed automatically), unit price, line discount %, extra fee, "price after discount"
    adjustment, line profit, and **product photos from the camera or gallery**.
  - `chon_tu_may_tinh_sheet.dart` — add lines from recent 3D price-calculator runs (`/api/phieu-bao-gia/tu-may-tinh`).
  - `anh_phieu_screen.dart` — the quote sheet as a sharp PNG rendered by the server
    (`GET /api/phieu-bao-gia/<id>/anh`), with share image, share PDF and print.
- **Model and maths**: `mobile/lib/data/models/bao_gia.dart` is a 1-to-1 port of `src/utils/phieu-bao-gia.ts`
  (`tinhTong`, `thanhTienDong`, `donGiaTheoGramGio`, `giaSauCk`, `tinhLaiCk`, `canGiaSauCk`, `loiNhuanPhieu`, `khoanQr`,
  `docSoTien`, `hetHieuLuc`…). Rounding uses JavaScript `Math.round` semantics (`jsRound`) so negative profits round the
  same way as on the web.
- **Repository**: `mobile/lib/data/repositories/bao_gia_repository.dart` maps the existing `/api/phieu-bao-gia/*` routes.
- **Admin login on the app**: `mobile/lib/core/auth/phien_admin.dart`. All quote routes call `yeuCauAdmin`, so the app
  now logs in through the web's own `POST /api/auth/dang-nhap`, keeps the `phien_3d` cookie value in
  SharedPreferences and sends it as a `Cookie` header from a Dio interceptor (`core/api/api_client.dart`).
  Only admin accounts are accepted. A 401 from a quote route clears the stored session and the screen returns to the
  login form. No backend change was needed.
- Menu: **Tất cả → Cửa hàng & hệ thống → Báo giá khách**. Routes `/bao-gia` and `/phieu-bao-gia/:id`.
- New packages: `image_picker`, `share_plus` (`url_launcher` came with the Facebook screens). `tool/patch_platforms.py` adds
  `NSPhotoLibraryUsageDescription` to the iOS `Info.plist`.

## Logic & flow

- Autosave works like the web: 0.8 s after the last edit the whole quote is sent with `PUT`. Saves are serialised; if
  the user keeps typing during a save, another save follows. The reply only updates server-owned fields (customer
  viewed / accepted, order created on acceptance, link token) so text being typed is never overwritten. Leaving the
  screen waits for the save; if it fails the user can still leave and the app retries once in the background.
- Lines are edited in a bottom sheet that writes straight into the quote (no separate save). Photo uploads that finish
  after the sheet is closed are still attached.
- Customer links always use `https://mochilab3d.com/bg/<token>`: the app usually talks to the LAN address, which a
  customer cannot open. The middleware already serves `/bg/*` on that domain without login.
- Sending to the customer (share message, copy message, copy link, send image / PDF) saves first and then moves a draft
  to "Đã gửi", like the web.
- The A4 sheet is not redrawn on the phone. The image and PDF come from the server's Chromium render of the web
  print page, so logo, VietQR code and layout are identical to what the web produces.
- Not on the app (still web only): editing workshop settings (bank accounts, logo, default terms). The app reads them.

## Behaviour & impact

- Existing quotes and the web editor are unaffected; the app writes the same JSON fields the web writes.
- Each phone must log in once with an admin account (session lasts 30 days, same as the web).
- The rest of the app still works without logging in; the cookie is only required by the quote and order routes.

## Tests

- `flutter analyze` (no new issues) and `flutter test` — all pass, including:
  - `test/bao_gia_test.dart`: the cases of `src/utils/tests/phieu-bao-gia.test.ts` ported to Dart, JSON round-trip of
    every line field, calculator line conversion, cookie parsing and token expiry.
  - `test/bao_gia_screen_test.dart`: widget tests with an in-memory repository — login form when logged out, list,
    adding a line and typing grams/hours recomputes the unit price, autosave sends the expected JSON, VAT / deposit /
    default terms.
- Cross-check on real data: the web's `tinhTong`, `loiNhuanPhieu`, `khoanQr` and `docSoTien` (run with `tsx`) and the
  Dart port gave identical results for all 27 quotes in `data/bao-gia/`, before and after a save round-trip.
- Not run here: the app on a real phone (no device on the server) — Android/iOS builds are left to the CI workflow.
