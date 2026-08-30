import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { desc, eq } from "drizzle-orm";

import db from "~/db.server";
import { syncJobs, syncJobTargets } from "~/db/schema.server";
import { unauthenticated } from "~/shopify.server";

import {
  getDefinitionCatalog,
  type getOwnedGroup,
  type MetafieldDefinitionRow,
  type MetaobjectDefinitionRow,
} from "./definitions.server";

/**
 * Mutation shapes confirmed via Shopify's Admin GraphQL schema
 * (`graphql_schema` on `MetaobjectDefinitionCreateInput` /
 * `MetafieldDefinitionInput`) and `search_docs_chunks` for required scopes:
 * `write_metaobject_definitions` for the metaobject mutation (confirmed);
 * metafield definitions need the write scope matching their owner type
 * (e.g. `write_products`) — same "confirm per owner type as it's actually
 * used" stance `definitions.server.ts` already takes for the read side.
 */
const METAOBJECT_DEFINITION_CREATE_MUTATION = `#graphql
  mutation MetaobjectDefinitionCreate($definition: MetaobjectDefinitionCreateInput!) {
    metaobjectDefinitionCreate(definition: $definition) {
      metaobjectDefinition { id }
      userErrors { field message code }
    }
  }
`;

const METAFIELD_DEFINITION_CREATE_MUTATION = `#graphql
  mutation MetafieldDefinitionCreate($definition: MetafieldDefinitionInput!) {
    metafieldDefinitionCreate(definition: $definition) {
      createdDefinition { id }
      userErrors { field message code }
    }
  }
`;

interface ParsedSelection {
  metaobjectTypes: string[];
  metafieldSelectors: { ownerType: string; namespace: string; key: string }[];
}

/** Inverse of the `definitionKey` helpers in the checkbox components
 * (`metaobject:<type>`, `metafield:<ownerType>:<namespace>:<key>`) — safe
 * to split on ":" since Shopify's own validation rules for type/namespace/
 * key (alphanumeric, hyphen, underscore only) rule out embedded colons. */
export function parseSelection(keys: string[]): ParsedSelection {
  const metaobjectTypes: string[] = [];
  const metafieldSelectors: ParsedSelection["metafieldSelectors"] = [];
  for (const key of keys) {
    const [kind, ...rest] = key.split(":");
    if (kind === "metaobject") {
      metaobjectTypes.push(rest[0]);
    } else if (kind === "metafield") {
      const [ownerType, namespace, fieldKey] = rest;
      metafieldSelectors.push({ ownerType, namespace, key: fieldKey });
    }
  }
  return { metaobjectTypes, metafieldSelectors };
}

/** Never trusts the browser for the actual definition shape — only the
 * selection *keys* cross the wire; the definitions themselves are always
 * re-read from the source store right before syncing. */
async function resolveSelectedDefinitions(
  sourceAdmin: AdminApiContext,
  selection: ParsedSelection,
) {
  const catalog = await getDefinitionCatalog(sourceAdmin);
  const metaobjectDefinitions = catalog.metaobjectDefinitions.filter((def) =>
    selection.metaobjectTypes.includes(def.type),
  );
  const metafieldDefinitions = catalog.metafieldDefinitions.filter((def) =>
    selection.metafieldSelectors.some(
      (sel) =>
        sel.ownerType === def.ownerType &&
        sel.namespace === def.namespace &&
        sel.key === def.key,
    ),
  );
  return { metaobjectDefinitions, metafieldDefinitions };
}

/** Runs one create mutation and reports success/fail — no special
 * "already exists" handling in v1 (see docs/architecture/definition-sync.md):
 * a re-run just surfaces Shopify's own userError message. */
async function createOne(
  admin: AdminApiContext,
  query: string,
  variables: { definition: Record<string, unknown> },
): Promise<{ ok: boolean; error?: string }> {
  const response = await admin.graphql(query, { variables });
  const { data } = await response.json();
  const payload = Object.values(data ?? {})[0] as
    { userErrors: { message: string }[] } | undefined;
  const userErrors = payload?.userErrors ?? [];
  if (userErrors.length > 0) {
    return { ok: false, error: userErrors.map((e) => e.message).join("; ") };
  }
  return { ok: true };
}

