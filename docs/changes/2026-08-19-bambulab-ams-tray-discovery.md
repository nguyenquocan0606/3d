# AMS colors now load for A2L and A1_2

## What changed

Two of the four Bambu printers showed no filament colors at all on their cloud card. Same symptom,
two unrelated causes — both traced to `sensor.<prefix>_ams_1_tray_<i>`, the entity id the provider
hard-coded when reading Home Assistant.

**A2L** does have an AMS, but Home Assistant exposes it as `ams_17`, not `ams_1`:

```
sensor.a2l_26a19a01b672201572_ams_17_tray_1   Generic PETG       #FFF144FF
sensor.a2l_26a19a01b672201572_ams_17_tray_2   Bambu PETG Basic   #4F2C1DFF
sensor.a2l_26a19a01b672201572_ams_17_tray_3   Bambu PETG Basic   #D6001CFF
sensor.a2l_26a19a01b672201572_ams_17_tray_4   Generic PETG       #057748FF
```

`ha-bambulab` names the AMS entities after the unit id the printer reports, so the number is not a
1-based counter and cannot be assumed. The lookup missed every tray and pushed four nulls.

**A1_2** has no AMS at all — it has no `ams_*` entity of any number. It feeds from the external
spool (`sensor.a1_039299660300203_externalspool_external_spool`, "Generic PETG", `#FFFFFFFF`),
which the provider never looked at.

Files:

- `src/services/printer-integration/providers/bambulab/BambuLabProvider.ts` — new `timKhayAms()`
  (discovers trays by regex), `docKhay()` (entity → name + color), `layKhayAms()` (fetch + discover
  for commands outside the polling loop); `HaEntity` type replaces `any` in the new code
- `src/services/tests/bambulab-ams.test.ts` — new

## Logic & flow

Trays are discovered instead of guessed. `timKhayAms()` matches
`^sensor\.<prefix>_ams_(\d+)_tray_(\d+)$` against the polled states and sorts by (unit, tray), so:

- any AMS numbering works — `ams_1`, `ams_17`, whatever the printer reports;
- multiple AMS units flatten in order, putting slot 5 on unit 2's first tray;
- the anchored pattern stops one printer from picking up another's trays when a prefix is a prefix
  of another (`a1` vs `a1_2`) — the old `includes()` filter alone would not have.

If no AMS tray is found, the external spool becomes slot 1. Printers **with** an AMS deliberately
ignore the external spool: appending it would shift every slot number and break the `printerSlot`
each spool is assigned to in inventory.

Empty / `unknown` / `unavailable` trays still yield `null` so slot positions stay put, and the
alpha channel is still trimmed (`#C52C18FF` → `#C52C18`) — unchanged, just moved into `docKhay()`.

The same hard-coded `ams_1` was in the `sync-ams` command, which pushes spool data back to the
printer. On A2L it was POSTing to an entity that does not exist, so syncing could only ever fail.
It now resolves trays the same way; a slot with no matching tray is logged and skipped rather than
sent into the void.

## Behaviour & impact

Verified against the live Home Assistant at `192.168.99.166:8123`, all four printers:

| Printer | Before | After |
| --- | --- | --- |
| BambuLab A1 (`ams_1`) | 4 colors | 4 colors — unchanged |
| BambuLab P1S-1 (`ams_1`) | 4 colors | 4 colors — unchanged |
| A2L (`ams_17`) | nothing | `#FFF144 #4F2C1D #D6001C #057748` |
| A1_2 (no AMS) | nothing | `#FFFFFF` in slot 1 |

The two printers that already worked produce byte-identical output, so this is additive.

Worth knowing: A1_2 now occupies one slot rather than four. That is what the machine physically
is, but any spool already assigned to slots 2–4 of that printer in inventory will no longer line up
with a live tray. Nothing was migrated — flag it if those assignments exist and should be cleaned.

## Tests

- `npx vitest run src/services/tests/bambulab-ams.test.ts` — 6 passed, all new. Fixtures copy the
  real entity shapes: `ams_17`, no-AMS-external-spool, AMS-plus-external-spool, empty trays,
  two AMS units out of order, and the `a1` / `a1_2` prefix collision.
- Live check: ran `updatePrinterStatus` over a real `/api/states` snapshot for all four printers,
  results in the table above.
- `npx tsc --noEmit` clean. `npx eslint` on the touched files: 7 pre-existing `no-explicit-any`
  errors → 6 (the new code adds none and removes one).
- Full `npx vitest run` — 124 passed, 1 pre-existing failure in `src/utils/tests/bulk-production.test.ts`
  ("mâm lẻ cuối và lượt in bù không bị sửa theo sức chứa mới") from uncommitted work on the re-split
  feature. Unrelated and untouched.
