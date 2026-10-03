import { Card } from "~/components/ui/Card";

const features = [
  {
    title: "One connection per store",
    body: "Invite a store by its domain. It joins through a one-time link you send it, so only someone you trusted with the link can connect.",
  },
  {
    title: "Pick exactly what syncs",
    body: "Choose items type by type, check which are out of sync first, and start the sync from either store.",
  },
  {
    title: "Job history",
    body: "Every sync shows what was copied, what was skipped because it already existed, and what failed and why.",
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
