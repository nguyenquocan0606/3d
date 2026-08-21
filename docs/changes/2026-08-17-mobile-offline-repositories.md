# Mobile: Offline-first repositories + sync status UI (Steps 6-8)

## What changed

**Mobile only** (`mobile/`). The backend (`src/`, `prisma/`) was untouched.

### Step 6 — Repository conversion + new outbox operations

All repositories now read from SQLite cache and write through the outbox for Group A operations.

| Repository | Read change | Write change |
|---|---|---|
| `filament_repository.dart` | unchanged (was already cache-backed) | `createSpool` → outbox `spool.create` + optimistic cache insert via `themTamThoi` |
| `location_repository.dart` | `fetchLocations()` → `_cache.locationsKemCuon()` | writes remain API (Group B) |
| `printer_repository.dart` | `fetchPrinters()` → `_cache.printersKemCuon()` | writes remain API (Group B) |
| `production_repository.dart` | orders/items/pei-sheets all read from cache | `updatePrintItem` dispatches to outbox by field: `printItem.setStatus`, `printItem.setChecked`, `printItem.assignSheet`; other fields stay API |
| `bulk_repository.dart` | `fetchOrders()` → `_cache.bulkOrdersKemLuot()` | `scanRun` split into `checkInRun` → outbox `bulkRun.checkIn`, `checkOutRun` → outbox `bulkRun.checkOut` |
| `store_repository.dart` | `fetchAll()` → `_cache.storeProducts()` (API fallback if empty) | `adjustStockOutbox()` → outbox `store.adjustStock` + `vaTamThoi` cache patch |
| `inventory_repository.dart` | unchanged (no list cache yet) | `scanSpool()` → outbox `inventory.scanSpool`; builds `ScanResult` from cache offline; falls back to API if spool not cached |

New outbox operation types added: `spool.create`, `printItem.setStatus`, `printItem.setChecked`, `printItem.assignSheet`, `bulkRun.checkIn`, `bulkRun.checkOut`, `inventory.scanSpool`, `store.adjustStock`.

`CacheStore.themTamThoi()` helper added to support optimistic insert of brand-new records (distinct from `vaTamThoi` which patches existing ones).

`providers.dart` changes:
- All cache-backed notifiers now watch `syncProvider.select((s) => s.phienBanDuLieu)` to re-read cache after a sync cycle.
- `PeiSheetsNotifier` upgraded from `FutureProvider` to `AsyncNotifierProvider` to support the phienBanDuLieu watch pattern.
- `StoreNotifier.adjustStock()` now computes a delta and calls `adjustStockOutbox` instead of a full PUT replace.
- `refreshCoreData()` extended to include orders, printItems, peiSheets, bulkOrders, store.

`bulk_scan.dart` updated: `BulkRunScanSession` holds a `_pendingRun` field to pass the full `BulkRun` object between the two scan steps (run barcode → printer barcode). Callers of `startBulkRun` / `finishBulkRun` updated to pass `BulkRun` instead of just `runId`.

### Step 7 — Sync status bar in `app_shell.dart`

`_SyncStatusBar` widget added inside the app shell body column (below the scan-mode bar, above the main content). It is hidden when everything is synced. Priority display order:

1. **Red** (`AppColors.danger` bg) when any action was rejected by the server.
2. **Yellow tint** when actions are queued but not yet sent.
3. **Indigo tint + spinner** when the sync worker is actively flushing.

Tapping the bar opens the pending-actions screen. The bar is not tappable when only the sync spinner is shown (nothing actionable).

### Step 8 — Pending actions screen

New file: `mobile/lib/features/sync/pending_actions_screen.dart`.

`PendingActionsScreen` (route `/pending-sync`) lists two sections:
- **Rejected** — actions the server refused. Each card shows the operation label, error message from the server, attempt count, and two buttons: "Bỏ qua" (dismiss with confirmation dialog) and "Thử lại" (re-queue with a new UUID, then trigger a sync immediately).
- **Pending** — actions waiting to be sent. Read-only cards showing label and timestamp.

Empty state shows a green checkmark and a message that everything is in sync.

`pendingActionsProvider` is a `FutureProvider.autoDispose` that subscribes to `syncProvider` (via `choGui + biTuChoi` selector) so the list auto-refreshes after every sync cycle.

Route added to `routes.dart` (`Routes.pendingSync = '/pending-sync'`) and `router.dart`. Quick-menu entry "Chưa đồng bộ" added to `quick_menu.dart` (under "Cửa hàng & hệ thống" group).

## Logic & flow

**Outbox pattern**: every Group A write calls `Outbox.them()` to persist the intent in SQLite, then immediately patches the local cache (`vaTamThoi` / `themTamThoi`) so the UI reflects the change without waiting for a round-trip. The `SyncNotifier` worker picks up outbox entries and replays them against the server in FIFO order.

**Conflict resolution** (same as planned in `KE-HOACH-DONG-BO-OFFLINE.md`):
- Most operations: Last-Write-Wins by server timestamp.
- `printItem.setStatus`: server enforces "only forward" (cannot regress from `done` → `printing`).
- `store.adjustStock`: server applies the delta additively, not as an absolute set.

**Offline ScanResult construction** (`inventory.scanSpool`): the repository reads the spool record from the local `cache_ban_ghi` table and joins its filament via `filamentId`, then builds a `ScanResult` locally so the scan confirmation dialog can display without a network call. If the spool is not cached yet (rare), it falls back to an API call.

**store.adjustStock delta for `StockAction.set`**: computed as `targetAmount - cachedCurrentQty`. This is a best-effort approximation; if two devices do a "set" simultaneously the server will receive two deltas that may not cancel cleanly — acceptable for this use case because stock adjustments are infrequent and reconciled daily.

## Behaviour & impact

- Workers scanning bulk runs, marking print items done, or adjusting store stock can now do so while offline. Actions are queued and synced when connectivity is restored.
- The sync status bar is always visible to the user when there is something pending or rejected — no need to proactively open a settings screen.
- Rejected actions are surfaced explicitly; the app never silently discards them.
- No database migrations required — the outbox and cache tables already existed from Steps 1-5.

## Tests

- `flutter analyze --no-pub`: 4 pre-existing `info`-level warnings in `scan_router.dart` (not introduced by this change). No warnings or errors in new code.
- `flutter test --no-pub`: 54 tests pass (all pre-existing; no new unit tests added for UI-only changes in Steps 7-8).
- `flutter build apk --release`: started; exit code 0 (Gradle task `assembleRelease` completed successfully).
