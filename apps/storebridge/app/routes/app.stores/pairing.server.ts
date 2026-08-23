import prisma from "~/db.server";
import { generateAuthToken, hashAuthToken } from "./authToken.server";

/**
 * Narrow, deliberately conservative shop-domain format check for the
 * "connect a store" input — *.myshopify.com only, not the broader set
 * Shopify itself accepts (custom/Plus domains). Widen later if needed;
 * this isn't Admin API surface, so it doesn't need Shopify Dev MCP
 * verification, just basic input sanitization.
 */
export function normalizeShopDomain(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  const shop = trimmed.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  // Labels can't start OR end with a hyphen (RFC 1035) - the trailing
  // alnum is required separately since a bare `*` would let "bad-" through.
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?\.myshopify\.com$/.test(shop)
    ? shop
    : null;
}

/** Installed = has a stored offline session, same check authenticate.admin relies on. */
async function isShopInstalled(shop: string): Promise<boolean> {
  const session = await prisma.session.findFirst({
    where: { shop, isOnline: false },
  });
  return session !== null;
}

async function getOrCreateStore(shop: string) {
  return prisma.store.upsert({
    where: { shop },
    create: { shop },
    update: {},
  });
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;

export async function getDashboardData(shop: string) {
  const store = await getOrCreateStore(shop);

  const [ownedGroups, incomingRequests, memberships] = await Promise.all([
    prisma.syncGroup.findMany({
      where: { sourceId: store.id },
      include: { targets: { include: { store: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.syncGroupTarget.findMany({
      where: { store: { shop }, status: "PENDING" },
      include: { group: { include: { source: true } } },
      orderBy: { requestedAt: "desc" },
    }),
    prisma.syncGroupTarget.findMany({
      where: { store: { shop }, status: { in: ["APPROVED", "DECLINED"] } },
      include: { group: { include: { source: true } } },
      orderBy: { respondedAt: "desc" },
    }),
  ]);

  return { ownedGroups, incomingRequests, memberships };
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
    return { ok: false, error: "Enter a valid *.myshopify.com domain." };
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
    ? await prisma.syncGroup.findFirst({
        where: { id: groupId, sourceId: source.id },
      })
    : await prisma.syncGroup.create({
        data: { sourceId: source.id, name: groupName?.trim() || null },
      });
  if (!group) {
    return { ok: false, error: "That sync group no longer exists." };
  }

  const existing = await prisma.syncGroupTarget.findUnique({
    where: { groupId_storeId: { groupId: group.id, storeId: target.id } },
  });
  if (existing) {
    return {
      ok: false,
      error: `${targetShop} is already ${existing.status.toLowerCase()} in this group.`,
    };
  }

  const { raw, hash, expiresAt } = generateAuthToken();
  await prisma.syncGroupTarget.create({
    data: {
      groupId: group.id,
      storeId: target.id,
      authTokenHash: hash,
      authTokenExpiresAt: expiresAt,
    },
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
  const target = await prisma.syncGroupTarget.findUnique({
    where: { authTokenHash: hashAuthToken(token) },
    include: { store: true, group: { include: { source: true } } },
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

  await prisma.syncGroupTarget.update({
    where: { id: target.id },
    data: {
      status: "APPROVED",
      respondedAt: new Date(),
      authTokenHash: null,
      authTokenExpiresAt: null,
    },
  });
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
  const target = await prisma.syncGroupTarget.findUnique({
    where: { id: targetId },
    include: { store: true },
  });

  if (!target || target.store.shop !== shop) {
    return { ok: false, error: "Pairing request not found." };
  }
  if (target.status !== "PENDING") {
    return { ok: false, error: "This request was already responded to." };
  }

  await prisma.syncGroupTarget.update({
    where: { id: targetId },
    data: {
      status: "DECLINED",
      respondedAt: new Date(),
      authTokenHash: null,
      authTokenExpiresAt: null,
    },
  });
  return { ok: true };
}
