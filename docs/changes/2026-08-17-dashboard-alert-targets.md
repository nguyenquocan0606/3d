# Dashboard alerts: fix navigation targets that pointed nowhere

## What changed

Backend (`src/services/dashboard.service.ts`) and one web component
(`src/components/Dashboard/khoi-canh-bao.tsx`).

The `dichDen` field each alert carries — where tapping it should take you — held route
names that did not exist on either client. Corrected app routes against
`mobile/lib/core/routes.dart` and web targets against the `TabKey` union in
`src/app/page.tsx`:

| Alert | Was | Now |
|---|---|---|
| C3 stuck bulk run | `/bulk` | `/bulk-orders` |
| C8, C9, C11 eShop | `/eshop` | empty (no eShop list screen exists in the app) |
| C12 rejected sync actions | `/sync-actions` | `/pending-sync` |
| C13 push delivery failed | `/notifications` | `/printer-events` |
| C15, C16 Zalo | `/zalo` | empty (Zalo is web-only) |
| C17 inventory (web) | `inventory` | `check-inventory` |
| C19 PEI (web) | `pei-sheets` | `production` |
| C20 stale orders | `/orders` | `/production` |

C12's web target is deliberately empty: the web has no screen for rejected sync actions,
and the previous mapping sent the user to the Production tab, which shows nothing about
them. The alert card already lists the device and the rejection reason inline.

C14 ("no device registered for push") previously reported `soLuong: 0`, so the card
rendered a "0" badge next to an active warning. It now reports 1 — the count is how many
things need attention, not how many devices exist — and carries a detail line explaining
the consequence.

## Logic & flow

Nothing about how alerts are computed changed; only where they lead. The Flutter client had
already worked around the C12 mismatch by hardcoding the route before consulting the map,
so the fix removes the reason for that workaround rather than the workaround itself (it
stays as a harmless fallback).

Targets that have no destination are now empty strings rather than plausible-looking but
non-existent paths, so a client can decide not to make the card tappable instead of
navigating somewhere unhelpful.

## Behaviour & impact

Read-only alerts, no data touched. Tapping an alert now lands on the right screen; alerts
with no destination are inert instead of misleading.

Also removed in the same pass: the dead `stats` state and the `fetch('/api/dashboard/stats')`
call in `src/app/page.tsx`, left over after the Overview tab began fetching its own data.
The endpoint itself stays for the Flutter app.

## Tests

- `npx tsc --noEmit` — clean
- `npx eslint` on the changed files — clean
- Every alert returned by the live `/api/dashboard/canh-bao` was checked programmatically
  against the real route list and tab union; all 10 currently-firing alerts resolve
- `npm test` — 98/99. The one failure is in `src/utils/tests/bulk-production.test.ts`
  (bulk resplit logic), unrelated to this change and in a file being edited concurrently
