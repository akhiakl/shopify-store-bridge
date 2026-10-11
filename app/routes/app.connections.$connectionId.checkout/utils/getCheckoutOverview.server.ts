import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import { unauthenticated } from "~/shopify.server";
import {
  canStyleCheckout,
  readCheckoutStyling,
  type PublishedStyling,
} from "~/utils/sync/checkoutStyling.server";
import {
  compareStyling,
  type StylingAreaDiff,
} from "~/utils/sync/checkoutStylingAreas";
import type { ConnectionAccess } from "~/utils/sync/connectionAccess.server";

export type CheckoutOverview =
  | {
      blocked: string;
      /** Stores to open StoreBridge in, to approve its new scopes. */
      approveIn?: string[];
    }
  | {
      blocked: null;
      /** False until the target approves: its styling isn't read before,
       * so each area lists only the source's values. */
      compared: boolean;
      areas: StylingAreaDiff[];
      overrides: OverrideStatus[];
    };

/** A source market override and its same-named one on the target. */
export interface OverrideStatus {
  name: string;
  /** Null until compared; "MISSING" when the target has no override by
   * this name, which the API can't create. */
  status: "IN_SYNC" | "OUT_OF_SYNC" | "MISSING" | null;
  /** Areas the override customizes on either store. */
  areaCount: number;
  /** Of those, how many differ. */
  outOfSyncCount: number;
}

/** Granted with the checkout styling feature; a store that installed
 * before it keeps its old token until someone opens the app there. */
const STYLING_SCOPES = [
  "read_checkout_and_accounts_configurations",
  "write_checkout_and_accounts_configurations",
];

/** Shopify stores scopes compressed: a granted write_x implies read_x,
 * so the session lists only the write scope when both were requested. */
function hasStylingScopes(scope: string | undefined): boolean {
  const granted = new Set(scope?.split(",").map((s) => s.trim()) ?? []);
  return STYLING_SCOPES.every(
    (s) => granted.has(s) || granted.has(s.replace(/^read_/, "write_")),
  );
}

/** Names the store an error came from: both are read at once. An access
 * error with the scopes granted means Shopify hasn't given that store the
 * checkout and accounts editor this API is part of. */
async function readFrom(shop: string, admin: AdminApiContext) {
  try {
    return await readCheckoutStyling(admin);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      /access denied/i.test(message)
        ? `Shopify denied access to ${shop}'s checkout styling. It may not have the new checkout and accounts editor yet.`
        : `${shop}: ${message}`,
    );
  }
}

/** "a", "a and b": both stores can be the problem at once. */
function listShops(shops: string[]): string {
  return shops.join(" and ");
}

/** A target with no published configuration compares as customizing
 * nothing, so every area the source sets shows as out of sync. */
const UNSTYLED: PublishedStyling = {
  configurationId: "",
  styling: { branding: {}, files: [] },
  overrides: [],
};

/** Each area and override of the source next to the target's; with no
 * target read yet, against nothing, so only the source's values show. */
function compare(source: PublishedStyling, target: PublishedStyling | null) {
  const overrides = source.overrides.map((override): OverrideStatus => {
    const match = target?.overrides.find((o) => o.name === override.name);
    const areas = compareStyling(
      override.styling.branding,
      match?.styling.branding,
    );
    const outOfSyncCount = areas.filter((area) => !area.inSync).length;
    return {
      name: override.name,
      status: !target
        ? null
        : !match
          ? "MISSING"
          : outOfSyncCount
            ? "OUT_OF_SYNC"
            : "IN_SYNC",
      areaCount: areas.length,
      outOfSyncCount: match ? outOfSyncCount : 0,
    };
  });
  return {
    compared: target !== null,
    areas: compareStyling(source.styling.branding, target?.styling.branding),
    overrides,
  };
}

/**
 * Whether checkout styling can sync on this connection, checked on both
 * stores before anything is offered: Shopify only allows it on Plus (and
 * development) stores. When it can, every area of the source's styling
 * and, once approved, the target's value for each setting beside it.
 */
export async function getCheckoutOverview({
  connection,
  sourceAdmin,
}: {
  connection: ConnectionAccess["connection"];
  sourceAdmin: AdminApiContext;
}): Promise<CheckoutOverview> {
  const sourceShop = connection.source.shop;
  const targetShop = connection.target.shop;
  try {
    const [source, target] = await Promise.all([
      unauthenticated.admin(sourceShop),
      unauthenticated.admin(targetShop),
    ]);
    const unapproved = [
      ...(hasStylingScopes(source.session.scope) ? [] : [sourceShop]),
      ...(hasStylingScopes(target.session.scope) ? [] : [targetShop]),
    ];
    if (unapproved.length > 0) {
      return {
        blocked: `StoreBridge needs new permissions for checkout styling. Open StoreBridge in ${listShops(unapproved)}'s admin to approve them.`,
        approveIn: unapproved,
      };
    }
    const targetAdmin = target.admin;
    const [sourceAllowed, targetAllowed] = await Promise.all([
      canStyleCheckout(sourceAdmin),
      canStyleCheckout(targetAdmin),
    ]);
    const notPlus = [
      ...(sourceAllowed ? [] : [sourceShop]),
      ...(targetAllowed ? [] : [targetShop]),
    ];
    if (notPlus.length > 0) {
      return {
        blocked: `Shopify only lets apps change checkout styling on Shopify Plus stores, and ${listShops(notPlus)} ${notPlus.length > 1 ? "aren't" : "isn't"} on Plus.`,
      };
    }

    const isApproved = connection.status === "APPROVED";
    const [sourceStyling, targetStyling] = await Promise.all([
      readFrom(sourceShop, sourceAdmin),
      isApproved ? readFrom(targetShop, targetAdmin) : null,
    ]);
    if (!sourceStyling) {
      return {
        blocked: `${sourceShop} has no published checkout configuration to copy.`,
      };
    }
    return {
      blocked: null,
      ...compare(
        sourceStyling,
        isApproved ? (targetStyling ?? UNSTYLED) : null,
      ),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { blocked: `Couldn't read checkout styling. ${message}` };
  }
}
