---
name: storebridge-auth-troubleshooting
description: Use when StoreBridge's embedded app isn't authenticating — the placeholder text "Handling response" shows instead of the app, install/reauth never completes, a session isn't being written to the Session table, or auth-related errors appear in the shopify app dev terminal. Covers the full diagnostic order (clock skew first, not last) worked out from an actual multi-hour debugging session. See apps/storebridge/docs/architecture/auth.md for the underlying request-flow explanation this skill's steps are based on.
---

# StoreBridge auth troubleshooting

A specific, ordered checklist — not a general "how Shopify auth works" explainer (that's `apps/storebridge/docs/architecture/auth.md`, read it for the _why_). This is the _what to check, in what order_, reverse-engineered from a real incident where the obvious suspects (dependency versions, database connectivity) were all fine and the actual cause was two steps further down this list.

## Symptom this applies to

The embedded app shows literal readable text **"Handling response"** instead of loading — on `/app`, `/app/stores`, or any `/app/*` route — even though the app shows as installed in the Shopify Admin. Or: install/reauth seems to run (terminal shows `[shopify-app/INFO] Authenticating admin request`) but never actually completes, and the `Session`/`Store` tables stay empty no matter how many times you retry.

## Diagnostic order

Check these in order. Don't skip to dependency/code changes before ruling out 1–4 — they're cheap to check and much more likely.

### 1. System clock

By far the most likely cause. JWT session-token validation is timestamp-based; more than a few seconds of clock drift on the machine running `shopify app dev` fails validation permanently (`"nbf" claim timestamp check failed`), not intermittently.

```bash
date -u
curl -sI https://www.google.com | grep -i '^date:'
```

Compare the two. More than ~5 seconds off is the smoking gun.

**On WSL2**: `wsl --shutdown` + restart is _not_ guaranteed to fix this — it resyncs WSL2's clock to the **Windows host's** clock, which faithfully inherits a wrong time if the host itself is wrong. Check the actual Windows system clock, not just WSL. If the drift keeps recurring even after a fix, that's a real Windows/Hyper-V time-sync problem on that machine, not a one-off — a one-time `sudo date -s "@$(...)"` patch won't hold; the host clock needs to actually be corrected.

### 2. Turn on debug logging (already wired up)

Don't add new logging — it's already there, just check the output:

- `apps/storebridge/app/shopify.server.ts` sets `logger: { level: LogSeverity.Debug }` outside production. This is what actually surfaces _why_ a session token failed (the exact JWT error), not just that authentication was attempted.
- `apps/storebridge/app/db.server.ts` logs every Prisma query outside production (`log: ["query"]`) — confirms whether a DB write is even being attempted.
- `shopify app dev --verbose` for CLI-level tunnel/network detail.

Read the terminal output for the _specific_ error, don't just confirm the flow "seems to run."

### 3. Database connectivity, directly

Bypass the app entirely:

```bash
psql -h <host> -p <port> -U postgres -d storebridge -c '\dt'
psql -h <host> -p <port> -U postgres -d storebridge -c 'select count(*) from "Session";'
```

Confirms the DB and migrations are real and reachable before assuming app-level logic is broken. If you're checking this from a different machine/shell than the one actually running `shopify app dev`, also confirm `DATABASE_URL` in `.env` matches what you're querying — a mismatch there (e.g. a different Postgres instance on a different port) looks identical to "sessions aren't being written" from the app's perspective.

### 4. Is `shopify app dev` actually running, with a live tunnel?

```bash
ps aux | grep -E 'shopify app dev|cloudflared'
```

A dead process, or `SHOPIFY_APP_URL`/`application_url` still pointing at a placeholder (`https://localhost`, `https://example.com`), means Shopify's real Admin cannot reach the app at all — indistinguishable from "auth is broken" without checking this first.

### 5. Only after 1–4 are clean: dependency versions

If everything above checks out and it's _still_ broken, it's worth checking whether the installed `@shopify/shopify-app-react-router` version has a relevant known fix (its 2.0.0 changelog specifically describes fixing "embedded apps incorrectly displayed login pages after SPA navigation followed by full-page reload"). This was suspected once and turned out not to be the actual cause that time — clock skew was — but it's a real, documented fix worth knowing about as a last resort.

## Confirming a fix actually worked

Don't trust "the page loaded" alone — verify a session was actually persisted:

```bash
psql ... -c 'select id, shop, "isOnline", expires from "Session";'
```

An empty result after a claimed-successful install means something's still wrong, even if the UI looked fine.
