import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import { unauthenticated } from "~/shopify.server";
import { isStylingInSync } from "~/utils/sync/checkoutBrandingInput";
import {
  canStyleCheckout,
  readCheckoutStyling,
  type StylingSummary,
} from "~/utils/sync/checkoutStyling.server";
import type { ConnectionAccess } from "~/utils/sync/connectionAccess.server";
import type { DefinitionSyncStatus } from "~/utils/sync/syncStatus.server";

export type CheckoutOverview =
  | {
      blocked: string;
      /** Stores to open StoreBridge in, to approve its new scopes. */
      approveIn?: string[];
    }
  | {
      blocked: null;
      summary: StylingSummary;
      /** Null until the target approves: its styling isn't read before. */
      status: DefinitionSyncStatus | null;
    };

/** Granted with the checkout styling feature; a store that installed
 * before it keeps its old token until someone opens the app there. */
const STYLING_SCOPES = [
  "read_checkout_and_accounts_configurations",
  "write_checkout_and_accounts_configurations",
];

function hasStylingScopes(scope: string | undefined): boolean {
  const granted = new Set(scope?.split(",") ?? []);
  return STYLING_SCOPES.every((s) => granted.has(s));
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

/**
 * Whether checkout styling can sync on this connection, checked on both
 * stores before anything is offered: Shopify only allows it on Plus (and
 * development) stores. When it can, the source's styling at a glance and,
 * once approved, whether the target's matches.
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
    let status: DefinitionSyncStatus | null = null;
    if (isApproved) {
      status = !targetStyling
        ? "NOT_SYNCED"
        : isStylingInSync(
              sourceStyling.styling.branding,
              targetStyling.styling.branding,
            )
          ? "IN_SYNC"
          : "OUT_OF_SYNC";
    }
    return { blocked: null, summary: sourceStyling.summary, status };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { blocked: `Couldn't read checkout styling. ${message}` };
  }
}
