import { describe, expect, it, vi } from "vitest";

import { buildSourceInputs } from "./collectionRuleInputs.server";
import type { PlannedSource } from "./collectionRules.server";

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

const everything = {
  MetafieldDefinitionId: () => ({ metafieldDefinition: { id: "gid://T/Def" } }),
  MetaobjectIdByHandle: ({ handle }: Record<string, unknown>) => ({
    metaobjectByHandle: {
      id: `gid://T/M/${(handle as { handle: string }).handle}`,
    },
  }),
  ProductIdByHandle: ({ handle }: Record<string, unknown>) => ({
    productByIdentifier: { id: `gid://T/P/${handle as string}` },
  }),
  CollectionByHandle: ({ handle }: Record<string, unknown>) => ({
    collectionByIdentifier: { id: `gid://T/C/${handle as string}` },
  }),
};

const def = { ownerType: "PRODUCT", namespace: "c", key: "chef" };

const conditions: PlannedSource = {
  kind: "conditions",
  title: "Rules",
  description: null,
  targetType: "PRODUCTS",
  inclusion: {
    matchType: "ALL",
    products: ["hat"],
    conditions: [
      { field: "productTag", input: { relation: "EQUALS", values: ["a"] } },
      {
        field: "metafieldMetaobjectList",
        input: { relation: "CONTAINS", matchType: "ANY" },
        definition: def,
        metaobjects: [{ type: "chef", handle: "ana" }],
        metaobjectList: true,
      },
      {
        field: "metafieldMetaobject",
        input: { relation: "EQUALS" },
        definition: def,
        metaobjects: [{ type: "chef", handle: "bo" }],
      },
    ],
  },
  exclusion: {
    matchType: null,
    products: ["sock"],
    conditions: [
      {
        field: "collection",
        input: { matchType: "ANY" },
        collections: ["sale"],
      },
    ],
  },
};

const lookup = (admin: ReturnType<typeof target>) => ({
  targetAdmin: admin as never,
  cache: new Map<string, string>(),
});

describe("buildSourceInputs", () => {
  it("builds the target's source inputs with the target's IDs", async () => {
    const admin = target(everything);

    const result = await buildSourceInputs(lookup(admin), [
      conditions,
      {
        kind: "subCollections",
        title: "Kids",
        description: null,
        collections: ["kids"],
      },
    ]);

    expect(result).toEqual({
      inputs: [
        {
          source: {
            title: "Rules",
            description: null,
            targetType: "PRODUCTS",
            inclusion: {
              matchType: "ALL",
              conditions: [
                { productTag: { relation: "EQUALS", values: ["a"] } },
                {
                  metafieldMetaobjectList: {
                    relation: "CONTAINS",
                    matchType: "ANY",
                    definitionId: "gid://T/Def",
                    values: ["gid://T/M/ana"],
                  },
                },
                {
                  metafieldMetaobject: {
                    relation: "EQUALS",
                    definitionId: "gid://T/Def",
                    value: "gid://T/M/bo",
                  },
                },
              ],
              selections: [{ productId: "gid://T/P/hat" }],
            },
            exclusion: {
              conditions: [
                {
                  collection: { matchType: "ANY", values: ["gid://T/C/sale"] },
                },
              ],
              selections: [{ productId: "gid://T/P/sock" }],
            },
          },
        },
        {
          subCollections: {
            title: "Kids",
            description: null,
            collectionIds: ["gid://T/C/kids"],
          },
        },
      ],
    });
    // The shared definition is looked up once.
    expect(
      admin.graphql.mock.calls.filter(([q]) =>
        q.includes("MetafieldDefinitionId"),
      ),
    ).toHaveLength(1);
  });

  it.each([
    [
      "MetafieldDefinitionId",
      { metafieldDefinition: null },
      "Its rules use the c.chef metafield definition, which isn't on this store.",
    ],
    [
      "MetaobjectIdByHandle",
      { metaobjectByHandle: null },
      "Its rules use the chef entry ana, which isn't on this store.",
    ],
    [
      "ProductIdByHandle",
      { productByIdentifier: null },
      "Its rules use product hat, which isn't on this store.",
    ],
  ])("skips when %s finds nothing", async (operation, missing, reason) => {
    const admin = target({ ...everything, [operation]: () => missing });
    expect(await buildSourceInputs(lookup(admin), [conditions])).toEqual({
      skipped: reason,
    });
  });

  it("throws on a GraphQL error during a lookup", async () => {
    const admin = target(everything, { MetafieldDefinitionId: "Throttled" });
    await expect(
      buildSourceInputs(lookup(admin), [conditions]),
    ).rejects.toThrow("Throttled");
  });
});
