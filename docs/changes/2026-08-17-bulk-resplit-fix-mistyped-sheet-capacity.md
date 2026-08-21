# Re-split can also correct sheets that were already printed

Follow-up to `2026-08-17-bulk-order-resplit-keeps-progress.md`.

## What changed

Re-splitting a bulk order now has an opt-out checkbox **"Sửa cả các mâm đã in"** (checked by
default). It covers the common case of a typo: printer A was entered as 34 pieces per PEI sheet
when the sheet actually holds 35. Without it the already-printed sheets keep the wrong number and
the order total no longer adds up.

Files:

- `src/utils/bulk-production.ts` — `chiaLaiGiuTienDo(..., suaLuotDaChay = true)`, plan gains
  `suaDaChay: { id, quantity, quantityCu }[]`
- `src/services/bulk-run.service.ts` — `chuanBiChiaLai(runs, input, suaLuotDaChay = true)`
- `src/app/api/bulk-orders/[id]/route.ts` — accepts `suaLuotDaChay` (defaults to true when the
  field is absent) and updates the affected locked runs' `quantity`
- `src/components/Orders/bulk-production-tab.tsx` — checkbox, preview and confirm text
- `mobile/lib/data/models/bulk_order.dart`, `mobile/lib/data/repositories/bulk_repository.dart`,
  `mobile/lib/features/bulk/edit_bulk_order_sheet.dart` — same option in the app
- Tests: `src/utils/tests/bulk-production.test.ts`, `mobile/test/bulk_production_test.dart`

## Logic & flow

When the option is on, before anything else is computed:

1. The **old** sheet capacity of each printer is derived from the runs themselves — the largest
   non-rework run quantity on that printer (the last run of a printer may be a partial sheet).
2. A locked run (already scanned) is rewritten to the **new** capacity only if all of these hold:
   it is not a rework run, its printer is still in the order, and its quantity equals the old
   capacity — i.e. it was a *full* sheet. Partial last sheets and rework runs are left alone
   because their size never came from the capacity setting.
3. Only `quantity` changes on those runs. Barcode, printer, PEI index, start/finish timestamps and
   defect count stay exactly as they were.
4. The corrected quantities are then used as the locked total, so the remaining quantity to split
   is computed from the fixed numbers.

With the option off, the previous behaviour applies: locked runs are completely untouched.

## Behaviour & impact

- Fixing a mistyped capacity now repairs history instead of leaving the order permanently off by
  a few pieces per sheet.
- Both web and mobile preview the concrete change ("2 mâm: 34 → 35 con") next to the checkbox
  before anything is written.
- Turning it off is the right choice when the old sheets genuinely ran with the old number and
  only future sheets should use the new capacity.
- Defect counts are never rescaled — if a sheet shrinks below its recorded defect count, good
  output for that run simply floors at 0, same rule as elsewhere.

## Tests

- `npx vitest run` — 97 passed, 3 new cases (correction applied, option off, partial sheet and
  rework runs excluded).
- `flutter test` — 50 passed, 2 new cases mirroring the web ones.
- `npx tsc --noEmit` clean; `flutter analyze` unchanged at the 5 pre-existing infos.
