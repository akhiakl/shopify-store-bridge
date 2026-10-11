import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import { withFileIds, type CheckoutStyling } from "./checkoutBrandingInput";
import {
  canStyleCheckout,
  readCheckoutStyling,
} from "./checkoutStyling.server";
import {
  allStylingAreas,
  isInAreas,
  mirrorBranding,
} from "./checkoutStylingAreas";
import {
  CHECKOUT_STYLING_KEY,
  checkoutOverrideKey,
  checkoutStylingAreaKey,
} from "./definitionKey";
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

/** The source's styling as a job plan saves it. Plain JSON. */
export interface CheckoutStylingPlan extends CheckoutStyling {
  /** Areas to mirror. Absent means every area either store sets, as in
   * plans queued before areas could be picked one by one. */
  areas?: string[];
  /** Selected market overrides, by name. */
  overrides?: { name: string; styling: CheckoutStyling }[];
}

export interface StylingSyncResult {
  key: string;
  result: CreateResult;
}

/** Copies the files `areas` point at to the target (their IDs are
 * per-store), then builds that branding input with the target's IDs. */
async function brandingInput({
  admin,
  cache,
  source,
  target,
  areas,
}: {
  admin: AdminApiContext;
  cache: TargetIdCache;
  source: CheckoutStyling;
  target: unknown;
  areas: string[];
}) {
  const ids = [];
  for (const ref of source.files) {
    if (!isInAreas(ref.path, areas)) continue;
    ids.push({ path: ref.path, id: await ensureTargetFile(admin, ref, cache) });
  }
  return withFileIds(
    mirrorBranding({ source: source.branding, target, areas }),
    ids,
  );
}

function failAll(keys: string[], error: unknown): StylingSyncResult[] {
  const message = error instanceof Error ? error.message : String(error);
  return keys.map((key) => ({ key, result: { ok: false, error: message } }));
}

/**
 * Makes each selected area of the target's published configuration, and
 * each selected market override with the same name there, an exact copy
 * of the source's. It's live: Shopify has no API to create a draft one,
 * so the page asks for confirmation before queuing this. One result per
 * area and override, for job history.
 */
export async function syncCheckoutStyling(
  targetAdmin: AdminApiContext,
  plan: CheckoutStylingPlan,
  cache: TargetIdCache,
): Promise<StylingSyncResult[]> {
  const overrideKeys = (plan.overrides ?? []).map((o) =>
    checkoutOverrideKey(o.name),
  );
  const plannedKeys = [
    ...(plan.areas?.map(checkoutStylingAreaKey) ?? [CHECKOUT_STYLING_KEY]),
    ...overrideKeys,
  ];
  try {
    if (!(await canStyleCheckout(targetAdmin))) {
      return failAll(
        plannedKeys,
        "This store isn't on Shopify Plus, so its checkout styling can't be changed.",
      );
    }
    const target = await readCheckoutStyling(targetAdmin);
    if (!target) {
      return failAll(
        plannedKeys,
        "This store has no published checkout configuration.",
      );
    }
    const areas =
      plan.areas ?? allStylingAreas(plan.branding, target.styling.branding);
    const branding = await brandingInput({
      admin: targetAdmin,
      cache,
      source: plan,
      target: target.styling.branding,
      areas,
    });

    const missing: StylingSyncResult[] = [];
    const overrides = [];
    for (const override of plan.overrides ?? []) {
      const match = target.overrides.find((o) => o.name === override.name);
      if (!match) {
        missing.push({
          key: checkoutOverrideKey(override.name),
          result: {
            ok: false,
            error: `This store has no "${override.name}" market override. Create it in the checkout editor, then sync again.`,
          },
        });
        continue;
      }
      overrides.push({
        key: checkoutOverrideKey(override.name),
        id: match.id,
        branding: await brandingInput({
          admin: targetAdmin,
          cache,
          source: override.styling,
          target: match.styling.branding,
          areas: allStylingAreas(
            override.styling.branding,
            match.styling.branding,
          ),
        }),
      });
    }

    if (areas.length === 0 && overrides.length === 0) {
      return missing.length
        ? missing
        : [{ key: CHECKOUT_STYLING_KEY, result: { ok: true, skipped: true } }];
    }
    const result = await createOne(
      targetAdmin,
      CHECKOUT_STYLING_UPDATE_MUTATION,
      {
        id: target.configurationId,
        configuration: {
          ...(areas.length ? { branding } : {}),
          ...(overrides.length
            ? {
                overrides: overrides.map(({ id, branding: b }) => ({
                  id,
                  branding: b,
                })),
              }
            : {}),
        },
      },
    );
    return [
      ...areas.map((area) => ({ key: checkoutStylingAreaKey(area), result })),
      ...overrides.map(({ key }) => ({ key, result })),
      ...missing,
    ];
  } catch (error) {
    return failAll(plannedKeys, error);
  }
}
