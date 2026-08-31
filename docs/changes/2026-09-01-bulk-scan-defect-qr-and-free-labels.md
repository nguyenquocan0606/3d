# Bulk run scanning: scan-to-switch, printer-tag check-out, numeric defect QRs

Three related changes, all driven by the same complaint: chotting a PEI sheet on the
shop floor still required touching the screen.

## 1. Bulk (SLL) run sheet keeps listening to the scanner

**Files:** `mobile/lib/features/bulk/bulk_run_sheet.dart`,
`mobile/lib/features/bulk/bulk_scan.dart`, `mobile/lib/core/scan/code_normalizer.dart`,
`mobile/lib/core/scan/scan_router.dart`

### Why

Scanning a run barcode opens the run sheet. That sheet only accepted a printer tag, and
only while the run was still `pending`. Anything else scanned there was refused, so an
operator holding a stack of trays had to close the sheet and re-scan for every tray, and
the defect count still had to be typed on the phone keyboard.

### Logic & flow

The sheet's `PdaScanScope` is now enabled for every run status, and one handler
(`_quetMa`) routes whatever comes in:

| Scanned | Run is `pending` | Run is `printing` |
|---|---|---|
| Printer tag | check-in on that printer (unchanged) | **check-out with 0 defects** |
| Numeric QR `CMD-LOI-n` | refused — nothing to close yet | **check-out with n defects** |
| Another run barcode | sheet switches to that run | sheet switches to that run |

A completed run refuses both scans and says so; an unknown code is refused with the
three accepted kinds named. `n` is rejected when it exceeds the tray's piece count.
Switching runs re-renders the sheet in place (`setState`) instead of popping — the
status, the printer, the piece count and the buttons all follow the new run.

`ScanCommands` gained `defectPrefix` (`CMD-LOI-`), `maxDefectNumber` (30), `defect(n)`
and `defectQuantityOf(code)`. Classification is unchanged: `CMD-LOI-7` is still a plain
`ScanKind.command`, so a numeric QR scanned outside a run sheet lands in
`ScanRouter._runCommand`, which now explains where it *is* useful instead of saying the
command is unsupported.

The "how many are defective?" bottom sheet also accepts a numeric QR now. On PDA devices
its number field no longer autofocuses — a focused text field swallows scanner keystrokes
before `PdaScanScope` sees them, which would have made the QR sheet useless there. Phones
(camera mode) keep the autofocus and the keyboard.

## 2. Bulk run labels no longer overflow, and show their own number

**Files:** `src/utils/tspl-printer.ts`, `src/utils/tests/tspl-printer.test.ts`

### Why

`buildOrderBarcodeTSPLCommand` measured font `"3"` as 12 dots wide when the XPrinter
firmware font is 16, and centred the third line with that wrong number. On SLL labels
(`<printer> PEI <n> - <qty> con`) the line ran past the 320-dot edge and the printer
simply cut it off. The barcode digits were not printed at all, so a smudged label could
not be read back by hand.

### Logic & flow

The builder now works from real font metrics (`FONT_METRICS`, 8×12 / 12×20 / 16×24 /
24×32 / 32×48) and lays the label out top-down within 320×240:

- product name — font `"3"`, wrapped to at most 2 lines at the real character width,
  each line centred;
- Code 128 barcode, centred, its width computed from the module count
  (`11 × (len + 2) + 13`); if that does not fit at narrow=2 it drops to narrow=1 rather
  than being clipped — a clipped barcode is an unscannable barcode;
- **the barcode's own digits**, font `"2"` (small), centred right under the bars;
- the description line — font `"2"`, wrapped to at most 2 lines, centred.

Barcode height is whatever vertical space is left after the text blocks are reserved,
clamped to 40–88 dots.

Both the web (`bulk-production-tab.tsx`, `orders-tab.tsx`) and the app print through
`POST /api/print-jobs/batch`, so both get the new layout with no client change.

## 3. Free-form label printing in the Flutter app

**Files:** `mobile/lib/features/labels/custom_label.dart` (new),
`mobile/lib/features/labels/labels_screen.dart`,
`mobile/lib/data/repositories/label_repository.dart`

### Why

The desktop "In Tem" tab can print any text in any of four layouts, with Vietnamese
diacritics, because it renders the label on a canvas and ships a bitmap. The app's
"Tự nhập" source only sent three lines through the TSPL text path — one fixed layout, no
diacritics, no font size, no copies.

### Logic & flow

`custom_label.dart` ports the web renderer to a Flutter canvas: the same 320×240 label,
the same four templates (`qr-text`, `barcode-text`, `text-only`, `qr-large`), the same
font-size ladder (14/20/28/160/320 px, capped at 40 px for templates containing a code),
and the same 1-bit packing (40 bytes per row, MSB first, **bit 0 = burn**). QR modules
come from `qr_flutter`'s `QrPainter`, Code 128 from the `barcode` package.

`LabelRepository.printCustomLabel()` posts the base64 bitmap to the existing
`POST /api/print-jobs/custom` — the same endpoint the web uses, no backend change.

In the labels screen the source formerly called "Tự nhập" is now "In tự do" and shows
template chips, font-size chips, a 1–20 copies stepper, and the three text fields (plus
the code field for templates that have one). The preview is drawn by the *same*
`paintCustomLabel()` used for printing, so what is on screen is what comes out.

Every other label source (spool, colour, location, printer, AMS slot, PEI sheet) still
goes through the unchanged TSPL path — reprints must keep matching the labels already
stuck on the shelves.

## 4. The numeric QR sheet

**Files:** `mobile/lib/features/labels/defect_qr_tab.dart` (new),
`mobile/lib/features/labels/qr_commands_screen.dart`

A third tab on the "QR lệnh" screen lists `CMD-LOI-1` … `CMD-LOI-30` and exports them as
a single A4 page (5×6 grid, one QR + the number per cell) through the OS print dialog, or
saves/shares the PDF. Text inside the PDF is written without diacritics: the PDF library's
built-in fonts are Latin-1 only, and bundling a Vietnamese font just for this sheet is not
worth the app size — the same trade-off the TSPL labels already make.

New dependencies: `pdf`, `printing`, `barcode`.

## Behaviour & impact

- No database or API change; no migration.
- Existing scans keep working: run barcode → sheet, printer tag on a pending run →
  check-in, the "Chốt in xong" button → still asks for the defect count.
- Labels printed from now on use the new layout. Labels already stuck on trays keep
  scanning fine — the barcode content did not change.

## Verification

- `npx tsc --noEmit` — clean.
- `npx vitest run` — all pass, including 5 new cases pinning the barcode label inside
  320×240 for long names and long codes.
- `flutter analyze` — no new issues (4 pre-existing `use_build_context_synchronously`).
- `flutter test` — all pass, including 9 new cases for the numeric-QR parsing and for the
  custom-label bitmap (9600 bytes for every template, blank label stays all-white).
- `flutter build apk --debug` — succeeds with the three new packages.
