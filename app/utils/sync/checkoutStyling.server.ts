import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import {
  toCheckoutStyling,
  type CheckoutStyling,
} from "./checkoutBrandingInput";
import { CHECKOUT_STYLING_QUERY } from "./checkoutStylingQuery.generated";
import { readTopLevelErrors } from "./runMutation.server";

/** Scope read_checkout_and_accounts_configurations. IDs only: reading
 * branding here too would multiply its cost by the page size. */
const CONFIGURATIONS_QUERY = `#graphql
  query CheckoutConfigurations {
    checkoutAndAccountsConfigurations(first: 25) {
      nodes { id isPublished }
    }
  }
`;

const SHOP_PLAN_QUERY = `#graphql
  query ShopPlan {
    shop { plan { shopifyPlus partnerDevelopment } }
  }
`;

async function query<T>(
  admin: AdminApiContext,
  operation: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await admin.graphql(
    operation,
    variables ? { variables } : undefined,
  );
  const body = (await response.json()) as { data?: T };
  const error = readTopLevelErrors(body);
  if (error) throw new Error(error);
  return body.data ?? ({} as T);
}

/**
 * Whether Shopify lets apps read and change this store's checkout styling:
 * Plus and development stores only. Checked before touching the styling
 * API, which otherwise just answers with an access error.
 */
export async function canStyleCheckout(
  admin: AdminApiContext,
): Promise<boolean> {
  const data = await query<{
    shop?: { plan?: { shopifyPlus: boolean; partnerDevelopment: boolean } };
  }>(admin, SHOP_PLAN_QUERY);
  const plan = data.shop?.plan;
  return Boolean(plan?.shopifyPlus || plan?.partnerDevelopment);
}

/** What the page shows of a store's checkout look at a glance. */
export interface StylingSummary {
  colors: string[];
  fonts: { role: string; name: string }[];
  baseSize: number | null;
}

interface RawBranding {
  designTokens?: {
    colors?: { palette?: Record<string, string | null> | null } | null;
    typography?: {
      primary?: { name?: string } | null;
      secondary?: { name?: string } | null;
      size?: { base?: number | null } | null;
    } | null;
  } | null;
}

function summarize(branding: RawBranding | null): StylingSummary {
  const tokens = branding?.designTokens;
  const palette = tokens?.colors?.palette ?? {};
  const fonts = [
    { role: "Primary", name: tokens?.typography?.primary?.name },
    { role: "Secondary", name: tokens?.typography?.secondary?.name },
  ].filter((font): font is { role: string; name: string } =>
    Boolean(font.name),
  );
  return {
    colors: Object.values(palette).filter((c): c is string => Boolean(c)),
    fonts,
    baseSize: tokens?.typography?.size?.base ?? null,
  };
}

export interface PublishedStyling {
  configurationId: string;
  styling: CheckoutStyling;
  summary: StylingSummary;
}

/**
 * The published checkout and accounts configuration's branding, or null
 * when the store has none published. Callers check `canStyleCheckout`
 * first. Market overrides aren't read: only the base styling syncs.
 */
export async function readCheckoutStyling(
  admin: AdminApiContext,
): Promise<PublishedStyling | null> {
  const list = await query<{
    checkoutAndAccountsConfigurations?: {
      nodes: { id: string; isPublished: boolean }[];
    };
  }>(admin, CONFIGURATIONS_QUERY);
  const published = list.checkoutAndAccountsConfigurations?.nodes.find(
    (node) => node.isPublished,
  );
  if (!published) return null;

  const { checkoutAndAccountsConfiguration: configuration } = await query<{
    checkoutAndAccountsConfiguration?: { branding: unknown } | null;
  }>(admin, CHECKOUT_STYLING_QUERY, { id: published.id });
  const branding = configuration?.branding ?? null;
  return {
    configurationId: published.id,
    styling: toCheckoutStyling(branding),
    summary: summarize(branding as RawBranding | null),
  };
}
