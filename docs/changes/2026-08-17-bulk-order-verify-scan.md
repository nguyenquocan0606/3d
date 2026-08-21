# Bulk orders: second-pass scan to verify finished sheets

## Why

A bulk (SLL) order was considered done as soon as every PEI sheet had been checked
out. Nothing let the operator walk back over the finished sheets and confirm the
goods physically exist before handing them to the customer — the only "verified"
number was the one typed at check-out time.

## What changed

A run now carries a third scan: **start printing → finished printing → verified**.

### Database

- `BulkRun.verifiedAt` (nullable) — the moment someone re-scanned the sheet label
  during the verification pass. `null` means not verified yet.
  Migration: `prisma/migrations/20260817093716_bulk_run_verify`.

### Backend

- `src/services/sync.service.ts`: new offline action `bulkRun.verify`. It only
  accepts runs already in `completed` state, and is idempotent — re-scanning a
  verified sheet keeps the original timestamp, because that first scan is when the
  sheet was actually counted. Registered in `BO_XU_LY` and in `BANG_ANH_HUONG`
  (affects `bulkRuns`).
- `PATCH /api/bulk-runs/[id]`: accepts `verifiedAt` (used to undo a mistaken tick)
  and clears it automatically whenever the run is moved away from `completed` — an
  un-finished sheet cannot stay "verified".

### Flutter app

- `BulkRun.verifiedAt` / `isVerified` / `copyWith`, plus order-level aggregates
  `runsToVerify`, `verifiedRuns`, `verifiedQuantity`, `verifyProgress`
  (`mobile/lib/data/models/bulk_order.dart`).
- `BulkRepository.verifyRun()` goes through the **offline outbox** like the other
  two run scans, with an optimistic cache patch so the list ticks instantly.
  `BulkRepository.unverifyRun()` is online-only and patches the cache after the
  server accepts.
- New screen `mobile/lib/features/bulk/bulk_verify_screen.dart` ("Kiểm hàng đơn
  SLL"): progress card (sheets verified / sheets finished, good pieces verified),
  a continuous scanner, PDA trigger support, and the list of finished sheets with
  their verification state. Each row can also be ticked or un-ticked by hand for
  torn labels.
- Entry point: a "Kiểm hàng (x/y mâm)" button on the bulk order detail screen,
  shown once at least one sheet is finished. Finished rows on that screen now show
  `· đã kiểm`.
- Scanning an already-finished run in the normal run-scan flow now points the
  operator at the verification screen instead of just refusing.

## Notes

- Verification records **who/when a sheet was re-checked**, nothing else: defect
  counts and run status are still owned by the check-out flow.
- Sheets that have not finished printing are not listed and are rejected on scan —
  that situation means the operator is holding the wrong sheet.
- The web UI does not surface `verifiedAt` yet; it only clears it when a run is
  reset, which the existing PATCH handles.

## Verification

- `npx tsc --noEmit` — clean.
- `flutter analyze` — no new issues (2 pre-existing).
- `flutter test` — all pass, including 4 new cases for the verification aggregates
  in `mobile/test/bulk_production_test.dart`.
