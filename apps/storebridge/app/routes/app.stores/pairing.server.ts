import { and, eq } from "drizzle-orm";

import db from "~/db.server";
import { sessions, syncGroups, syncGroupTargets } from "~/db/schema.server";
import { getOrCreateStore } from "~/utils/dashboard.server";

import { generateAuthToken, hashAuthToken } from "./authToken.server";

/**
 * Shop-domain format check for the "connect a store" input. Accepts either
 * a bare store handle (just the name, e.g. "poc-liquid" — the common case
 * a merchant will actually type) or the full `*.myshopify.com` domain;
 * a bare handle gets the suffix appended. Doesn't accept a custom domain:
 * Shopify sessions are always keyed by the `*.myshopify.com` handle, never
 * a custom domain, and this app has no way to resolve one to the other
 * before a session exists for that shop (see `isShopInstalled` below) —
 * accepting custom-domain input would just fail there every time, which
 * is worse than not offering it. Not Admin API surface, so this doesn't
 * need Shopify Dev MCP verification, just input sanitization.
 */
export function normalizeShopDomain(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  const shop = trimmed.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  // Labels can't start OR end with a hyphen (RFC 1035) - the trailing
  // alnum is required separately since a bare `*` would let "bad-" through.
  const handlePattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
  if (handlePattern.test(shop)) {
    return `${shop}.myshopify.com`;
  }
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?\.myshopify\.com$/.test(shop)
    ? shop
    : null;
}

/** Installed = has a stored offline session, same check authenticate.admin relies on. */
async function isShopInstalled(shop: string): Promise<boolean> {
  const session = await db.query.sessions.findFirst({
    where: and(eq(sessions.shop, shop), eq(sessions.isOnline, false)),
  });
  return session !== undefined;
}

type RequestPairingResult =
  | { ok: true; authToken: string; targetShop: string }
  | { ok: false; error: string; installUrl?: string };

/**
 * Invites a target store into a sync group owned by `sourceShop` — creates
 * a new group when `groupId` is omitted, otherwise adds to an existing one
 * the source store actually owns. Returns a one-time authorization token
 * (never stored raw — see authToken.server.ts) the caller shares
 * out-of-band with whoever actually runs the target store; only that
 * token, redeemed from the target's own authenticated session, can
 * approve the pairing (approvePairingRequest). Shopify has no API to
 * prove two shops share an owner, so this out-of-band secret is the
 * strongest available proof — the same pattern Slack Connect/Stripe
 * Connect use for cross-tenant linking.
 */
export async function requestPairing({
  sourceShop,
  targetDomain,
  groupId,
  groupName,
}: {
  sourceShop: string;
  targetDomain: string;
  groupId?: string;
  groupName?: string;
}): Promise<RequestPairingResult> {
  const targetShop = normalizeShopDomain(targetDomain);
  if (!targetShop) {
    return {
      ok: false,
      error: "Enter a valid store name or *.myshopify.com domain.",
    };
  }
  if (targetShop === sourceShop) {
    return { ok: false, error: "A store can't be paired with itself." };
  }

  const installed = await isShopInstalled(targetShop);
  if (!installed) {
    return {
      ok: false,
      error: `StoreBridge isn't installed on ${targetShop} yet.`,
      installUrl: `/auth/login?shop=${encodeURIComponent(targetShop)}`,
    };
  }

  const source = await getOrCreateStore(sourceShop);
  const target = await getOrCreateStore(targetShop);

  const group = groupId
    ? await db.query.syncGroups.findFirst({
        where: and(
          eq(syncGroups.id, groupId),
          eq(syncGroups.sourceId, source.id),
        ),
      })
    : (
        await db
          .insert(syncGroups)
          .values({ sourceId: source.id, name: groupName?.trim() || null })
          .returning()
      )[0];
  if (!group) {
    return { ok: false, error: "That sync group no longer exists." };
  }

  const existing = await db.query.syncGroupTargets.findFirst({
    where: and(
      eq(syncGroupTargets.groupId, group.id),
      eq(syncGroupTargets.storeId, target.id),
    ),
  });
  if (existing) {
    return {
      ok: false,
      error: `${targetShop} is already ${existing.status.toLowerCase()} in this group.`,
    };
  }

  const { raw, hash, expiresAt } = generateAuthToken();
  await db.insert(syncGroupTargets).values({
    groupId: group.id,
    storeId: target.id,
    authTokenHash: hash,
    authTokenExpiresAt: expiresAt,
  });
  return { ok: true, authToken: raw, targetShop };
}

export type PendingTargetByToken = NonNullable<
  Awaited<ReturnType<typeof getPendingRequestByToken>>
