# eShop Open Platform — the real token flow, replacing the guesswork

## What changed

Web only, inside the `eShop API test` section. MISA has since published the `Token` group in its
documentation page, so the token endpoint no longer has to be guessed at.

- `scripts/build-eshop-openapi-spec.mjs` — `docMang` now merges **every** `push` of `menuData` /
  `endpointsData`, not just the first one
- `src/config/eshop-open-api-spec.json` — regenerated: 11 groups / 28 endpoints (was 10 / 26)
- `src/services/eshop-open-api.service.ts` — `layTokenOpenApi`, `lamMoiTokenOpenApi`,
  `kyDangNhapOpenApi`, and the `auth-platform` base URL; the probing machinery
  (`DUONG_DAN_TOKEN_DO_THU`, `doEndpointToken`, `timAccessToken`) is gone. The `OpenApi` suffix is
  deliberate: `misa-login.service.ts` already exports a `lamMoiTokenEshop`, and that one renews the
  *web session* token of a completely different auth path
- `src/app/api/eshop-api-test/token/route.ts` — new; replaces `token/probe/route.ts`, which is deleted
- `src/app/api/eshop-api-test/request/route.ts` — dropped the `layToken` flag that fed the old
  token-sniffing helper
- `src/app/api/eshop-api-test/spec/route.ts` — `macDinh` now carries `authUrl` instead of the list of
  candidate token paths
- `src/components/Eshop/eshop-api-test-console.tsx` — the auth panel loses the editable token path and
  body template, and gains an auth base URL, a "Làm mới token" button, and the token expiry

## Logic & flow

**What the documentation actually says.** The page at `/api/platform/documents/html` splits its data
across several `push` calls, and MISA put the new `Token` group in its own call, ahead of the business
groups. The build script only read the first array it found — which is why the group was missing
before, and why, once it appeared, that same script would have kept the Token group and silently
dropped all 26 business endpoints. Reading every push fixes both directions.

**Getting a token.** `POST https://eshopapp.misa.vn/api/auth-platform/tokens/create` — note the base
URL is `auth-platform`, not the `platform` the business endpoints use. The body is flat:

    { "app_id": "…", "login_time": 1787043318475, "sign": "…" }

`login_time` is a Unix timestamp in **milliseconds**, UTC. `sign` is HMAC-SHA256 of the string
`app_id:{app_id};login_time:{login_time}`, salted with the App Key, emitted as lowercase hex. The App
Key itself is never transmitted — it only signs, and it signs server-side, so it never reaches the
browser either. The response is `OpenAuthResponse`: `Status { Success, ErrorCode, Message }` plus
`Data { token, refresh_token, expires_in, token_type }`. `Data.token` is what goes into
`Authorization: Bearer …`.

`POST …/tokens/refresh-token` takes `{ token, refresh_token }` and returns the same shape.

Two things the documentation does not mention, both established by calling the live gateway:

- The auth gateway answers **HTTP 200 even on failure** — a wrong App ID returns
  `Status.ErrorCode 1300, "Không tìm thấy thông tin app_id"`. Reading `response.ok` would report
  success for every rejection, so `docPhanHoiToken` keys off `Status.Success` and the presence of a
  token instead.
- No token lifetime is stated anywhere in the page. `expires_in` is typed `DateTime` and described as
  "Thời điểm chuỗi token hết hạn", so despite the name it is an absolute moment, not a duration in
  seconds — the console shows it verbatim rather than computing a countdown from a wrong assumption.
- `tokens/refresh-token` answers **HTTP 204 with an empty body** when the token pair is no longer
  valid — there is no `Status` object at all to read a reason from. The console says so explicitly
  rather than showing an empty error.

Wrapping the body in the parameter name the docs print (`loginParam`) is rejected with
`ErrorCode 1000 — Tham số không hợp lệ`; the flat shape is the correct one, and a test locks it in.

**Masking.** The signature is derived from the App Key, and the refresh call sends the token pair in
the body, so both are masked in the request snapshot returned to the UI — the same treatment the App
Key already got in headers, and for the same reason: that pane is meant to be copied and pasted.

**What went away.** With the path documented there is nothing left to probe, so the 12-paths x 4-body-
styles sweep, its route, and the recursive `access_token` sniffer are deleted. The unknowns they
existed to work around no longer exist.

## Behaviour & impact

`eShop API test` only. The IP allow-list caveat still holds — MISA requires the calling server's IP to
be registered under Ứng dụng → Open API, and requests leave from the web server, not the tester's
browser. Nothing about eShop syncing, orders, or the stored MISA credentials changed.

Anyone who used the console before will find their saved config missing `tokenPath` / `tokenBody`;
those fields are simply ignored, and `authUrl` falls back to the documented default.

## Tests

- `npx vitest run src/services/tests/eshop-open-api.test.ts` — 16 tests. New: the signature is
  lowercase hex of the documented string, the body is exactly `{app_id, login_time, sign}` with no
  wrapper, the App Key never appears in what is sent, `Status.Success=false` over HTTP 200 counts as
  failure with `ErrorCode` preserved, refresh sends `{token, refresh_token}` and masks both, and the
  spec still contains the `Token` group pointing at `auth-platform` (the regression the build-script
  bug would cause)
- `npx tsc --noEmit` and `npx eslint` on the changed files — clean
- Live against MISA, through the new service functions with placeholder credentials:
  `tokens/create` → HTTP 200 `ErrorCode 1300 — Không tìm thấy thông tin app_id` with the signature
  masked in the snapshot; `tokens/refresh-token` → HTTP 204 empty. Both confirm the paths, the body
  shapes, and that the gateway is reachable from this server
- Not verified: a successful token issue — that needs real App ID / App Key from the eShop connection
  screen, plus this server's IP on that connection's allow-list
