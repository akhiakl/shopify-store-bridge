import { describe, expect, it, vi } from "vitest";

import type { PlannedRules } from "./collectionRules.server";
import { collectionRulesStep } from "./syncCollectionRules.server";
import { createStepContext } from "./syncTarget.server";

function jsonResponse(data: unknown, errors?: { message: string }[]) {
  return { json: () => Promise.resolve({ data, errors }) };
}

const tagRule: PlannedRules = {
  sources: [
    {
      kind: "conditions",
      title: "Rules",
      description: null,
      targetType: "PRODUCTS",
      inclusion: {
        matchType: "ALL",
        products: [],
        conditions: [
          { field: "productTag", input: { relation: "EQUALS", values: ["a"] } },
        ],
      },
      exclusion: null,
    },
  ],
};

/** A target whose collection lookup returns `collection`, and whose
 * update returns `userErrors`. */
function target(
  collection: unknown,
  opts: { userErrors?: unknown[]; lookupError?: string } = {},
) {
  return {
    graphql: vi.fn((query: string) => {
      if (query.includes("TargetCollectionSources")) {
        return Promise.resolve(
          opts.lookupError
            ? jsonResponse(null, [{ message: opts.lookupError }])
            : jsonResponse({ collectionByIdentifier: collection }),
        );
      }
      if (query.includes("ProductIdByHandle")) {
        return Promise.reject(new Error("Network down"));
      }
      return Promise.resolve(
        jsonResponse({
          collectionUpdate: {
            collection: { id: "gid://T/C/1" },
            userErrors: opts.userErrors ?? [],
          },
        }),
      );
    }),
  };
}

function run(rules: PlannedRules, admin: ReturnType<typeof target>) {
  return collectionRulesStep(
    "summer",
    rules,
  )(createStepContext({} as never, admin as never));
}

const row = (status: string, errorMessage: string | null = null) => [
  { key: "collectionRules:summer", kind: "DEFINITION", status, errorMessage },
];

describe("collectionRulesStep", () => {
  it("replaces the target's own rules in one update, keeping other apps' sources", async () => {
    const admin = target({
      id: "gid://T/C/1",
      sources: [
        { id: "gid://S/own", shareable: false },
        { id: "gid://S/sub" },
        { id: "gid://S/app", shareable: true },
      ],
    });

    expect(await run(tagRule, admin)).toEqual(row("SUCCEEDED"));
    expect(admin.graphql).toHaveBeenLastCalledWith(
      expect.stringContaining("collectionUpdate"),
      {
        variables: {
          collection: {
            id: "gid://T/C/1",
            sourcesToDelete: ["gid://S/own", "gid://S/sub"],
            sourcesToCreate: [
              {
                source: {
                  title: "Rules",
                  description: null,
                  targetType: "PRODUCTS",
                  inclusion: {
                    matchType: "ALL",
                    conditions: [
                      { productTag: { relation: "EQUALS", values: ["a"] } },
                    ],
                    selections: [],
                  },
                },
              },
            ],
          },
        },
      },
    );
  });

  it("records a planned skip without touching the target", async () => {
    const admin = target(null);
    expect(
      await run({ skipped: "Its rules come from another app." }, admin),
    ).toEqual(row("SKIPPED", "Its rules come from another app."));
    expect(admin.graphql).not.toHaveBeenCalled();
  });

  it("leaves the target's rules alone when something they use is missing there", async () => {
    const admin = {
      graphql: vi.fn((query: string) =>
        Promise.resolve(
          query.includes("TargetCollectionSources")
            ? jsonResponse({
                collectionByIdentifier: { id: "gid://T/C/1", sources: [] },
              })
            : jsonResponse({ productByIdentifier: null }),
        ),
      ),
    };
    const withPick: PlannedRules = {
      sources: [
        {
          kind: "conditions",
          title: "Picks",
          description: null,
          targetType: "PRODUCTS",
          inclusion: { matchType: null, products: ["hat"], conditions: [] },
          exclusion: null,
        },
      ],
    };

    expect(await run(withPick, admin as never)).toEqual(
      row("SKIPPED", "Its rules use product hat, which isn't on this store."),
    );
    expect(
      admin.graphql.mock.calls.some(([q]) => q.includes("collectionUpdate")),
    ).toBe(false);
  });

  it.each([
    [
      "the lookup errors",
      target(null, { lookupError: "Throttled" }),
      "Throttled",
    ],
    [
      "the collection isn't there",
      target(null),
      "The collection isn't on this store.",
    ],
    [
      "the update is rejected",
      target(
        { id: "gid://T/C/1", sources: [] },
        { userErrors: [{ message: "Too many rules" }] },
      ),
      "Too many rules",
    ],
  ])("fails when %s", async (_, admin, reason) => {
    expect(await run(tagRule, admin)).toEqual(row("FAILED", reason));
  });

  it("fails when a reference lookup throws", async () => {
    const admin = target({ id: "gid://T/C/1", sources: [] });
    const withPick: PlannedRules = {
      sources: [
        {
          kind: "subCollections",
          title: "Kids",
          description: null,
          collections: [],
        },
        {
          kind: "conditions",
          title: "Picks",
          description: null,
          targetType: "PRODUCTS",
          inclusion: { matchType: null, products: ["hat"], conditions: [] },
          exclusion: null,
        },
      ],
    };
    expect(await run(withPick, admin)).toEqual(row("FAILED", "Network down"));
  });
});
