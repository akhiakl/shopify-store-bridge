# Auth & session architecture

How StoreBridge authenticates embedded requests, where sessions get persisted, and the failure modes that actually show up in practice — written up because none of this is discoverable by reading `shopify.server.ts` alone; it only makes sense once you've watched it fail.

## The pieces

- `app/shopify.server.ts` — the single `shopifyApp(...)` instance (`@shopify/shopify-app-react-router`). Every route imports `authenticate`/`sessionStorage`/etc. from here, never constructs its own — see AGENTS.md's Dependency Inversion note.
- `app/db.server.ts` — the Prisma client `PrismaSessionStorage` writes to. Outside production it logs every query (`log: ["query"]`) — deliberately left on, see "Debugging a stuck auth flow" below.
- Session persistence: **offline tokens only** (`useOnlineTokens` isn't set). One row per installed shop in the `Session` table, keyed by shop, not by user — the app doesn't currently track which staff member is doing what.
- Distribution: `AppDistribution.AppStore`, `embedded = true`. Every `/app/*` route's loader calls `authenticate.admin(request)` — not just the parent `app.tsx` layout; every route independently, because a deep link into any of them (e.g. a pairing-authorization link — see `store-pairing.md`) needs to trigger the install/reauth flow on its own, not rely on a parent having already run.

## Request flow for an authenticated embedded request

1. Browser loads `/app/...` inside the Shopify Admin iframe.
2. `authenticate.admin(request)` checks for a session token (JWT) on the request. First document load in a session: none yet.
3. No token → `redirectToBouncePage` throws a redirect to `patchSessionTokenPath`.
4. That path itself is caught by `respondToBouncePageRequest`, which throws `renderAppBridge(...)` — a raw `Response` whose body is `<script data-api-key="..." src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>`. This is a genuine new HTTP response (not funneled through the route's `ErrorBoundary`/`boundary.error()`), so the browser parses and executes it as a fresh document.
5. App Bridge boots client-side, obtains a valid session token, reloads the original URL with it attached.
6. `authenticate.admin` now has a token. If no valid offline session exists yet for that shop (first install, or a scope/expiry mismatch), it calls `api.auth.tokenExchange(...)` — this is the actual network call to Shopify that verifies the JWT and mints an offline access token — then `sessionStorage.storeSession(...)` persists it to the `Session` table.
7. Loader/action proceeds with a real `session`.

**What "Handling response" means when you see it instead of the app**: that literal text is `boundary.error()`'s fallback (`app.tsx`'s `ErrorBoundary`) for a caught error whose `.data` is empty. It should essentially never be visible in a correctly-behaving install — every legitimate auth-redirect path (see step 4 above) is a raw thrown `Response`, not something that lands in `boundary.error()` with empty data. Seeing it visibly on screen is a real signal something upstream is failing before it gets that far, not a normal "please wait" state.

## Debugging a stuck auth flow

In rough order of how likely each one actually is, from having chased this exact symptom:

1. **Check the system clock first.** JWT validation is timestamp-based (`nbf`/`exp`/`iat`); if the machine running `shopify app dev` is more than a few seconds off from real time, every session token fails `"nbf" claim timestamp check failed` — permanently, not intermittently, until the clock's fixed. This is the single most likely cause of "auth never completes, no crash, just stuck."
   - **WSL2 machines specifically**: the VM's clock can drift independently of Windows and doesn't reliably self-correct on `wsl --shutdown` + restart if the _Windows host clock itself_ is wrong (WSL2's Hyper-V time sync faithfully inherits a wrong host time — fixing WSL doesn't help if the host is the actual problem). Check the Windows system clock is correct, not just WSL's.
   - Verify: `date -u` inside the environment actually running `shopify app dev`, compared against a real external time source (`curl -sI https://www.google.com | grep -i date:`). More than a couple seconds of drift is the smoking gun.
   - `systemd-timesyncd` may simply refuse to run in some sandboxed/containerized dev environments (`ConditionVirtualization=!container` unmet) — don't assume "the sync service is running" means the clock is actually correct.
2. **Turn on debug logging** (already wired up, not something you need to add):
   - `shopify.server.ts`'s `logger: { level: LogSeverity.Debug }` (non-production only) surfaces the token-exchange attempt and _why_ a session token was rejected — the exact JWT parse failure, expired-vs-invalid, etc. This is what actually revealed the clock skew in practice; without it you only see `[shopify-app/INFO] Authenticating admin request` with no indication of what happened next.
   - `db.server.ts`'s `log: ["query"]` (non-production only) confirms whether a `Session`/`Store` write is even being attempted, vs. failing before it gets that far.
   - Also available: `shopify app dev --verbose` for the CLI's own tunnel/network-level logging.
3. **Verify DB connectivity directly**, independent of the app: `psql -h <host> -p <port> -U postgres -d storebridge -c '\dt'` against the exact `DATABASE_URL` in `.env`. Confirms the database and migrations are actually reachable before assuming the app-level auth logic is broken.
4. **Confirm `shopify app dev` is actually running** with a live tunnel (`ps aux | grep cloudflared`) before assuming anything about auth logic — a dead process or a `SHOPIFY_APP_URL`/`application_url` still pointing at a placeholder (`https://localhost`, `https://example.com`) means Shopify's real Admin literally cannot reach the app, which looks identical to "nothing happens" from the browser's side.
5. **Dependency versions**: if all of the above check out and it's still broken, check whether `@shopify/shopify-app-react-router`'s version has a relevant fixed bug — its 2.0.0 changelog specifically describes "embedded apps incorrectly displayed login pages after SPA navigation followed by full-page reload" as a fixed issue. Don't jump here first; it wasn't the actual cause the one time this was suspected (clock skew was), but it's real enough to be worth knowing about if 1–4 are all clean.

## Config gotcha: `shopify app dev` live-syncs the config file

While `shopify app dev` is running, it periodically rewrites `shopify.app.toml`/`shopify.app.staging.toml` with the live app registration's actual `application_url`, scopes, etc. — including stripping comments and reformatting. If you're hand-editing those files while a dev session is also running, expect your edits to get silently overwritten; this is the CLI doing its job, not corruption. Stop the dev process (or accept the churn) before making config edits you want to stick.
