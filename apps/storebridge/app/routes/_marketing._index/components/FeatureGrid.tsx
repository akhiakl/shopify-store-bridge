import { Card } from "~/components/ui/Card";

const features = [
  {
    title: "Store pairing",
    body: "Connect a source store to one or more target stores, with each pairing approved from the target side before anything syncs.",
  },
  {
    title: "Definition sync",
    body: "Push metaobject and metafield definitions — and SHOP-level metafield values — from a source store to its approved targets with one click.",
  },
  {
    title: "Job history",
    body: "See exactly what synced, what was skipped as already existing, and what failed, per target and per item.",
  },
] as const;

/** Restates the three core capabilities as scannable cards. */
export function FeatureGrid() {
  return (
    <section
      id="features"
      className="mx-auto max-w-5xl px-6 py-16"
      aria-labelledby="features-heading"
    >
      <h2 id="features-heading" className="sr-only">
        Features
      </h2>
      <div className="grid gap-6 md:grid-cols-3">
        {features.map((feature) => (
          <Card key={feature.title} className="p-6">
            <p className="font-semibold">{feature.title}</p>
            <p className="mt-2 text-sm text-neutral-600">{feature.body}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}
