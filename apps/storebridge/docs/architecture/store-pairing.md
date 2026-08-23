# Store pairing

The core feature: one shop (the **source**) invites another shop (the **target**) into a **sync group**, so data can flow between them. This doc is about the trust/authorization model, which is the non-obvious part — the CRUD itself is straightforward and lives in `app/routes/app.stores/pairing.server.ts`.

## The problem: Shopify has no cross-store ownership API

Confirmed by checking (Shopify Dev MCP unavailable at the time; verified via Shopify's own community docs instead — see the PR that introduced this): there is no Admin API field, no Partner API surface available to a merchant-installed app, no anything that answers "do these two shops belong to the same merchant/organization." Each shop is a fully isolated credential set. This is a real, permanent constraint, not a gap to work around with a cleverer query.

That matters because the obvious-seeming design — source invites by domain, target's own authenticated session approves — only proves "_some_ admin at the target consented." It doesn't prove they're who the source actually intended to pair with. Anyone who can see a pending invite in their dashboard could approve a pairing with a store they don't actually run, or that a source never really meant to reach (typo'd domain landing on an unrelated business, for instance).

## The design: out-of-band shared secret

Same pattern Slack Connect and Stripe Connect use for cross-tenant linking, since they hit the identical structural problem (no platform-level "same owner" signal to lean on):

1. **`requestPairing`** (source side) creates the `SyncGroupTarget` row _and_ a single-use, 48-hour-expiring token — `authToken.server.ts` generates 32 random bytes, returns the raw value exactly once, and persists only its SHA-256 hash (same reasoning as a password-reset token: the raw value should never be recoverable from the database).
2. The source gets back a shareable link (`/app/stores/authorize?token=...&shop=<target>`) to send to whoever they actually intend to pair with, through a channel _outside this app_ — email, Slack, whatever they already trust that contact through. This out-of-band handoff is the actual proof: only someone who received the link from the source can act on it.
3. **`approvePairingRequest`** (target side, via `app.stores_.authorize.tsx`) requires the token — it's the only path that can move a request to `APPROVED`. Getting there via the general dashboard list isn't possible; `IncomingRequestsList` is deliberately read-only-plus-decline.
4. **Decline doesn't need the token.** It's available directly from the dashboard list (`declinePairingRequest`) because declining is harmless regardless of who does it — there's no scenario where an unwanted "no" causes damage, so gating it would just be friction with no security benefit.

## Why the target-doesn't-have-the-app-yet case needs no special handling

`app.stores_.authorize.tsx`'s filename is a deliberate choice: the trailing underscore (`app.stores_.authorize`, React Router's flat-routes nesting-escape convention) makes it a **sibling** of `app.stores/route.tsx` in the URL (`/app/stores/authorize`) while still nesting under `app.tsx`'s layout, not under `app.stores`'s. That means it inherits `app.tsx`'s `authenticate.admin()` gate directly — so opening the link for a shop that's never installed StoreBridge just triggers the normal install/OAuth flow (see `auth.md`) as a side effect of hitting any protected route, then continues straight to the authorize page once that completes. No custom "check if installed, redirect to install, remember where to come back" logic was needed; it's what the auth middleware already does for any deep link.

## Lifecycle at a glance

```
requestPairing ──► SyncGroupTarget{status: PENDING, authTokenHash: set}
                          │                              │
                    declinePairingRequest          approvePairingRequest
                    (dashboard, no token)          (authorize link, token required)
                          │                              │
                          ▼                              ▼
                    status: DECLINED              status: APPROVED
                    authTokenHash: null           authTokenHash: null
```

Once a token is used (or the request is declined), it's cleared — a stale/leaked link can't be replayed.

## Things intentionally _not_ built (YAGNI)

- **Rate-limiting invite creation.** A source can send unlimited pairing invites. Not a security issue (unwanted invites are just noise until declined), and no evidence yet it's actually a problem — revisit if it becomes one.
- **Resending/regenerating an authorize link.** If a token expires (48h) or gets lost, the current path is: decline the stale request, send a new invite. No "regenerate token" action exists yet.
- **Online-token/staff-identity tracking.** The app is 100% offline-token based (see `auth.md`); there's no record of _which staff member_ at a shop approved a pairing, only that some authenticated session at that shop did. Switching to online tokens to capture that was considered and explicitly deferred — a real architecture change, not a small addition, and nothing today needs per-staff-member granularity.
