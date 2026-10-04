const questions = [
  {
    question: "Do both stores need StoreBridge?",
    answer:
      "Yes. Install it on both. The store you invite approves the connection from its own admin.",
  },
  {
    question: "Can I sync to more than one store?",
    answer:
      "Yes. Connect each store separately; every connection has its own job history.",
  },
  {
    question: "Does it sync both ways?",
    answer:
      "No. Data flows from the source to the target. The target can start a sync, but only to pull into itself.",
  },
  {
    question: "What if something already exists on the target?",
    answer:
      "It's either updated in place or skipped, depending on the type. Job history says which, item by item.",
  },
  {
    question: "Why does checkout styling need Shopify Plus?",
    answer:
      "Shopify only lets apps change checkout styling on Plus and development stores, so both stores need it. Changes go live on the target right away, so StoreBridge asks you to confirm first.",
  },
] as const;

/** Answers to what merchants ask before connecting a store. Native
 * `<details>` so each answer opens without any script. */
export function FaqSection() {
  return (
    <section
      id="faq"
      className="mx-auto max-w-3xl px-6 py-16"
      aria-labelledby="faq-heading"
    >
      <h2 id="faq-heading" className="text-2xl font-bold">
        Questions
      </h2>
      <div className="mt-8 divide-y divide-neutral-200 border-y border-neutral-200">
        {questions.map((item) => (
          <details key={item.question} className="group py-4">
            <summary className="cursor-pointer list-none font-semibold">
              {item.question}
            </summary>
            <p className="mt-2 text-sm text-neutral-600">{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
