# Zalo: restart the worker (and reconnect a single account) from the web

## What changed

Worker (`scripts/zalo-worker.mjs`), the web bridge to it (`src/services/zalo.service.ts`,
`src/app/api/zalo/status/route.ts`) and the Zalo tab (`src/components/Zalo/zalo-tab.tsx`).

Until now the only recovery path when the Zalo worker hung was to SSH into the server and
run `docker compose up -d zalo-worker` — the web just printed that command in red text.
Two buttons now do it from the browser:

| Button | Where | What it does |
|---|---|---|
| Kết nối lại (`RotateCcw`) | on each account card, when the account has a saved session | Stops that account's listener and logs it back in with the stored cookie. Other accounts keep running. |
| Khởi động lại worker (`Power`) | account toolbar, next to Làm mới | Asks the worker to exit; Docker's `restart: unless-stopped` brings the process back and every account re-logs in from its saved session. |

Two new worker endpoints back them: `POST /ket-noi-lai` (needs `accountId`) and
`POST /khoi-dong-lai`. Both go through the existing token-protected control port, so the
web still never talks to Zalo directly.

New account state `dang_ket_noi` ("Đang kết nối lại...") so the card shows what is
happening during a reconnect. It is a value of the existing free-text `trangThai` column —
the Prisma comment listing the possible values was updated, no migration.

## Logic & flow

Restarting by **self-exit** rather than by having Next run `docker compose` on the host:
the Next app would have needed shell access and a docker group membership, and its API has
no authentication, so that would have put "run a command on the server" behind an
unauthenticated LAN endpoint. Exiting works because the container already has a restart
policy.

That choice has one consequence worth stating: the restart button only works while the
worker still answers HTTP. A worker that is truly dead cannot be revived this way — but
Docker is already restarting it in that case, and if it stays down the problem needs the
server logs anyway. The button is for the "alive but stuck" case, which is the common one.

Two guards on `/khoi-dong-lai`:

- If `/.dockerenv` is absent the worker refuses. Run by hand with `node
  scripts/zalo-worker.mjs`, exiting would kill Zalo for good with nobody to restart it.
- If `process.uptime()` is under 30 s it refuses with a 429. Each restart re-logins every
  account, and repeated logins are what gets Zalo accounts locked. Uptime works as the
  debounce precisely because a restart resets it — no state to persist.

The response is written before the process exits (`res.on('finish')`), otherwise the
browser sees a dropped connection and reports a failure for a restart that did work.

`ket-noi-lai` refuses while that account is mid-QR-scan or already reconnecting, and
reports "phiên đã lưu không dùng được nữa" when the stored cookie has expired — that case
needs a QR scan, not another reconnect.

After a restart the UI waits 10 s and then refetches, because the poll would otherwise sit
on "worker chưa chạy" for a beat while the container comes back.

## Behaviour & impact

No data touched. During a full restart the shop receives no Zalo messages for a few
seconds; messages sent to Zalo in that window arrive once the session is back (Zalo queues
them server-side), so the confirm dialog steers the user to the per-account reconnect when
only one account is broken.

Deploying needs the worker image rebuilt (`docker compose up -d --build zalo-worker`) —
the old container has no `/ket-noi-lai` or `/khoi-dong-lai`, and both buttons would report
"Không có endpoint này" against it.

## Tests

- `node --check scripts/zalo-worker.mjs` — clean
- `npx tsc --noEmit` — clean
- `npx eslint` on the three changed web files — clean
- Not yet exercised against a live worker: the running container predates this change, so
  the endpoints only exist after a rebuild
