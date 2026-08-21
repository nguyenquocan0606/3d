# Dashboard backend (Waves 1, 2, 5, 7)

**Date:** 2026-08-17  
**Scope:** Web backend only (`src/`). No changes to `mobile/` or `src/components/`.

---

## What changed

| File | Action | Purpose |
|---|---|---|
| `src/utils/thoi-gian.ts` | Created | `MUI_GIO_XUONG = '+08:00'` constant + `tinhBienKy()`, `ngayUTC8()`, `batDauChuoi()` helpers |
| `src/types/dashboard.types.ts` | Created | Full TypeScript shapes for all 4 API responses (§5 of KE-HOACH-DASHBOARD.md) |
| `src/utils/bo-nho-dem.ts` | Created | In-process TTL cache with `boNhoDem()`, `xoaTheoTienTo()`, `xoaKhoa()` |
| `src/services/dashboard.service.ts` | Created | All metric calculations: `layCanhBao`, `layTongQuan`, `layXuHuong`, `layHoatDong` |
| `src/app/api/dashboard/canh-bao/route.ts` | Created | `GET /api/dashboard/canh-bao` |
| `src/app/api/dashboard/tong-quan/route.ts` | Created | `GET /api/dashboard/tong-quan?range=today\|7d\|30d` |
| `src/app/api/dashboard/xu-huong/route.ts` | Created | `GET /api/dashboard/xu-huong?days=30` |
| `src/app/api/dashboard/hoat-dong/route.ts` | Created | `GET /api/dashboard/hoat-dong?limit=30` |
| `src/services/sync-notify.service.ts` | Modified | `baoThayDoi()` now calls `xoaTheoTienTo('dashboard:')` to bust all dashboard cache on every write |
| `prisma/schema.prisma` | Modified | Added 5 indexes (§7.6): `BulkRun(status, finishedAt)`, `Task3DSpoolUsage(createdAt)`, `PrintJob(createdAt)`, `EshopOrder(prepareDueTime)`, `StoreProduct(parentId, soLuong)` |
| `prisma/migrations/20260817092700_dashboard_index/` | Created | Migration applying the 5 indexes |

`GET /api/dashboard/stats` (old endpoint) and `getDashboardStats()` are **untouched** — Flutter app still calls them.

---

## Logic & flow

### Timezone
All day boundaries are computed in UTC+8 (factory timezone). `tinhBienKy('today')` returns `00:00:00 UTC+8` of today converted to UTC for Prisma. Every `generate_series` query uses `AT TIME ZONE 'UTC' AT TIME ZONE '+08:00'` to bin records by the correct local date. Mixing UTC and UTC+8 offsets was the root cause of "today starts at 8am" bugs.

### Alerts (C1–C20) — `layCanhBao()`
Runs 19 parallel queries via `Promise.allSettled`. Each query is a COUNT/EXISTS — no `findMany` rows returned. Alert C18 (scale station MQTT loss) is a client-side check and is not implemented in the API. Alerts are sorted lỗi → cảnh báo → tin. Metrics marked ⚠ include a `ghiChu` field so the UI can show an accuracy disclaimer.

### KPI overview — `layTongQuan(range)`
Seven sub-functions run via `Promise.allSettled`; a failed group returns `null` with an error message in `loi: {}` so the rest of the page still loads. Critical rules enforced:
- `conXong = SUM(quantity) - SUM(defectQuantity)`, not `SUM(quantity)`.
- `StoreProduct` metrics use `$queryRaw` selecting only the 4 needed columns — never `findMany` (would pull MB of base64 from `anh`/`tepIn`).
- `parentId IS NULL` filter on every StoreProduct metric (combo children share parent stock).
- SKU ranking queries strip `-1`/`-2`/`-5` suffixes with `REGEXP_REPLACE` and multiply by `soLuongCombo` to get true unit count.

### Time-series — `layXuHuong(soNgay)`
Uses `generate_series` to emit one row per day, LEFT JOINed to actual data. `tiLeLoi` is `null` (not `0`) on days with no production runs — prevents the chart from drawing a misleading "0% error rate" line through idle days.

### Activity feed — `layHoatDong(limit)`
Fetches at most `limit` rows from 5 tables in parallel, merges in TypeScript (not UNION ALL in SQL — different schemas make that unmaintainable), sorts by timestamp descending, and slices to `limit`.

### Cache invalidation
`baoThayDoi()` in `sync-notify.service.ts` calls `xoaTheoTienTo('dashboard:')` immediately on every write. Cache TTLs are: canh-bao 10s, tong-quan 60s, xu-huong 300s, hoat-dong 30s. Because there is only one Next.js process, an in-process `Map` is sufficient — no Redis.

---

## Behaviour & impact

- **Existing data:** no data is modified. Migration only creates indexes.
- **Old `/api/dashboard/stats`:** unchanged, continues to serve the Flutter app.
- **New endpoints:** return `{ status: 'success', data: ... }` on success; `{ status: 'error', message: '...' }` on failure; individual metric groups set to `null` on partial failure (page does not crash).
- **Metrics skipped (marked ⛔ in plan):** `orderStatus` translation table (C4 §10 #4), filament cost (§10 #3). These are not shown.
- **Metrics shown with disclaimer (marked ⚠):** `gDaTruTrongKy` (job-based, not scale-based), `duBaoCanKiet`, `giaTriTon*`, `doanhThu`. Each carries a `ghiChu` field the UI can render as a tooltip.
- **`tinhSanXuatTheoCon`** does not filter by kỳ — `PrintItem` has no `completedAt` (§10 #6), only `updatedAt`. This is a known limitation; the field is a snapshot.

---

## Tests

- `npx tsc --noEmit` — passed, zero errors.
- `npm test` (vitest) — 99/99 passed, 8 test files.
- `npx eslint src/...` on all 8 new/modified files — 0 errors, 0 warnings.
- Manual `curl` verified all 4 endpoints return `status: success`.
- Numbers cross-checked against raw SQL:
  - `nhua.tongCuon`: API 64 = SQL `COUNT(*) WHERE status='active'` 64 ✓
  - `hangHoa.soMatHang`: API 30 = SQL `COUNT(*) WHERE parentId IS NULL` 30 ✓
  - `sanXuatSLL.conXong` (7d): API 515 = SQL `SUM(quantity-defectQuantity)` 515 ✓
  - `sanXuatSLL.conLoi` (7d): API 5 = SQL `SUM(defectQuantity)` 5 ✓
  - C3 (run overtime): API flags BulkRun 51381579 (Kobra X-1, 3963 min) = SQL confirms same row ✓
- Response times (all < 400ms target): canh-bao 53ms, tong-quan 63ms, xu-huong 39ms, hoat-dong 46ms.
- Dev server restarted after Prisma migration to flush old client from RAM.
