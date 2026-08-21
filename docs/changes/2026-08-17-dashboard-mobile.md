# Dashboard mobile — Sprint 6 (new overview screen)

## What changed

Replaces the old 5-tile spool-only dashboard with a full overview screen in the Flutter app. Only `mobile/` was touched; no changes to `src/`, `prisma/`, or shared backend code.

**New files:**

- `mobile/lib/data/models/dashboard.dart` — hand-written models (no code-generation) for the two new API endpoints:
  - `CanhBao`, `KetQuaCanhBao` — warning list from `GET /api/dashboard/canh-bao`
  - `LuotDangIn`, `SanXuatSLLKpi`, `KetQuaTongQuan` — KPI data from `GET /api/dashboard/tong-quan`
  - `DashboardResult<T>` — wrapper that carries a `cachedAt` timestamp so the screen can display "Số liệu lúc HH:mm" when showing stale data
- `mobile/lib/data/local/dashboard_cache.dart` — `DashboardCache` class backed by SharedPreferences; saves the raw JSON response and a millisecond timestamp for both endpoints
- `mobile/lib/data/repositories/dashboard_repository.dart` — `DashboardRepository`; on API success it writes to cache and returns fresh data; on failure it reads from cache and returns stale data with `cachedAt` set; if neither succeeds it rethrows for the UI to show an error

**Modified files:**

- `mobile/lib/data/providers.dart` — added `canhBaoProvider` (StreamProvider, 30 s poll) and `tongQuanProvider` (StreamProvider, 60 s poll); both are `autoDispose` so they stop when no widget holds a reference; also added model/repository imports; `refreshCoreData` now invalidates both new providers
- `mobile/lib/features/dashboard/dashboard_screen.dart` — completely rewritten to follow §9 layout:
  1. `_KhoiCanhBao` — warning cards (hidden when empty; max 5 shown, rest collapsed to "and N more"); C12 always navigates to `/pending-sync` regardless of the `dichDen.app` value the API sends
  2. `_ScaleBanner` — unchanged weight station widget
  3. `_KhoiKpi` — 2×2 grid of StatTile: "Con xong" / "Tỉ lệ lỗi ⓘ" / "Máy đang in" / "Nhựa còn"; shows `_NhanCache` timestamp banner when data comes from cache
  4. `_KhoiLuotDangIn` — horizontal list of currently printing runs with elapsed time; items sorted longest-first; minutes are adjusted forward from cache time when offline
  5. Spool low-stock section — unchanged
- `mobile/test/dashboard_parse_test.dart` — 8 new unit tests covering JSON parsing of both endpoints with real server fixture data

## Logic & flow

### Offline caching

On every successful API call the raw response JSON is written to `SharedPreferences` along with a Unix millisecond timestamp. When the network is unavailable, the repository returns the saved JSON wrapped in `DashboardResult(data, cachedAt: savedTime)`. The screen checks `result.laCache` and shows a yellow "Số liệu lúc HH:mm" banner at the top of the KPI block. Old data shown with a timestamp is safe; old data silently masquerading as fresh is dangerous — this distinction is enforced at the type level via `DashboardResult`.

### Warning routing

A static map in `_TheCanhBao._chuyenDuong()` translates API `dichDen.app` values to in-app routes. C12 is handled before the map: it always navigates to `Routes.pendingSync` (`/pending-sync`), regardless of what the API returns (which is `/sync-actions`). Unknown deep-link values pass through unchanged.

### ⚠ Metric: tỉ lệ lỗi

Shown as "Tỉ lệ lỗi ⓘ" with caption "từ BulkRun" to make clear it is calculated from completed bulk runs, not from physical measurements. When `tiLeLoi` is null (no SLL runs in the period), the tile shows "—" and caption "Chưa có lượt SLL" — this distinguishes "0% error" from "no production today".

### No charts, no `/xu-huong`

Per §2.7 of the plan, the app never renders charts, sparklines, or ranking tables and never calls `/api/dashboard/xu-huong`. The two polling providers only call `/canh-bao` and `/tong-quan`.

## Behaviour & impact

- Opening the dashboard tab starts two polling loops (30 s and 60 s). Both stop automatically when the screen is disposed (autoDispose).
- Pull-to-refresh (`refreshCoreData`) invalidates both stream providers, which restarts them and immediately fetches fresh data.
- First open with no network and no prior cache shows the API error message via Flutter's error state; first open with a saved cache shows the stale data with the timestamp banner.
- The old `dashboardStatsProvider` (backed by `GET /api/dashboard/stats`) is still wired in providers.dart for backward compatibility but is no longer used by the dashboard screen.

## Tests

- `flutter analyze` — 4 info (pre-existing in `scan_router.dart`), zero new issues
- `flutter test` — 72/72 passed (was 54 before this sprint; added 18 new tests in `dashboard_parse_test.dart`)
- `flutter build apk --release` — completed without errors
