import { metafieldValueKey } from "./definitionKey";
import {
  describeRef,
  isUnsupportedReference,
  referenceKind,
  referencedIds,
  resolveSourceRefs,
  targetIdFor,
  type RecordRef,
} from "./metafieldReferences.server";
import type { MetafieldValueSet } from "./metafieldValues.server";
import { createOne, readTopLevelErrors } from "./runMutation.server";
import {
  METAFIELD_VALUE_SOURCES_QUERY,
  METAFIELDS_SET_MUTATION,
} from "./syncQueries.server";
import type {
  StepContext,
  SyncItemResult,
  SyncStep,
} from "./syncTarget.server";

/** `metafieldsSet` takes at most 25 metafields per call. */
export const VALUE_BATCH_SIZE = 25;

type Definition = MetafieldValueSet["definition"];

interface SourceRecord {
  id: string;
  handle?: string;
  defaultEmailAddress?: { emailAddress: string | null } | null;
  metafield: { type: string; value: string } | null;
}

/** How this record is matched on a target. A customer without an email
 * can't be matched. */
function ownerRef(def: Definition, record: SourceRecord): RecordRef | null {
  if (def.ownerType === "CUSTOMER") {
    const emailAddress = record.defaultEmailAddress?.emailAddress;
    return emailAddress ? { kind: "Customer", emailAddress } : null;
  }
  const kind = def.ownerType === "PRODUCT" ? "Product" : "Collection";
  return record.handle ? { kind, handle: record.handle } : null;
}

/** Customers are keyed by source GID so emails never reach job history. */
function recordLabel(def: Definition, id: string, record?: SourceRecord) {
  return def.ownerType !== "CUSTOMER" && record?.handle ? record.handle : id;
}

async function readSources(
  ctx: StepContext,
  def: Definition,
  ids: string[],
): Promise<Map<string, SourceRecord>> {
  const response = await ctx.sourceAdmin.graphql(
    METAFIELD_VALUE_SOURCES_QUERY,
    {
      variables: { ids, namespace: def.namespace, key: def.key },
    },
  );
  const body = (await response.json()) as {
    data?: { nodes: (SourceRecord | null)[] };
  };
  const error = readTopLevelErrors(body);
  if (error) throw new Error(error);
  const records = new Map<string, SourceRecord>();
  for (const node of body.data?.nodes ?? [])
    if (node?.id) records.set(node.id, node);
  return records;
}

/** The value to write on the target: unchanged, or for a reference type
 * rebuilt from the target's own GIDs. Throws with the reason it can't be
 * synced. */
async function targetValue(
  ctx: StepContext,
  metafield: { type: string; value: string },
  refs: Map<string, RecordRef>,
): Promise<string> {
  if (isUnsupportedReference(metafield.type)) {
    throw new Error(`It's a ${metafield.type}, which can't be synced yet.`);
  }
  if (!referenceKind(metafield.type)) return metafield.value;
  const ids: string[] = [];
  for (const sourceId of referencedIds(metafield.type, metafield.value)) {
    const ref = refs.get(sourceId);
    if (!ref) continue; // deleted on the source since; drop it
    const id = await targetIdFor(ctx.targetAdmin, ref, ctx.targetIds);
    if (!id)
      throw new Error(
        `It references ${describeRef(ref)}, which isn't on this store.`,
      );
    ids.push(id);
  }
  if (metafield.type.startsWith("list.")) return JSON.stringify(ids);
  // An empty single reference would fail the whole (atomic) batch.
  if (!ids[0])
    throw new Error("It references a record deleted on the source store.");
  return ids[0];
}

type Pending = { key: string; input: Record<string, string> };

async function prepare(
  ctx: StepContext,
  {
    def,
    id,
    record,
    refs,
  }: {
    def: Definition;
    id: string;
    record?: SourceRecord;
    refs: Map<string, RecordRef>;
  },
): Promise<Pending | SyncItemResult> {
  const key = metafieldValueKey(def, recordLabel(def, id, record));
  const skip = (reason: string): SyncItemResult => ({
    key,
    kind: "VALUE",
    status: "SKIPPED",
    errorMessage: reason,
  });
  if (!record) return skip("No longer exists on the source store.");
  if (!record.metafield)
    return skip("No longer has a value on the source store.");
  const ref = ownerRef(def, record);
  if (!ref) return skip("Has no email to match on.");
  try {
    const ownerId = await targetIdFor(ctx.targetAdmin, ref, ctx.targetIds);
    if (!ownerId) return skip(`No matching ${describeRef(ref)} on this store.`);
    const value = await targetValue(ctx, record.metafield, refs);
    return {
      key,
      input: {
        ownerId,
        namespace: def.namespace,
        key: def.key,
        type: record.metafield.type,
        value,
      },
    };
  } catch (error) {
    return {
      key,
      kind: "VALUE",
      status: "FAILED",
      errorMessage: (error as Error).message,
    };
  }
}

async function syncBatch(
  ctx: StepContext,
  def: Definition,
  ids: string[],
): Promise<SyncItemResult[]> {
  let records: Map<string, SourceRecord>;
  let refs: Map<string, RecordRef>;
  try {
    records = await readSources(ctx, def, ids);
    const refIds = [...records.values()].flatMap((r) =>
      r.metafield && referenceKind(r.metafield.type)
        ? referencedIds(r.metafield.type, r.metafield.value)
        : [],
    );
    refs = await resolveSourceRefs(ctx.sourceAdmin, [...new Set(refIds)]);
  } catch (error) {
    return ids.map((id) => ({
      key: metafieldValueKey(def, id),
      kind: "VALUE",
      status: "FAILED",
      errorMessage: (error as Error).message,
    }));
  }

  const results: SyncItemResult[] = [];
  const pending: Pending[] = [];
  for (const id of ids) {
    const prepared = await prepare(ctx, {
      def,
      id,
      record: records.get(id),
      refs,
    });
    if ("input" in prepared) pending.push(prepared);
    else results.push(prepared);
  }
  if (pending.length === 0) return results;

  // metafieldsSet is atomic: the batch's writes all land or none do.
  const result = await createOne(ctx.targetAdmin, METAFIELDS_SET_MUTATION, {
    metafields: pending.map((p) => p.input),
  });
  return [
    ...results,
    ...pending.map(({ key }): SyncItemResult =>
      result.ok
        ? { key, kind: "VALUE", status: "SUCCEEDED", errorMessage: null }
        : { key, kind: "VALUE", status: "FAILED", errorMessage: result.error },
    ),
  ];
}

/** One step per batch of up to VALUE_BATCH_SIZE records. */
export function metafieldValueSteps(set: MetafieldValueSet): SyncStep[] {
  const steps: SyncStep[] = [];
  for (let i = 0; i < set.ownerIds.length; i += VALUE_BATCH_SIZE) {
    const ids = set.ownerIds.slice(i, i + VALUE_BATCH_SIZE);
    steps.push((ctx) => syncBatch(ctx, set.definition, ids));
  }
  return steps;
}