async function syncToTarget(
  targetAdmin: AdminApiContext,
  metaobjectDefinitions: MetaobjectDefinitionRow[],
  metafieldDefinitions: MetafieldDefinitionRow[],
): Promise<{ itemsSynced: number; itemsFailed: number }> {
  let itemsSynced = 0;
  let itemsFailed = 0;

  for (const def of metaobjectDefinitions) {
    const result = await createOne(
      targetAdmin,
      METAOBJECT_DEFINITION_CREATE_MUTATION,
      {
        definition: {
          type: def.type,
          name: def.name,
          fieldDefinitions: def.fieldDefinitions.map((field) => ({
            key: field.key,
            name: field.name,
            type: field.type,
            required: field.required,
          })),
        },
      },
    );
    if (result.ok) itemsSynced++;
    else itemsFailed++;
  }

  for (const def of metafieldDefinitions) {
    const result = await createOne(
      targetAdmin,
      METAFIELD_DEFINITION_CREATE_MUTATION,
      {
        definition: {
          namespace: def.namespace,
          key: def.key,
          name: def.name,
          description: def.description ?? undefined,
          type: def.type,
          ownerType: def.ownerType,
        },
      },
    );
    if (result.ok) itemsSynced++;
    else itemsFailed++;
  }

  return { itemsSynced, itemsFailed };
}

type OwnedGroup = NonNullable<Awaited<ReturnType<typeof getOwnedGroup>>>;

/**
 * Runs one "Sync now" click: pushes the selected definitions from the
 * group's source (read via `sourceAdmin`, the caller's own authenticated
 * session) to each APPROVED target. Each target is reached with
 * `unauthenticated.admin(shop)` — a server-initiated admin context loaded
 * from that shop's own stored offline session, since this isn't a request
 * that shop made (see `@shopify/shopify-app-react-router`'s own docs on
 * `unauthenticated.admin`). No queue/worker involved — see
 * docs/architecture/definition-sync.md for why synchronous is fine here.
 */
export async function runSyncJob({
  group,
  selection,
  sourceAdmin,
}: {
  group: OwnedGroup;
  selection: string[];
  sourceAdmin: AdminApiContext;
}) {
  const approvedTargets = group.targets.filter(
    (target) => target.status === "APPROVED",
  );

  const [job] = await db
    .insert(syncJobs)
    .values({ groupId: group.id, selection })
    .returning();

  const parsed = parseSelection(selection);
  const { metaobjectDefinitions, metafieldDefinitions } =
    await resolveSelectedDefinitions(sourceAdmin, parsed);

  const targetStatuses: ("SUCCEEDED" | "FAILED" | "SKIPPED")[] = [];

  for (const target of approvedTargets) {
    try {
      const { admin: targetAdmin } = await unauthenticated.admin(
        target.store.shop,
      );
      const { itemsSynced, itemsFailed } = await syncToTarget(
        targetAdmin,
        metaobjectDefinitions,
        metafieldDefinitions,
      );
      const status = itemsFailed === 0 ? "SUCCEEDED" : "FAILED";
      targetStatuses.push(status);
      await db.insert(syncJobTargets).values({
        jobId: job.id,
        storeId: target.storeId,
        status,
        itemsSynced,
        itemsFailed,
      });
    } catch (error) {
      targetStatuses.push("FAILED");
      await db.insert(syncJobTargets).values({
        jobId: job.id,
        storeId: target.storeId,
        status: "FAILED",
        errorMessage:
          error instanceof Error ? error.message : "Couldn't reach this store.",
      });
    }
  }

  const finalStatus =
    targetStatuses.length === 0
      ? "SUCCEEDED"
      : targetStatuses.every((s) => s === "SUCCEEDED")
        ? "SUCCEEDED"
        : targetStatuses.every((s) => s === "FAILED")
          ? "FAILED"
          : "PARTIAL";

  await db
    .update(syncJobs)
    .set({ status: finalStatus, finishedAt: new Date() })
    .where(eq(syncJobs.id, job.id));

  return { id: job.id, status: finalStatus };
}

export async function getJobHistory(groupId: string) {
  return db.query.syncJobs.findMany({
    where: eq(syncJobs.groupId, groupId),
    with: { targets: { with: { store: true } } },
    orderBy: [desc(syncJobs.startedAt)],
    limit: 20,
  });
}
