const steps = [
  {
    number: "01",
    label: "Connect",
    title: "Invite the other store",
    body: "Enter its domain in StoreBridge and send it the one-time link that comes back.",
  },
  {
    number: "02",
    label: "Approve",
    title: "The other store says yes",
    body: "Nothing syncs until someone at that store opens the link and approves the connection.",
  },
  {
    number: "03",
    label: "Sync",
    title: "Choose what to copy",
    body: "Pick items on each type's page and sync. Either store can start it; data always flows from the source to the target.",
  },
] as const;

/** "How it works": three-step summary of the connect → approve → sync flow. */
export function StepsSection() {
  return (
    <section
      id="how-it-works"
      className="bg-neutral-900 py-16 text-white"
      aria-labelledby="how-it-works-heading"
    >
      <div className="mx-auto max-w-5xl px-6">
        <h2 id="how-it-works-heading" className="text-2xl font-bold">
          Three steps from two stores to one setup
        </h2>
        <div className="mt-10 grid gap-8 md:grid-cols-3">
          {steps.map((step) => (
            <div key={step.number} className="border-t border-neutral-700 pt-4">
              <p className="font-mono text-xs text-neutral-400">
                {step.number} · {step.label.toUpperCase()}
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
