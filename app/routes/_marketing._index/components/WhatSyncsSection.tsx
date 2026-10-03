const types = [
  {
    name: "Metafields",
    detail:
      "Definitions, plus their values on products, collections, customers and the store itself.",
  },
  {
    name: "Metaobjects",
    detail: "Definitions and their entries.",
  },
  {
    name: "Shop policies",
    detail: "Refund, privacy, shipping, terms of service and the rest.",
  },
  {
    name: "Collections",
    detail: "Including the rules behind smart collections.",
  },
  {
    name: "Menus",
    detail: "Navigation menus and their links, matched by handle.",
  },
  {
    name: "Locations",
    detail: "Name, address, and whether each one fulfills online orders.",
  },
  {
    name: "Checkout styling",
    detail:
      "Colors, fonts and logos for checkout, customer accounts and sign-in. Shopify Plus only.",
  },
] as const;

/** Each syncable type in one line, so a merchant can tell at a glance
 * whether what they need is covered. */
export function WhatSyncsSection() {
  return (
    <section
      id="what-syncs"
      className="mx-auto max-w-5xl px-6 py-16"
      aria-labelledby="what-syncs-heading"
    >
      <h2 id="what-syncs-heading" className="text-2xl font-bold">
        What syncs
      </h2>
      <p className="mt-2 text-neutral-600">
        Copy only what you select. Products, orders and customers themselves
        stay in each store.
      </p>
      <dl className="mt-8 grid gap-x-12 gap-y-6 md:grid-cols-2">
        {types.map((type) => (
          <div key={type.name} className="border-t border-neutral-200 pt-4">
            <dt className="font-semibold">{type.name}</dt>
            <dd className="mt-1 text-sm text-neutral-600">{type.detail}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