>;

/**
 * Looks up the pending request a raw authorization token points to,
 * scoped to the shop redeeming it — `shop` must be the caller's
 * authenticated session.shop, never form/URL input, or any shop could
 * inspect (though not approve) another shop's pending request just by
 * guessing a target id. Returns null for an invalid, expired, wrong-shop,
 * or already-responded-to token; never distinguishes which, so a token
 * leak doesn't tell an attacker anything about why it failed.
 */
export async function getPendingRequestByToken(token: string, shop: string) {
  const target = await db.query.syncGroupTargets.findFirst({
    where: eq(syncGroupTargets.authTokenHash, hashAuthToken(token)),
    with: { store: true, group: { with: { source: true } } },
  });

  if (
    !target ||
    target.store.shop !== shop ||
    target.status !== "PENDING" ||
    !target.authTokenExpiresAt ||
    target.authTokenExpiresAt < new Date()
  ) {
    return null;
  }
  return target;
}

/**
 * Approves a pairing request — the only path that can, since Shopify has
 * no way to confirm the approving session actually belongs to whoever the
 * source intended (see requestPairing's comment). Single-use: the token
 * is cleared on success so it can't be replayed.
 */
export async function approvePairingRequest({
  token,
  shop,
}: {
  token: string;
  shop: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const target = await getPendingRequestByToken(token, shop);
  if (!target) {
    return {
      ok: false,
      error: "This pairing link is invalid, expired, or already used.",
    };
  }

  await db
    .update(syncGroupTargets)
    .set({
      status: "APPROVED",
      respondedAt: new Date(),
      authTokenHash: null,
      authTokenExpiresAt: null,
    })
    .where(eq(syncGroupTargets.id, target.id));
  return { ok: true };
}

/**
 * Declines a pairing request from the regular dashboard list — no token
 * needed, since declining is harmless either way. `shop` must be the
 * caller's authenticated session.shop, never form input, or any shop
 * could decline any other shop's pairing requests.
 */
export async function declinePairingRequest({
  targetId,
  shop,
}: {
  targetId: string;
  shop: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const target = await db.query.syncGroupTargets.findFirst({
    where: eq(syncGroupTargets.id, targetId),
    with: { store: true },
  });

  if (!target || target.store.shop !== shop) {
    return { ok: false, error: "Pairing request not found." };
  }
  if (target.status !== "PENDING") {
    return { ok: false, error: "This request was already responded to." };
  }

  await db
    .update(syncGroupTargets)
    .set({
      status: "DECLINED",
      respondedAt: new Date(),
      authTokenHash: null,
      authTokenExpiresAt: null,
    })
    .where(eq(syncGroupTargets.id, targetId));
  return { ok: true };
}

/**
 * Issues a fresh authorization token for a still-PENDING request whose
 * original link expired (48h) or got lost — the alternative today is
 * decline-and-reinvite, which loses the request's place if the source
 * wanted to keep it. Source-authorized, not target-authorized (unlike
 * declinePairingRequest): only the source decides to resend a link,
 * since the source is who shares it out-of-band in the first place.
 * `shop` must be the caller's session.shop, never form input.
 */
export async function regeneratePairingRequest({
  targetId,
  shop,
}: {
  targetId: string;
  shop: string;
}): Promise<
  | { ok: true; authToken: string; targetShop: string }
  | { ok: false; error: string }
> {
  const target = await db.query.syncGroupTargets.findFirst({
    where: eq(syncGroupTargets.id, targetId),
    with: { store: true, group: { with: { source: true } } },
  });

  if (!target || target.group.source.shop !== shop) {
    return { ok: false, error: "Pairing request not found." };
  }
  if (target.status !== "PENDING") {
    return { ok: false, error: "This request was already responded to." };
  }

  const { raw, hash, expiresAt } = generateAuthToken();
  // Guard the write on status too, not just id — the read above is stale by
  // the time this runs, and without this a concurrent approve/decline could
  // land between the check and the update, reintroducing a token on a
  // request that's no longer PENDING (breaking the "token cleared after
  // response" invariant approvePairingRequest/declinePairingRequest rely
  // on). No matched row means it was responded to in that window.
  const [updated] = await db
    .update(syncGroupTargets)
    .set({ authTokenHash: hash, authTokenExpiresAt: expiresAt })
    .where(
      and(
        eq(syncGroupTargets.id, targetId),
        eq(syncGroupTargets.status, "PENDING"),
      ),
    )
    .returning();

  if (!updated) {
    return { ok: false, error: "This request was already responded to." };
  }

  return { ok: true, authToken: raw, targetShop: target.store.shop };
}
