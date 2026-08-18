import prisma from "~/db.server";

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
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop) ? shop : null;
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
  { ok: true } | { ok: false; error: string; installUrl?: string };

/**
 * Invites a target store into a sync group owned by `sourceShop` — creates
 * a new group when `groupId` is omitted, otherwise adds to an existing one
 * the source store actually owns. The target only actually joins once it
 * approves from its own authenticated session (respondToPairingRequest) —
 * this just creates the pending invite.
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

  await prisma.syncGroupTarget.create({
    data: { groupId: group.id, storeId: target.id },
  });
  return { ok: true };
}

/**
 * Approves or declines a pairing request — only from the target store's
 * own authenticated session. `shop` must be the caller's authenticated
 * session.shop, never a value taken from form input, or any shop could
 * approve any other shop's pairing requests.
 */
export async function respondToPairingRequest({
  targetId,
  shop,
  approve,
}: {
  targetId: string;
  shop: string;
  approve: boolean;
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
      status: approve ? "APPROVED" : "DECLINED",
      respondedAt: new Date(),
    },
  });
  return { ok: true };
}
