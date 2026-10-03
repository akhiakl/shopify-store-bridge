import { describe, expect, it, vi } from "vitest";

import { planCollectionRules } from "./collectionRules.server";

function admin(data: unknown, errors?: { message: string }[]) {
  return {
    graphql: vi.fn(() =>
      Promise.resolve({ json: () => Promise.resolve({ data, errors }) }),
    ),
  };
}

const noPicks = { nodes: [], pageInfo: { hasNextPage: false } };

const sources = (...list: unknown[]) => ({
  collectionByIdentifier: { sources: list },
});

const conditionsSource = (inclusion: unknown, exclusion: unknown = null) => ({
  __typename: "CollectionConditionsSource",
  title: "Rules",
  description: null,
  shareable: false,
  targetType: "PRODUCTS",
  inclusion,
  exclusion,
});

describe("planCollectionRules", () => {
  it("keeps plain conditions as their input and swaps IDs for cross-store keys", async () => {
    const source = admin(
      sources(
        conditionsSource(
          {
            matchType: "ALL",
            conditions: [
              {
                __typename: "CollectionSourceInclusionConditionProductTag",
                productTagRelation: "EQUALS",
                productTagMatchType: "ANY",
                productTagValues: ["summer"],
              },
              {
                __typename: "CollectionSourceInclusionConditionVariantPrice",
                variantPriceRelation: "LESS_THAN",
                variantPriceValue: { amount: "20.0", currencyCode: "USD" },
              },
              {
                __typename: "CollectionSourceInclusionConditionProductCategory",
                productCategoryRelation: "EQUALS",
                productCategoryMatchType: "ANY",
                productCategoryValues: [
                  { category: { id: "gid://Tax/1" }, includeDescendants: true },
                ],
              },
              {
                __typename:
                  "CollectionSourceInclusionConditionMetafieldMetaobjectList",
                definition: {
                  ownerType: "PRODUCT",
                  namespace: "c",
                  key: "chef",
                },
                metafieldMetaobjectListRelation: "CONTAINS",
                metafieldMetaobjectListMatchType: "ANY",
                metafieldMetaobjectListValues: [
                  { type: "chef", handle: "ana" },
                ],
              },
              {
                __typename:
                  "CollectionSourceInclusionConditionMetafieldMetaobject",
                definition: {
                  ownerType: "PRODUCT",
                  namespace: "c",
                  key: "lead",
                },
                metafieldMetaobjectRelation: "EQUALS",
                metafieldMetaobjectValue: { type: "chef", handle: "bo" },
              },
            ],
            selections: {
              nodes: [{ product: { handle: "hat" }, variantIds: [] }],
              pageInfo: { hasNextPage: false },
            },
          },
          {
            matchType: "ANY",
            conditions: [
              {
                __typename: "CollectionSourceExclusionConditionCollection",
                collectionMatchType: "ANY",
                collectionValues: [{ handle: "sale" }],
              },
            ],
            selections: noPicks,
          },
        ),
        {
          __typename: "CollectionSubCollectionsSource",
          title: "Kids",
          description: "Sub",
          collections: [{ handle: "kids-hats" }],
        },
      ),
    );

    const rules = await planCollectionRules(source as never, "summer");

    expect(source.graphql).toHaveBeenCalledWith(expect.any(String), {
      variables: { handle: "summer" },
    });
    expect(rules).toEqual({
      sources: [
        {
          kind: "conditions",
          title: "Rules",
          description: null,
          targetType: "PRODUCTS",
          inclusion: {
            matchType: "ALL",
            products: ["hat"],
            conditions: [
              {
                field: "productTag",
                input: {
                  relation: "EQUALS",
                  matchType: "ANY",
                  values: ["summer"],
                },
              },
              {
                field: "variantPrice",
                input: {
                  relation: "LESS_THAN",
                  value: { amount: "20.0", currencyCode: "USD" },
                },
              },
              {
                field: "productCategory",
                input: {
                  relation: "EQUALS",
                  matchType: "ANY",
                  values: [
                    { categoryId: "gid://Tax/1", includeDescendants: true },
                  ],
                },
              },
              {
                field: "metafieldMetaobjectList",
                input: { relation: "CONTAINS", matchType: "ANY" },
                definition: {
                  ownerType: "PRODUCT",
                  namespace: "c",
                  key: "chef",
                },
                metaobjects: [{ type: "chef", handle: "ana" }],
                metaobjectList: true,
              },
              {
                field: "metafieldMetaobject",
                input: { relation: "EQUALS" },
                definition: {
                  ownerType: "PRODUCT",
                  namespace: "c",
                  key: "lead",
                },
                metaobjects: [{ type: "chef", handle: "bo" }],
              },
            ],
          },
          exclusion: {
            matchType: "ANY",
            products: [],
            conditions: [
              {
                field: "collection",
                input: { matchType: "ANY" },
                collections: ["sale"],
              },
            ],
          },
        },
        {
          kind: "subCollections",
          title: "Kids",
          description: "Sub",
          collections: ["kids-hats"],
        },
      ],
    });
  });

  it.each([
    [
      "an unknown rule type",
      conditionsSource({
        matchType: "ALL",
        conditions: [
          { __typename: "CollectionSourceInclusionConditionUnknown" },
        ],
        selections: noPicks,
      }),
      "It has a rule type this app doesn't know yet.",
    ],
    [
      "a source from another app",
      {
        ...conditionsSource({ conditions: [], selections: noPicks }),
        shareable: true,
      },
      "Its rules come from another app.",
    ],
    [
      "variant picks",
      conditionsSource({
        matchType: null,
        conditions: [],
        selections: {
          nodes: [{ product: { handle: "hat" }, variantIds: ["gid://V/1"] }],
          pageInfo: { hasNextPage: false },
        },
      }),
      "It picks specific variants, which can't be matched.",
    ],
    [
      "more than 250 picks",
      conditionsSource({
        matchType: null,
        conditions: [],
        selections: { nodes: [], pageInfo: { hasNextPage: true } },
      }),
      "It picks more than 250 products by hand.",
    ],
    [
      "an unknown source type",
      { __typename: "CollectionShinySource", title: "?", description: null },
      "It uses a rule source this app doesn't know yet.",
    ],
  ])("skips the whole rule set for %s", async (_, source, reason) => {
    expect(
      await planCollectionRules(admin(sources(source)) as never, "summer"),
    ).toEqual({ skipped: reason });
  });

  it("skips when the rules can't be read, and has none for a missing collection", async () => {
    expect(
      await planCollectionRules(
        admin(null, [{ message: "Throttled" }]) as never,
        "summer",
      ),
    ).toEqual({ skipped: "Its rules couldn't be read: Throttled" });
    expect(
      await planCollectionRules(
        admin({ collectionByIdentifier: null }) as never,
        "gone",
      ),
    ).toEqual({ sources: [] });
  });
});
