import { buttonVariants } from "~/components/ui/Button";
import { Card } from "~/components/ui/Card";
import {
  FREE_FEATURES,
  PRO_FEATURES,
  PRO_PRICE_USD,
} from "~/utils/billing/plans";
import { cn } from "~/utils/cn";

const plans = [
  { name: "Free", price: "$0", features: FREE_FEATURES, highlight: false },
  {
    name: "Pro",
    price: `$${PRO_PRICE_USD}`,
    features: PRO_FEATURES,
    highlight: true,
  },
] as const;

/** The two plans (#111), from the same constants the app bills with. */
export function PricingSection() {
  return (
    <section
      id="pricing"
      className="mx-auto max-w-5xl px-6 py-16"
      aria-labelledby="pricing-heading"
    >
      <h2 id="pricing-heading" className="text-2xl font-bold">
        Pricing
      </h2>
      <p className="mt-2 text-neutral-600">
        The store you sync from picks the plan. Billed through Shopify, in USD,
        every 30 days. Cancel any time from the app.
      </p>
      <div className="mt-8 grid gap-6 md:grid-cols-2">
        {plans.map((plan) => (
          <Card
            key={plan.name}
            className={cn(
              "flex flex-col p-6",
              plan.highlight && "border-neutral-900",
            )}
          >
            <p className="font-semibold">{plan.name}</p>
            <p className="mt-2">
              <span className="text-3xl font-bold">{plan.price}</span>
              <span className="text-sm text-neutral-500"> / 30 days</span>
            </p>
            <ul className="mt-4 flex-1 space-y-2 text-sm text-neutral-600">
              {plan.features.map((feature) => (
                <li key={feature} className="flex gap-2">
                  <span aria-hidden="true">✓</span>
                  {feature}
                </li>
              ))}
            </ul>
            <a
              href="#login"
              className={cn(
                buttonVariants({
                  variant: plan.highlight ? "default" : "outline",
                }),
                "mt-6",
              )}
            >
              {plan.highlight ? "Install, then upgrade" : "Install free"}
            </a>
          </Card>
        ))}
      </div>
    </section>
  );
}
