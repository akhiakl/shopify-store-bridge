import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import { readTopLevelErrors } from "./runMutation.server";

/**
 * A collection's rules in the `sources` model. Each condition type has
 * its own `relation` enum and value type, and GraphQL can't merge
 * same-named fields of different types, so every condition field is
 * aliased with its input key (`productTagValues`, …). Scope read_products;
 * metafield definitions also need the owner's read scope, which the
 * declared write scopes cover.
 */
const COLLECTION_RULES_QUERY = `#graphql
  query CollectionRules($handle: String!) {
    collectionByIdentifier(identifier: { handle: $handle }) {
      sources {
        __typename
        title
        description
        ... on CollectionConditionsSource {
          shareable
          targetType
          inclusion {
            matchType
            conditions {
              __typename
              ... on CollectionSourceInclusionConditionMetafieldBoolean { definition { ownerType namespace key } metafieldBooleanRelation: relation metafieldBooleanValue: value }
              ... on CollectionSourceInclusionConditionMetafieldDecimal { definition { ownerType namespace key } metafieldDecimalRelation: relation metafieldDecimalValue: value }
              ... on CollectionSourceInclusionConditionMetafieldInteger { definition { ownerType namespace key } metafieldIntegerRelation: relation metafieldIntegerValue: value }
              ... on CollectionSourceInclusionConditionMetafieldMetaobject { definition { ownerType namespace key } metafieldMetaobjectRelation: relation metafieldMetaobjectValue: value { type handle } }
              ... on CollectionSourceInclusionConditionMetafieldMetaobjectList { definition { ownerType namespace key } metafieldMetaobjectListRelation: relation metafieldMetaobjectListMatchType: matchType metafieldMetaobjectListValues: values { type handle } }
              ... on CollectionSourceInclusionConditionMetafieldString { definition { ownerType namespace key } metafieldStringRelation: relation metafieldStringMatchType: matchType metafieldStringValues: values }
              ... on CollectionSourceInclusionConditionMetafieldStringList { definition { ownerType namespace key } metafieldStringListRelation: relation metafieldStringListMatchType: matchType metafieldStringListValues: values }
              ... on CollectionSourceInclusionConditionProductCategory { productCategoryRelation: relation productCategoryMatchType: matchType productCategoryValues: values { category { id } includeDescendants } }
              ... on CollectionSourceInclusionConditionProductStatus { productStatusRelation: relation productStatusMatchType: matchType productStatusValues: values }
              ... on CollectionSourceInclusionConditionProductTag { productTagRelation: relation productTagMatchType: matchType productTagValues: values }
              ... on CollectionSourceInclusionConditionProductTitle { productTitleRelation: relation productTitleMatchType: matchType productTitleValues: values }
              ... on CollectionSourceInclusionConditionProductType { productTypeRelation: relation productTypeMatchType: matchType productTypeValues: values }
              ... on CollectionSourceInclusionConditionProductVendor { productVendorRelation: relation productVendorMatchType: matchType productVendorValues: values }
              ... on CollectionSourceInclusionConditionVariantCompareAtPrice { variantCompareAtPriceRelation: relation variantCompareAtPriceValue: value { amount currencyCode } }
              ... on CollectionSourceInclusionConditionVariantInventory { variantInventoryRelation: relation variantInventoryValue: value }
              ... on CollectionSourceInclusionConditionVariantPrice { variantPriceRelation: relation variantPriceValue: value { amount currencyCode } }
              ... on CollectionSourceInclusionConditionVariantTitle { variantTitleRelation: relation variantTitleMatchType: matchType variantTitleValues: values }
              ... on CollectionSourceInclusionConditionVariantWeight { variantWeightRelation: relation variantWeightValue: value { unit value } }
            }
            selections(first: 250) {
              nodes { product { handle } variantIds }
              pageInfo { hasNextPage }
            }
          }
          exclusion {
            matchType
            conditions {
              __typename
              ... on CollectionSourceExclusionConditionCollection { collectionMatchType: matchType collectionValues: values { handle } }
              ... on CollectionSourceExclusionConditionProductCategory { productCategoryRelation: relation productCategoryMatchType: matchType productCategoryValues: values { category { id } includeDescendants } }
              ... on CollectionSourceExclusionConditionProductTag { productTagRelation: relation productTagMatchType: matchType productTagValues: values }
              ... on CollectionSourceExclusionConditionProductType { productTypeRelation: relation productTypeMatchType: matchType productTypeValues: values }
              ... on CollectionSourceExclusionConditionProductVendor { productVendorRelation: relation productVendorMatchType: matchType productVendorValues: values }
            }
            selections(first: 250) {
              nodes { product { handle } }
              pageInfo { hasNextPage }
            }
          }
        }
        ... on CollectionSubCollectionsSource {
          collections { handle }
        }
      }
    }
  }
`;

export interface DefinitionRef {
  ownerType: string;
  namespace: string;
  key: string;
}

/** One condition, as its input field (`productTag`, …) and value. IDs are
 * replaced by cross-store keys, resolved per target at sync time. */
export interface PlannedCondition {
  field: string;
  input: Record<string, unknown>;
  definition?: DefinitionRef;
  /** Metaobject values (`value` for one, `values` for a list). */
  metaobjects?: { type: string; handle: string }[];
  metaobjectList?: boolean;
  /** Collection handles for an exclusion's `collection` condition. */
  collections?: string[];
}

