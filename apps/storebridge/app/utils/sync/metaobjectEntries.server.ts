import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import { ENTRY_CAP_PER_TYPE } from "./syncCaps";

const PAGE_SIZE = 50;

/** Checked against the pinned 2026-10 schema: read_metaobjects. */
const METAOBJECT_ENTRIES_QUERY = `#graphql
  query MetaobjectEntries($type: String!, $first: Int!, $after: String) {
    metaobjects(type: $type, first: $first, after: $after) {
      nodes {
        handle
        capabilities { publishable { status } }
        fields { key type value }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const METAOBJECT_REFS_QUERY = `#graphql
  query MetaobjectRefs($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Metaobject { id type handle }
    }
  }
`;

const REFERENCE_TYPES = new Set([
  "metaobject_reference",
  "list.metaobject_reference",
]);

export interface MetaobjectRef {
  type: string;
  handle: string;
}

export interface EntryField {
  key: string;
  type: string;
  value: string | null;
  /** For metaobject references: the referenced entries by (type, handle),
   * the only identity both stores share. Source GIDs are meaningless on a
   * target, so `value` is rebuilt from these per target. */
  refs?: MetaobjectRef[];
}

export interface MetaobjectEntryRow {
  type: string;
  handle: string;
  status: "ACTIVE" | "DRAFT" | null;
  fields: EntryField[];
}

interface EntryNode {
  handle: string;
  capabilities: { publishable: { status: "ACTIVE" | "DRAFT" } | null };
  fields: { key: string; type: string; value: string | null }[];
}

interface Page {
  nodes: EntryNode[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}

async function fetchEntryNodes(
  admin: AdminApiContext,
  type: string,
): Promise<EntryNode[]> {
  const nodes: EntryNode[] = [];
  let after: string | null = null;
  while (nodes.length < ENTRY_CAP_PER_TYPE) {
    const response: Response = await admin.graphql(METAOBJECT_ENTRIES_QUERY, {
      variables: { type, first: PAGE_SIZE, after },
    });
    const body = (await response.json()) as { data?: { metaobjects?: Page } };
    const page = body.data?.metaobjects;
    nodes.push(...(page?.nodes ?? []));
    if (!page?.pageInfo.hasNextPage) break;
    after = page.pageInfo.endCursor;
  }
  return nodes.slice(0, ENTRY_CAP_PER_TYPE);
}

function referencedIds(field: EntryNode["fields"][number]): string[] {
  if (!REFERENCE_TYPES.has(field.type) || !field.value) return [];
  return field.type.startsWith("list.")
    ? (JSON.parse(field.value) as string[])
    : [field.value];
}

async function resolveRefs(
  admin: AdminApiContext,
  ids: string[],
): Promise<Map<string, MetaobjectRef>> {
  const refs = new Map<string, MetaobjectRef>();
  // `nodes(ids:)` takes at most 250 ids per call.
  for (let i = 0; i < ids.length; i += 250) {
    const response = await admin.graphql(METAOBJECT_REFS_QUERY, {
      variables: { ids: ids.slice(i, i + 250) },
    });
    const { data } = await response.json();
    for (const node of data?.nodes ?? []) {
      if (node?.id) refs.set(node.id, { type: node.type, handle: node.handle });
    }
  }
  return refs;
}

/** Orders entries so a type referenced by another selected type is synced
 * first, letting its references resolve on the target in the same run.
 * Cycles fall back to selection order; anything still unresolved fails
 * that entry and succeeds on a re-run. */
function orderByDependencies(
  types: string[],
  entries: MetaobjectEntryRow[],
): MetaobjectEntryRow[] {
  const deps = new Map(types.map((type) => [type, new Set<string>()]));
  for (const entry of entries) {
    for (const ref of entry.fields.flatMap((f) => f.refs ?? [])) {
      if (ref.type !== entry.type && deps.has(ref.type)) {
        deps.get(entry.type)?.add(ref.type);
      }
    }
  }
  const ordered: string[] = [];
  const visiting = new Set<string>();
  const visit = (type: string) => {
    if (ordered.includes(type) || visiting.has(type)) return;
    visiting.add(type);
    deps.get(type)?.forEach(visit);
    ordered.push(type);
  };
  types.forEach(visit);
  return ordered.flatMap((type) => entries.filter((e) => e.type === type));
}

/** Reads up to ENTRY_CAP_PER_TYPE entries of each selected type from the
 * source, with metaobject reference values rewritten as (type, handle). */
export async function getMetaobjectEntries(
  admin: AdminApiContext,
  types: string[],
): Promise<MetaobjectEntryRow[]> {
  const nodesByType = await Promise.all(
    types.map(async (type) => ({
      type,
      nodes: await fetchEntryNodes(admin, type),
    })),
  );
  const ids = [
    ...new Set(
      nodesByType.flatMap(({ nodes }) =>
        nodes.flatMap((n) => n.fields.flatMap(referencedIds)),
      ),
    ),
  ];
  const refs = ids.length > 0 ? await resolveRefs(admin, ids) : new Map();

  const entries = nodesByType.flatMap(({ type, nodes }) =>
    nodes.map((node) => ({
      type,
      handle: node.handle,
      status: node.capabilities.publishable?.status ?? null,
      fields: node.fields.map((field) => {
        const fieldIds = referencedIds(field);
        return fieldIds.length === 0
          ? field
          : {
              ...field,
              refs: fieldIds
                .map((id) => refs.get(id))
                .filter((ref): ref is MetaobjectRef => Boolean(ref)),
            };
      }),
    })),
  );
  return orderByDependencies(types, entries);
}
