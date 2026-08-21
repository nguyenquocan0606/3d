# Bulk order re-split now keeps finished work

## What changed

Editing a bulk order (SLL) — changing total quantity, per-sheet (PEI) capacity, or the printers —
used to wipe every run of the order and issue brand-new barcodes. All check-in / check-out
timestamps and defect counts were lost and every printed label became garbage.

Re-splitting is now **incremental**: finished work is untouched, only the not-yet-started part is
recomputed, and existing barcodes are reused.

Files:

- `src/utils/bulk-production.ts` — new pure planner `chiaLaiGiuTienDo()` (+ `LuotDaCo`,
  `KeHoachChiaLai` types)
- `src/services/bulk-run.service.ts` — new `chuanBiChiaLai()`; printer lookup extracted into
  shared `layMayVaSucChua()`
- `src/app/api/bulk-orders/[id]/route.ts` — `PATCH` applies the plan instead of delete-all +
  create-all; `DELETE` tombstone write was unreachable (dead code after `return`) and is now fixed
- `src/components/Orders/bulk-production-tab.tsx` — preview, warning copy and confirm dialog
- `mobile/lib/data/models/bulk_order.dart` — Dart port `chiaLaiGiuTienDo()` + `ResplitPlan`
- `mobile/lib/features/bulk/edit_bulk_order_sheet.dart` — same preview / copy changes
- Tests: `src/utils/tests/bulk-production.test.ts`, `mobile/test/bulk_production_test.dart`

## Logic & flow

Given the order's current runs and the new split parameters:

1. **Locked runs** = runs that are not `pending` (already scanned: `printing` / `completed`) plus
   every rework run. Their printer, quantity, PEI index, timestamps and defect counts are never
   touched.
2. **Remaining quantity** = `newTotal - sum(quantity of locked non-rework runs)`, floored at 0.
   Rework runs do not count against the order total (they cover defects, same rule as before).
3. The remaining quantity is split round-robin over the newly chosen printers with the new
   per-printer sheet capacities (`chiaLuotInTheoMay`, unchanged). `seq` continues after the highest
   locked `seq`; `peiIndex` continues after the highest existing PEI index **on that printer**, so
   the numbering does not collide with sheets already taped to the machine.
4. The resulting slots are zipped onto the existing `pending` runs **in `seq` order**:
   - slot ≤ available pending run → that run is updated in place, **barcode kept**;
   - more slots than pending runs → new runs get freshly generated barcodes;
   - fewer slots than pending runs → the surplus pending runs are deleted **from the end**.
5. Order status is recomputed from the remaining runs via `trangThaiDon()` instead of being forced
   back to `pending`, and deleted runs now get sync tombstones (`ghiBiaMo('bulkRuns', …)`) so
   offline mobile clients drop them too.

The API contract of `PATCH /api/bulk-orders/[id]` is unchanged (`totalQuantity`, `perSheetQty`,
`printerIds`, `printerLimits`); only its semantics changed, so the mobile app needed no repository
changes.

## Behaviour & impact

- A running order can now be re-planned mid-flight: printed sheets already scanned stay recorded.
- Labels of reused barcodes still scan correctly, but the human-readable PEI number / quantity
  printed on them may now be stale — both web and mobile warn about reprinting those.
- Only genuinely new runs require new labels; the confirm dialog and preview state exactly how many
  runs are kept, recomputed, added and deleted.
- If the new total is lower than what is already produced, all pending runs are deleted and nothing
  is added; locked runs and the order history stay intact.

## Tests

- `npx vitest run` — 86 passed, including 5 new cases for `chiaLaiGiuTienDo` (capacity change,
  shrink, total below locked quantity, rework handling, printer swap).
- `flutter test test/bulk_production_test.dart` — 13 passed, 3 new cases mirroring the web ones.
- `npx tsc --noEmit` clean; `flutter analyze` shows only the 5 pre-existing infos.
