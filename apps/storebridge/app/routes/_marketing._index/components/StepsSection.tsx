const steps = [
  {
    number: "01",
    label: "Pair",
    title: "Connect a source store to targets",
    body: "Point one or more target stores at a source store to pull definitions and shop metafield values from.",
  },
  {
    number: "02",
    label: "Approve",
    title: "Reviewed from the target side",
    body: "Nothing lands until the target store approves the pairing — no accidental cross-store changes.",
  },
  {
    number: "03",
    label: "Sync",
    title: "One click, every approved target",
    body: "Push metaobject and metafield definitions to every approved target, and see exactly what synced.",
  },
] as const;

/** "How it works" — three-step summary of the pairing → approval → sync flow. */
export function StepsSection() {
  return (
    <section
      id="how-it-works"
      className="bg-neutral-900 py-16 text-white"
      aria-labelledby="how-it-works-heading"
    >
      <div className="mx-auto max-w-5xl px-6">
        <h2 id="how-it-works-heading" className="text-2xl font-bold">
          Three steps from pairing to a synced store
        </h2>
        <div className="mt-10 grid gap-8 md:grid-cols-3">
          {steps.map((step) => (
            <div key={step.number} className="border-t border-neutral-700 pt-4">
              <p className="font-mono text-xs text-neutral-400">
                {step.number} — {step.label.toUpperCase()}
              </p>
              <p className="mt-2 font-semibold">{step.title}</p>
              <p className="mt-1 text-sm text-neutral-400">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
