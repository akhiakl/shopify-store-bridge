import { describe, expect, it, vi } from "vitest";

import type { PlannedMarketShipping } from "./marketShipping.server";
import { marketShippingStep } from "./syncMarketShipping.server";
import { createStepContext } from "./syncTarget.server";

function jsonResponse(data: unknown, errors?: { message: string }[]) {
  return { json: () => Promise.resolve({ data, errors }) };
}

type Handler = (variables: Record<string, unknown>) => unknown;

/** A target answering by operation name; `errors` makes that operation
 * return a top-level GraphQL error. */
function target(
  handlers: Record<string, Handler>,
  errors: Record<string, string> = {},
) {
  return {
    graphql: vi.fn(
      (query: string, opts?: { variables: Record<string, unknown> }) => {
        const name = /(?:query|mutation)\s+(\w+)/.exec(query)?.[1] ?? "";
        if (errors[name]) {
          return Promise.resolve(
            jsonResponse(null, [{ message: errors[name] }]),
          );
        }
        return Promise.resolve(
          jsonResponse(handlers[name]?.(opts?.variables ?? {}) ?? {}),
        );
      },
    ),
  };
}

const rate = { price: { amount: "10.0", currencyCode: "CAD" } };
const option = {
  type: "flatRate" as const,
  description: null,
  isActive: true,
  currency: "CAD",
  freeDeliveryMinimumValue: null,
};

const shipping: PlannedMarketShipping = {
  handle: "ca",
  name: "Canada",
  isEnabled: true,
  options: [
    {
      ...option,
      name: "Standard",
      rateGroups: [
        { locations: ["Warehouse"], collections: ["sofas"], rates: [rate] },
      ],
    },
    {
      ...option,
      name: "Express",
      rateGroups: [{ locations: [], collections: ["gone"], rates: [rate] }],
    },
  ],
  skipped: [{ item: "UPS", reason: "carrier" }],
};

const markets = (marketDrivenShipping: boolean, handle = "ca") => ({
  shop: { features: { marketDrivenShipping } },
  markets: {
    nodes: [
      {
        id: "gid://T/M/1",
        handle,
        delivery: {
          shipping: { optionDefinitions: { nodes: [{ id: "gid://T/O/1" }] } },
        },
      },
    ],
  },
});

const lookups = {
  TargetMarketShipping: () => markets(true),
  MarketShippingTargetLocations: () => ({
    locations: { nodes: [{ id: "gid://T/L/1", name: "Warehouse" }] },
  }),
  MarketShippingTargetCollection: ({ handle }: Record<string, unknown>) => ({
    collectionByIdentifier: handle === "sofas" ? { id: "gid://T/C/1" } : null,
  }),
  MarketShippingUpdate: () => ({
    marketUpdate: { market: { id: "gid://T/M/1" }, userErrors: [] },
  }),
};

function run(plan: PlannedMarketShipping, admin: ReturnType<typeof target>) {
  return marketShippingStep(plan)(
    createStepContext({} as never, admin as never),
  );
}

describe("marketShippingStep", () => {
  it("replaces the target market's options in one update, reporting what couldn't sync", async () => {
    const admin = target(lookups);
    const rows = await run(shipping, admin);

    expect(rows.map((r) => [r.key, r.status])).toEqual([
      ["marketShipping:ca", "SUCCEEDED"],
      ["marketShippingItem:ca:UPS", "SKIPPED"],
      ["marketShippingItem:ca:Express > Collection gone", "SKIPPED"],
      ["marketShippingItem:ca:Express", "SKIPPED"],
    ]);
    const [, write] = admin.graphql.mock.calls.at(-1) as [
      string,
      { variables: Record<string, unknown> },
    ];
    expect(write.variables).toEqual({
      id: "gid://T/M/1",
      input: {
        delivery: {
          shipping: {
            isEnabled: true,
            optionDefinitionsToDelete: ["gid://T/O/1"],
            optionDefinitionsToCreate: [
              {
                flatRate: expect.objectContaining({
                  name: "Standard",
                  rateGroups: [
                    {
                      conditions: {
                        originLocationsToAdd: ["gid://T/L/1"],
                        collectionsToAdd: ["gid://T/C/1"],
                      },
                      rate,
                    },
                  ],
                }),
              },
            ],
          },
        },
      },
    });
  });

  it("skips lookups for conditions the plan doesn't use, and handles a market with no shipping", async () => {
    const admin = target({
      ...lookups,
      TargetMarketShipping: () => {
        const data = markets(true);
        data.markets.nodes[0].delivery.shipping = null as never;
        return data;
      },
    });
    const plan = {
      ...shipping,
      options: [{ ...option, name: "Free", rateGroups: [] }],
      skipped: [],
    };
    expect((await run(plan, admin)).map((r) => r.status)).toEqual([
      "SUCCEEDED",
    ]);
    const names = admin.graphql.mock.calls.map(
      ([q]) => /(?:query|mutation)\s+(\w+)/.exec(q)?.[1],
    );
    expect(names).toEqual(["TargetMarketShipping", "MarketShippingUpdate"]);
    const [, write] = admin.graphql.mock.calls.at(-1) as [
      string,
      { variables: { input: { delivery: { shipping: unknown } } } },
    ];
    expect(write.variables.input.delivery.shipping).toMatchObject({
      optionDefinitionsToDelete: [],
    });
  });

  it("skips a target not on market-driven shipping, or without the market", async () => {
    const legacy = target({
      ...lookups,
      TargetMarketShipping: () => markets(false),
    });
    const [row] = await run(shipping, legacy);
    expect([row.status, row.errorMessage]).toEqual([
      "SKIPPED",
      expect.stringMatching(/delivery profiles/),
    ]);

    const noMarket = target({
      ...lookups,
      TargetMarketShipping: () => markets(true, "eu"),
    });
    const rows = await run(shipping, noMarket);
    expect(rows).toHaveLength(1);
    expect(rows[0].errorMessage).toMatch(/No market with this handle/);
    expect(noMarket.graphql).toHaveBeenCalledTimes(1);
  });

  it("fails the market when a lookup errors or the write is rejected", async () => {
    const lookupFails = target(lookups, {
      MarketShippingTargetLocations: "Throttled",
    });
    expect(await run(shipping, lookupFails)).toEqual([
      {
        key: "marketShipping:ca",
        kind: "DEFINITION",
        status: "FAILED",
        errorMessage: "Throttled",
      },
    ]);

    const writeFails = target({
      ...lookups,
      MarketShippingUpdate: () => ({
        marketUpdate: {
          market: null,
          userErrors: [{ message: "Name taken" }],
        },
      }),
    });
    const [row] = await run(shipping, writeFails);
    expect([row.status, row.errorMessage]).toEqual(["FAILED", "Name taken"]);

    const thrown = { graphql: vi.fn(() => Promise.reject("offline")) };
    const [offline] = await run(shipping, thrown as never);
    expect(offline.errorMessage).toBe("offline");
  });
});
