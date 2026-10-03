import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import { withFileIds, type CheckoutStyling } from "./checkoutBrandingInput";
import {
  canStyleCheckout,
  readCheckoutStyling,
} from "./checkoutStyling.server";
import { createOne, type CreateResult } from "./runMutation.server";
import { ensureTargetFile } from "./stylingFiles.server";
import type { TargetIdCache } from "./syncMetaobjectEntry.server";

/** Scope write_checkout_and_accounts_configurations. */
const CHECKOUT_STYLING_UPDATE_MUTATION = `#graphql
  mutation CheckoutStylingUpdate(
    $id: ID!
    $configuration: CheckoutAndAccountsConfigurationInput!
  ) {
    checkoutAndAccountsConfigurationUpdate(
      id: $id
      configuration: $configuration
    ) {
      configuration { id }
      userErrors { field message code }
    }
  }
`;

/**
 * Applies the source's checkout styling to the target's published
 * configuration, which is live: Shopify has no API to create a draft one.
 * The page asks for confirmation before queuing this. Files (logos, custom
 * fonts) are copied first, since their IDs are per-store.
 */
export async function syncCheckoutStyling(
  targetAdmin: AdminApiContext,
  styling: CheckoutStyling,
  cache: TargetIdCache,
): Promise<CreateResult> {
  try {
    if (!(await canStyleCheckout(targetAdmin))) {
      return {
        ok: false,
        error:
          "This store isn't on Shopify Plus, so its checkout styling can't be changed.",
      };
    }
    const target = await readCheckoutStyling(targetAdmin);
    if (!target) {
      return {
        ok: false,
        error: "This store has no published checkout configuration.",
      };
    }
    const ids = [];
    for (const ref of styling.files) {
      ids.push({
        path: ref.path,
        id: await ensureTargetFile(targetAdmin, ref, cache),
      });
    }
    return await createOne(targetAdmin, CHECKOUT_STYLING_UPDATE_MUTATION, {
      id: target.configurationId,
      configuration: { branding: withFileIds(styling.branding, ids) },
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
