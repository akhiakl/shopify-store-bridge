import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import { readTopLevelErrors } from "./runMutation.server";
import {
  COLLECTION_BY_HANDLE_QUERY,
  CUSTOMER_ID_BY_EMAIL_QUERY,
  METAFIELD_REFERENCES_QUERY,
  METAOBJECT_ID_BY_HANDLE_QUERY,
  PRODUCT_ID_BY_HANDLE_QUERY,
} from "./syncQueries.server";

/** A record identified the only way both stores agree on: products and
 * collections by handle, metaobjects by (type, handle), customers by
 * email. */
export type RecordRef =
  | { kind: "Product" | "Collection"; handle: string }
  | { kind: "Metaobject"; type: string; handle: string }
  | { kind: "Customer"; emailAddress: string };

const REFERENCE_KINDS: Record<string, RecordRef["kind"]> = {
  product_reference: "Product",
  collection_reference: "Collection",
  metaobject_reference: "Metaobject",
};

/** The record kind a value of this metafield type points at, if it's a
 * reference type that can be synced. */
export function referenceKind(type: string): RecordRef["kind"] | undefined {
  return REFERENCE_KINDS[type.replace(/^list\./, "")];
}

/** Any other reference (file, variant, page, customer, mixed, …) points
 * at a record with no identity shared across stores. */
export function isUnsupportedReference(type: string): boolean {
  return type.includes("_reference") && !referenceKind(type);
}

/** The source GIDs a reference value holds. */
export function referencedIds(type: string, value: string): string[] {
  return type.startsWith("list.") ? (JSON.parse(value) as string[]) : [value];
}

const refCacheKey = (ref: RecordRef) =>
  ref.kind === "Customer"
    ? `Customer/${ref.emailAddress}`
    : ref.kind === "Metaobject"
      ? `Metaobject/${ref.type}/${ref.handle}`
      : `${ref.kind}/${ref.handle}`;

/** Resolves source GIDs to their cross-store identity in one lookup. GIDs
 * that no longer exist on the source are left out. */
export async function resolveSourceRefs(
  sourceAdmin: AdminApiContext,
  ids: string[],
): Promise<Map<string, RecordRef>> {
  const refs = new Map<string, RecordRef>();
  if (ids.length === 0) return refs;
  const response = await sourceAdmin.graphql(METAFIELD_REFERENCES_QUERY, {
    variables: { ids },
  });
  const body = (await response.json()) as {
    data?: {
      nodes: ({
        __typename: string;
        id: string;
        type?: string;
        handle?: string;
      } | null)[];
    };
  };
  const error = readTopLevelErrors(body);
  if (error) throw new Error(error);
  for (const node of body.data?.nodes ?? []) {
    if (!node?.handle) continue;
    if (node.__typename === "Metaobject" && node.type) {
      refs.set(node.id, {
        kind: "Metaobject",
        type: node.type,
        handle: node.handle,
      });
    } else if (
      node.__typename === "Product" ||
      node.__typename === "Collection"
    ) {
      refs.set(node.id, { kind: node.__typename, handle: node.handle });
    }
  }
  return refs;
}

function lookupFor(ref: RecordRef): {
  query: string;
  variables: Record<string, unknown>;
  field: string;
} {
  switch (ref.kind) {
    case "Product":
      return {
        query: PRODUCT_ID_BY_HANDLE_QUERY,
        variables: { handle: ref.handle },
        field: "productByIdentifier",
      };
    case "Collection":
      return {
        query: COLLECTION_BY_HANDLE_QUERY,
        variables: { handle: ref.handle },
        field: "collectionByIdentifier",
      };
    case "Metaobject":
      return {
        query: METAOBJECT_ID_BY_HANDLE_QUERY,
        variables: { handle: { type: ref.type, handle: ref.handle } },
        field: "metaobjectByHandle",
      };
    case "Customer":
      return {
        query: CUSTOMER_ID_BY_EMAIL_QUERY,
        variables: { emailAddress: ref.emailAddress },
        field: "customerByIdentifier",
      };
  }
}

/** The target's GID for a record, or undefined when the target has no
 * matching record. Hits are cached per target, misses aren't. Throws on a
 * top-level GraphQL error (missing scope, unapproved customer access). */
export async function targetIdFor(
  targetAdmin: AdminApiContext,
  ref: RecordRef,
  cache: Map<string, string>,
): Promise<string | undefined> {
  const cached = cache.get(refCacheKey(ref));
  if (cached) return cached;
  const { query, variables, field } = lookupFor(ref);
  const response = await targetAdmin.graphql(query, { variables });
  const body = (await response.json()) as {
    data?: Record<string, { id: string } | null>;
  };
  const error = readTopLevelErrors(body);
  if (error) throw new Error(error);
  const id = body.data?.[field]?.id;
  if (id) cache.set(refCacheKey(ref), id);
  return id;
}

export function describeRef(ref: RecordRef): string {
  if (ref.kind === "Customer") return "customer with that email";
  if (ref.kind === "Metaobject") return `${ref.type}/${ref.handle}`;
  return `${ref.kind.toLowerCase()} ${ref.handle}`;
}