export interface PlannedGroup {
  matchType: string | null;
  conditions: PlannedCondition[];
  /** Product handles picked by hand. */
  products: string[];
}

export type PlannedSource =
  | {
      kind: "conditions";
      title: string;
      description: string | null;
      targetType: string;
      inclusion: PlannedGroup;
      exclusion: PlannedGroup | null;
    }
  | {
      kind: "subCollections";
      title: string;
      description: string | null;
      collections: string[];
    };

/** A collection's rules, or why they can't be synced. */
export type PlannedRules = { sources: PlannedSource[] } | { skipped: string };

type RawNode = Record<string, unknown> & { __typename: string };

interface RawGroup {
  matchType: string | null;
  conditions: RawNode[];
  selections: {
    nodes: { product: { handle: string }; variantIds?: string[] | null }[];
    pageInfo: { hasNextPage: boolean };
  };
}

type RawSource = RawNode & {
  title: string;
  description: string | null;
  shareable?: boolean;
  targetType?: string;
  inclusion?: RawGroup;
  exclusion?: RawGroup | null;
  collections?: { handle: string }[];
};

/** Thrown while planning; becomes the collection's `skipped` reason. */
class Unmappable extends Error {}

const CONDITION_PREFIX = /^CollectionSource(In|Ex)clusionCondition/;

function planCondition(node: RawNode): PlannedCondition {
  const name = node.__typename.replace(CONDITION_PREFIX, "");
  if (name === "Unknown") {
    throw new Unmappable("It has a rule type this app doesn't know yet.");
  }
  const field = name[0].toLowerCase() + name.slice(1);
  const at = (suffix: string) => node[field + suffix];
  const input: Record<string, unknown> = {};
  if (at("Relation") !== undefined) input.relation = at("Relation");
  if (at("MatchType") !== undefined) input.matchType = at("MatchType");
  const condition: PlannedCondition = { field, input };
  const definition = node.definition as DefinitionRef | undefined;
  if (definition) condition.definition = definition;

  const value = at("Value");
  const values = at("Values") as unknown[] | undefined;
  if (field === "metafieldMetaobject") {
    condition.metaobjects = [value as { type: string; handle: string }];
  } else if (field === "metafieldMetaobjectList") {
    condition.metaobjects = values as { type: string; handle: string }[];
    condition.metaobjectList = true;
  } else if (field === "collection") {
    condition.collections = (values as { handle: string }[]).map(
      (c) => c.handle,
    );
  } else if (field === "productCategory") {
    input.values = (
      values as { category: { id: string }; includeDescendants: boolean }[]
    ).map((v) => ({
      categoryId: v.category.id,
      includeDescendants: v.includeDescendants,
    }));
  } else if (values !== undefined) {
    input.values = values;
  } else {
    // Scalars, money and weight already have their input shape.
    input.value = value;
  }
  return condition;
}

function planGroup(group: RawGroup): PlannedGroup {
  if (group.selections.pageInfo.hasNextPage) {
    throw new Unmappable("It picks more than 250 products by hand.");
  }
  if (group.selections.nodes.some((s) => s.variantIds?.length)) {
    throw new Unmappable("It picks specific variants, which can't be matched.");
  }
  return {
    matchType: group.matchType,
    conditions: group.conditions.map(planCondition),
    products: group.selections.nodes.map((s) => s.product.handle),
  };
}

function planSource(source: RawSource): PlannedSource {
  const base = { title: source.title, description: source.description };
  if (source.__typename === "CollectionSubCollectionsSource") {
    return {
      kind: "subCollections",
      ...base,
      collections: (source.collections ?? []).map((c) => c.handle),
    };
  }
  if (source.__typename !== "CollectionConditionsSource" || !source.inclusion) {
    throw new Unmappable("It uses a rule source this app doesn't know yet.");
  }
  if (source.shareable) {
    throw new Unmappable("Its rules come from another app.");
  }
  return {
    kind: "conditions",
    ...base,
    targetType: source.targetType ?? "PRODUCTS",
    inclusion: planGroup(source.inclusion),
    exclusion: source.exclusion ? planGroup(source.exclusion) : null,
  };
}

/**
 * Reads one collection's rules and replaces every ID in them with a key
 * both stores share: metafield definitions by owner type/namespace/key,
 * metaobjects by type/handle, products and collections by handle. Any
 * part that has no such key makes the whole rule set `skipped`, since
 * dropping one rule could widen what the collection matches.
 */
export async function planCollectionRules(
  admin: AdminApiContext,
  handle: string,
): Promise<PlannedRules> {
  const response = await admin.graphql(COLLECTION_RULES_QUERY, {
    variables: { handle },
  });
  const body = (await response.json()) as {
    data?: { collectionByIdentifier?: { sources: RawSource[] } | null };
  };
  const error = readTopLevelErrors(body);
  if (error) return { skipped: `Its rules couldn't be read: ${error}` };
  const sources = body.data?.collectionByIdentifier?.sources ?? [];
  try {
    return { sources: sources.map(planSource) };
  } catch (err) {
    if (err instanceof Unmappable) return { skipped: err.message };
    throw err;
  }
}
