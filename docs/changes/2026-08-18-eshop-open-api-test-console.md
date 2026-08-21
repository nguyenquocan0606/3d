# eShop API test — a console for the MISA eShop Open Platform API

## What changed

Web only. A new standalone section for trying out the MISA eShop Open Platform API with an
App ID / App Key, kept separate from the operational `eShop` tab.

New files:

- `scripts/build-eshop-openapi-spec.mjs` — regenerates the endpoint catalogue from MISA's docs page
- `scripts/build-mshopkeeper-openapi-spec.mjs` + `src/config/mshopkeeper-open-api-spec.json` —
  the same for the older MShopKeeper OpenPlatform docs (23 endpoints)
- `src/app/api/eshop-api-test/graphapi/login/route.ts` — signed login against the GraphAPI gateway
- `src/config/eshop-open-api-spec.json` — generated catalogue: 10 groups, 26 endpoints, full
  parameter and response trees
- `src/services/eshop-open-api.service.ts` — URL building + host allow-list, request execution,
  secret masking, token-endpoint probing, access-token extraction
- `src/app/api/eshop-api-test/spec/route.ts` — serves the catalogue (kept out of the client bundle)
- `src/app/api/eshop-api-test/request/route.ts` — performs one arbitrary call against MISA
- `src/app/api/eshop-api-test/token/probe/route.ts` — probes candidate token endpoints
- `src/components/Eshop/eshop-api-test-console.tsx` — the console UI
- `src/app/eshop-api-test/page.tsx` — page shell at `/eshop-api-test`
- `src/services/tests/eshop-open-api.test.ts` — unit tests

Changed: `src/app/page.tsx` — new sidebar entry "eShop API test" (flask icon) linking to
`/eshop-api-test`, plus the `eshop-api-test` tab key.

## Logic & flow

**Where the catalogue comes from.** MISA's documentation URL returns a static HTML page whose data
lives in inlined `menuData.push(...)` / `endpointsData.push(...)` arrays; the three data endpoints
the page mentions (`/api/menu`, `/api/sections`, `/api/endpoints`) answer 401 when called directly.
The build script therefore downloads the page and parses those two arrays into a normalised JSON
spec. Re-run it whenever MISA publishes new endpoints:

    node scripts/build-eshop-openapi-spec.mjs

**Why calls go through our server.** `eshopapp.misa.vn` sends no CORS headers, so a browser fetch
would be blocked, and the App Key should not sit in another user's Network tab. The console posts to
`/api/eshop-api-test/request`, which calls MISA and returns status, headers, body, and elapsed time
verbatim — including 4xx responses, because seeing the failure is the point of a test tool. The
route only accepts hosts under `misa.vn` / `misacdn.net` so it cannot be used as an open proxy.

**Authentication.** The documentation states that every business endpoint needs
`Authorization: Bearer {access_token}` and points at `Menu/token/GeneralToken` / `RefreshToken` for
obtaining one — but that menu section is not included in the published page, so the token path, its
body fields, and the header names carrying App ID / App Key are unknown. Everything is therefore
editable in the UI: base URL, token path, a JSON body template with `{{app_id}}` / `{{app_key}}`
placeholders, the two header names (defaults `x-app-id` / `x-app-key`), and free-form extra headers
that override anything above. "Lấy token" runs the template and auto-fills the access token when the
response contains one; "Dò đường dẫn" tries a handful of likely paths and field-naming styles in
sequence and reports which ones answer at all, so the correct path can be found without guessing
blindly — 12 paths x 4 ways of passing the credentials (three JSON field styles plus GET query),
sequential, stopping at the first success. If MISA supplies the real token spec, only the token
path/body fields need updating.

