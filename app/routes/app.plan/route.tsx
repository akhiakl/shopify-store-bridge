import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data, useLoaderData } from "react-router";

import { AppVersion } from "~/components/AppVersion";
import { authenticate } from "~/shopify.server";
import { billingIsTest } from "~/utils/billing/paidPlan.server";
import {
  FREE_CONNECTION_LIMIT,
  PRO_PLAN,
  PRO_PRICE_USD,
} from "~/utils/billing/plans";

import { CancelPlanButton } from "./components/CancelPlanButton";
import { UpgradeButton } from "./components/UpgradeButton";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing } = await authenticate.admin(request);
  const { appSubscriptions } = await billing.check({
    plans: [PRO_PLAN],
    isTest: billingIsTest(),
  });
  const subscription = appSubscriptions[0];
  return {
    subscription: subscription
      ? { id: subscription.id, test: subscription.test }
      : null,
  };
};

/** "upgrade" sends the merchant to Shopify's approval page (billing.request
 * throws that redirect); "cancel" ends the subscription right away,
 * prorated. */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const isTest = billingIsTest();

  if (intent === "upgrade") {
    return billing.request({ plan: PRO_PLAN, isTest });
  }
  if (intent === "cancel") {
    await billing.cancel({
      subscriptionId: String(formData.get("subscriptionId") ?? ""),
      isTest,
      prorate: true,
    });
    return { ok: true } as const;
  }
  throw data("Unknown intent.", { status: 400 });
};

const FREE_FEATURES = [
  `${FREE_CONNECTION_LIMIT} connected store`,
  "Metafields, metaobjects and collections",
  "Manual sync",
];
const PRO_FEATURES = [
  "Unlimited connected stores",
  "Everything: policies, menus, locations, shipping, checkout styling, pages and blogs",
  "Auto-sync",
];

function FeatureList({ items }: { items: string[] }) {
  return (
    <s-unordered-list>
      {items.map((item) => (
        <s-list-item key={item}>{item}</s-list-item>
      ))}
    </s-unordered-list>
  );
}

/** The store's plan (#111). Limits apply to the source store of a
 * connection, since it's the one sharing its data. */
export default function Plan() {
  const { subscription } = useLoaderData<typeof loader>();
  const isPro = subscription !== null;

  return (
    <s-page heading="Plan">
      <s-section heading="Free">
        <s-stack gap="base">
          {!isPro && <s-badge tone="info">Current plan</s-badge>}
          <FeatureList items={FREE_FEATURES} />
        </s-stack>
      </s-section>
      <s-section heading={`Pro: $${PRO_PRICE_USD} USD every 30 days`}>
        <s-stack gap="base">
          {isPro && (
            <s-stack direction="inline" gap="small-200">
              <s-badge tone="success">Current plan</s-badge>
              {subscription.test && <s-badge>Test charge</s-badge>}
            </s-stack>
          )}
          <FeatureList items={PRO_FEATURES} />
          {isPro ? (
            <CancelPlanButton subscriptionId={subscription.id} />
          ) : (
            <UpgradeButton />
          )}
        </s-stack>
      </s-section>
      <AppVersion />
    </s-page>
  );
}
