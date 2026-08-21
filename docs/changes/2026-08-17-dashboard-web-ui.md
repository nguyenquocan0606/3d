# Dashboard web UI — full system overview replaces the 5-tile filament summary

## What changed

Web only. The Overview tab used to be five filament counters plus a "Coming Soon"
banner; it is now a full operations dashboard fed by the new `/api/dashboard/*`
endpoints (see `2026-08-17-dashboard-backend.md`).

New components under `src/components/Dashboard/`:

- `dashboard-tab.tsx` — rewritten: shell, period filter (today / 7d / 30d), auto refresh
- `khoi-canh-bao.tsx` — alert block (tier 1)
- `khoi-kpi.tsx` — six headline tiles
- `khoi-san-xuat.tsx` — running bulk orders and in-flight PEI runs
- `khoi-may-in.tsx` — printer grid, polls the existing `/api/printers/cloud/status`
- `khoi-xu-huong.tsx`, `bieu-do-cot.tsx`, `bieu-do-duong.tsx` — 30-day charts, hand-written SVG
- `khoi-hoat-dong.tsx` — recent activity feed

`src/app/page.tsx`: `DashboardTab` no longer receives a `stats` prop; it now gets a
`setActiveTab` callback so tiles can navigate. The page-level `fetch('/api/dashboard/stats')`
and its `stats` state were removed — the Overview tab fetches its own data, and that legacy
endpoint stays alive only for the Flutter app.

## Logic & flow

Information is ordered by urgency, not by data model: alerts that need action today, then
what is running right now, then 30-day trends. The old tab showed only static filament
counts, so a printer that had been erroring for two hours was invisible.

Each block owns its own refresh cycle rather than sharing one payload: alerts 30s,
overview 60s, trends 5 min, printers 15s. Printer status is deliberately a separate request
because it goes out to Home Assistant and can hang; folding it into the main payload would
make one slow integration stall the whole page. All polling stops while `document.hidden`.

Charts are plain SVG — no chart library was added, keeping the dependency list as it is.
Days with no production render as gaps rather than zero, because "0% defects" and "nothing
was produced" are different facts.

## Behaviour & impact

Read-only: the dashboard issues no writes, so existing data is untouched. One fewer request
per page load now that the legacy stats fetch is gone. Metrics whose accuracy is known to be
limited (see §10 of `KE-HOACH-DASHBOARD.md`) are annotated in place instead of being shown
as plain numbers.

## Tests

- `npx tsc --noEmit` — clean
- `npx eslint` on all dashboard files and `src/app/page.tsx` — no new findings (three
  pre-existing errors remain in unrelated eShop-picking and colour-helper code in `page.tsx`)
- `npx next build` — succeeded
- Endpoints exercised against the live database; `xu-huong` confirmed to return
  `tiLeLoi: null` on non-production days and to include empty days in the series

Not yet done: the page has not been opened in a browser. Click-through targets, chart
rendering and the period filter are verified by build and API shape only.