One caveat is written into both the code and the UI: the gateway answers `401` with an empty body
for *every* path when unauthenticated — including documented ones such as `branchs/list` — so an
all-401 probe result does not prove the path is wrong. The eShop "Kết nối API" screen also holds an
IP allow-list ("MISA eShop sẽ từ chối truy cập từ bất kì địa chỉ IP máy chủ nào nằm ngoài danh sách
này"), and calls leave from the web server, not from the tester's browser — so that server IP has to
be listed before any probe result means anything.

**Second source: the GraphAPI gateway.** MISA eShop was previously MShopKeeper, and that older Open
Platform (`openplatform.mshopkeeper.vn`, gateway `graphapi.mshopkeeper.vn`) is still live — unlike
the new gateway it answers with real payloads (`{"Code":200,"ErrorType":2,"ErrorMessage":"CompanyCode
not found."}`) instead of a blank 401, so it can actually be debugged. The console has a source
switch in the header; picking "GraphAPI (MShopKeeper)" loads that catalogue and swaps the auth panel.

Its authentication is fully documented: `POST {authUrl}/api/Account/Login` with
`LoginParam { Domain, AppID, LoginTime, SignatureInfo }`, where `SignatureInfo` is HMACSHA256 of the
JSON `{ Domain, AppID, LoginTime }` salted with the Secret Key. The docs do not state whether the
digest is hex or base64, nor the `LoginTime` format, so `dangNhapGraphApi` walks a small table of
combinations (base64/hex/upper-hex x three UTC time formats) and stops at the first success — and,
crucially, only keeps trying while the server answers `ErrorType: 4` ("invalid signature/timeout").
Any other error (2 = unknown shop, 3 = unknown AppID) stops immediately, so a wrong domain costs one
request, not seven. Signing happens server-side; the Secret Key never reaches the browser. On success
the AccessToken, CompanyCode, and Environment are stored, the data base URL becomes
`https://graphapi.mshopkeeper.vn/{Environment}`, and every request automatically carries the
`CompanyCode` header alongside `Authorization: Bearer`.

For this source, bodies are pre-filled from the JSON examples printed in the docs rather than
generated from a type tree, and the "Tài liệu" tab shows the documented definitions.

**Request building.** Query and path parameters get generated inputs from the spec; path parameters
are required before sending. Bodies are pre-filled from the documented parameter tree (types mapped
from the C# names MISA uses: `Int32` → 0, `Boolean?` → null, `List<X>` → `[ { … } ]`, and so on).
Because the docs do not say whether the body is the `param` object itself or a wrapper around it,
there is a "Bọc trong { param: … }" toggle; unwrapped is the default.

**Secrets.** App ID / App Key / token live in `localStorage` on the tester's machine, never in the
database. The `request` and `cURL` panes show masked values (`abcd••••wxyz`), so pasted output does
not leak the key.

## Behaviour & impact

Sidebar has one new entry. Nothing about existing eShop syncing, orders, or MISA credentials
changed — this section shares no state with `misa.service.ts` and writes nothing to the database.

Per-endpoint inputs, the auth config, and the last 25 calls persist in `localStorage`; the history
panel restores an earlier request in one click. `Ctrl`/`Cmd` + `Enter` sends.

Verified against the live API: with placeholder credentials MISA answers `401` with an empty body and
`WWW-Authenticate: Bearer` for every path, including the two endpoints the docs mark as needing no
authentication (`inventoryitems/list`, `inventoryitems/{id}`) — so real credentials are required
before anything returns data.

## Tests

- `npx vitest run src/services/tests/eshop-open-api.test.ts` — 13 tests: URL building, host
  allow-list (rejects `evil.example.com` and `eshopapp.misa.vn.evil.com`), masking, header assembly
  including the `Bearer Bearer` trap, invalid-JSON body rejected before any network call, 401
  passed through untouched, token extraction, spec sanity checks, plus the GraphAPI login: exact
  `LoginParam` shape and signature, the `ErrorType: 4`-only retry rule, the three `LoginTime`
  formats, and `graphapi.mshopkeeper.vn` being allowed by the host list
- `npx tsc --noEmit` and `npx eslint` on the new files — clean
- Live smoke test through the dev server: `/eshop-api-test` renders, `/api/eshop-api-test/spec`
  returns the catalogue, a proxied call to `inventoryitems/list` returns MISA's 401 with the key
  masked, and a call aimed at `169.254.169.254` is refused by the host allow-list
- Live: `POST https://graphapi.mshopkeeper.vn/auth/api/Account/Login` through the new route returns
  `ErrorType 2 — CompanyCode not found.` for a placeholder domain, confirming the gateway is up and
  the signed request is well-formed; `GET /api/eshop-api-test/spec?nguon=mshopkeeper` returns the 23
  endpoints with their documented headers and example bodies
- Pre-existing unrelated failure in `src/utils/tests/bulk-production.test.ts` was already there
