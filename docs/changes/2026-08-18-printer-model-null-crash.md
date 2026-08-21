# Saving a printer with an empty Model no longer fails with a 400

## What changed

Editing a printer from the "Quản Lý Máy In" modal failed with `Cannot read properties of null
(reading 'trim')` and `PUT /api/printers/[id] 400` whenever the **Model** field was left empty.

The modal deliberately sends `model: null` to mean "this printer has no model" — an empty string
would not distinguish "clear it" from "don't touch it". `PrinterService.updatePrinter` guarded that
field with `data.model !== undefined` and then called `.trim()` on it, so `null` passed the guard
and crashed on the very next call. The thrown message was caught by the service's own `try/catch`,
returned as `result.error`, and surfaced to the user as a red banner.

Files:

- `src/services/printer.service.ts` — `updatePrinter` accepts `model?: string | null` and uses
  `data.model?.trim() || null`
- `src/services/tests/printer.service.test.ts` — new

## Logic & flow

The three states of the `model` field are now all distinct and all reachable:

| Payload | Result |
| --- | --- |
| `model` absent | `undefined` → Prisma leaves the existing model alone |
| `model: null` or `''` or `'   '` | `null` → model is cleared |
| `model: '  A1 mini '` | `'A1 mini'` → trimmed and saved |

Only the second row changed behaviour; it used to throw instead of clearing.

## Behaviour & impact

- Printers without a model (the common case for the ones added by QR scan) can be renamed again.
- No data was corrupted by the bug — the request failed before Prisma was reached, so the printer
  simply kept its previous name.
- The mobile app was never affected: `PrinterRepository.updatePrinter` runs its body through
  `compact()`, which drops null fields, so it lands in the first row of the table above. As a
  consequence the app still cannot *clear* a model, only change it — unchanged, out of scope here.

## Tests

- `npx vitest run src/services/tests/printer.service.test.ts` — 4 passed, all new. Verified they
  fail against the pre-fix code (the `model: null` case errored out) and pass after.
- `npx tsc --noEmit` clean.
- Full `npx vitest run` — 118 passed, 1 pre-existing failure in
  `src/utils/tests/bulk-production.test.ts` ("mâm lẻ cuối và lượt in bù không bị sửa theo sức chứa
  mới") from uncommitted work on the re-split feature. Unrelated to this change and untouched.
