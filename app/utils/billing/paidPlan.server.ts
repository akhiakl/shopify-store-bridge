import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import { PRO_PLAN } from "./plans";

/** Read with the store's own admin (scope-free), so it works for the
 * session's store and, through `unauthenticated.admin`, for the source of
 * a connection a target is pulling from. */
const ACTIVE_SUBSCRIPTIONS_QUERY = `#graphql
  query ActiveSubscriptions {
    currentAppInstallation { activeSubscriptions { name status } }
  }
`;

/** Whether the store has an active Pro subscription. A failed read counts
 * as free: limits are applied rather than skipped. */
export async function isProStore(admin: AdminApiContext): Promise<boolean> {
  try {
    const response = await admin.graphql(ACTIVE_SUBSCRIPTIONS_QUERY);
    const { data } = (await response.json()) as {
      data?: {
        currentAppInstallation?: {
          activeSubscriptions: { name: string; status: string }[];
        };
      };
    };
    return (data?.currentAppInstallation?.activeSubscriptions ?? []).some(
      (sub) => sub.name === PRO_PLAN && sub.status === "ACTIVE",
    );
  } catch {
    return false;
  }
}

/** Test charges outside production, or when SHOPIFY_BILLING_TEST=true
 * (development stores can't be charged for real). */
export function billingIsTest(): boolean {
  return (
    process.env.SHOPIFY_BILLING_TEST === "true" ||
    process.env.NODE_ENV !== "production"
  );
}
