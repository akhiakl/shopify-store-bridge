import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import type {
  EntryField,
  MetaobjectEntryRow,
  MetaobjectRef,
} from "./metaobjectEntries.server";
import {
  createOne,
  readTopLevelErrors,
  type CreateResult,
} from "./runMutation.server";
import {
  METAOBJECT_ID_BY_HANDLE_QUERY,
  METAOBJECT_UPSERT_MUTATION,
} from "./syncQueries.server";

/** Cache of target metaobject GIDs by `type/handle`, shared across one
 * target's entries. Only hits are cached: an entry created later in the
 * same run must still be findable. */
export type TargetIdCache = Map<string, string>;

const refKey = (ref: MetaobjectRef) => `${ref.type}/${ref.handle}`;

/** Any reference other than a metaobject one points at a record (product,
 * file, page, …) that has no shared identity across stores yet. */
function unsupportedField(fields: EntryField[]): EntryField | undefined {
  return fields.find(
    (f) => f.value !== null && f.type.includes("_reference") && !f.refs,
  );
}

async function targetIdFor(
  targetAdmin: AdminApiContext,
  ref: MetaobjectRef,
  cache: TargetIdCache,
): Promise<string | undefined> {
  const cached = cache.get(refKey(ref));
  if (cached) return cached;
  const response = await targetAdmin.graphql(METAOBJECT_ID_BY_HANDLE_QUERY, {
    variables: { handle: ref },
  });
  const body = (await response.json()) as {
    data?: { metaobjectByHandle?: { id: string } | null };
  };
  const error = readTopLevelErrors(body);
  if (error) throw new Error(error);
  const id = body.data?.metaobjectByHandle?.id;
  if (id) cache.set(refKey(ref), id);
  return id;
}

/** Rebuilds a reference field's value from the target's own GIDs. */
async function targetValue(
  targetAdmin: AdminApiContext,
  field: EntryField & { refs: MetaobjectRef[] },
  cache: TargetIdCache,
): Promise<string> {
  const ids: string[] = [];
  for (const ref of field.refs) {
    const id = await targetIdFor(targetAdmin, ref, cache);
    if (!id) {
      throw new Error(
        `Field "${field.key}" references ${refKey(ref)}, which doesn't exist on this store yet.`,
      );
    }
    ids.push(id);
  }
  return field.type.startsWith("list.") ? JSON.stringify(ids) : ids[0];
}

/**
 * Upserts one metaobject entry onto a target by (type, handle). Source is
 * authoritative for every field it has a value for. A field that's empty
 * on the source is left as-is on the target, and deleting a source entry
 * never deletes it on a target.
 */
export async function syncMetaobjectEntry(
  targetAdmin: AdminApiContext,
  entry: MetaobjectEntryRow,
  cache: TargetIdCache,
): Promise<CreateResult> {
  const unsupported = unsupportedField(entry.fields);
  if (unsupported) {
    return {
      ok: false,
      error: `Field "${unsupported.key}" is a ${unsupported.type}, which can't be synced yet.`,
    };
  }

  const fields: { key: string; value: string }[] = [];
  try {
    for (const field of entry.fields) {
      if (field.value === null) continue;
      const value = field.refs
        ? field.refs.length > 0
          ? await targetValue(
              targetAdmin,
              { ...field, refs: field.refs },
              cache,
            )
          : null
        : field.value;
      if (value !== null) fields.push({ key: field.key, value });
    }
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }

  return createOne(targetAdmin, METAOBJECT_UPSERT_MUTATION, {
    handle: { type: entry.type, handle: entry.handle },
    metaobject: {
      fields,
      ...(entry.status && {
        capabilities: { publishable: { status: entry.status } },
      }),
    },
  });
}
