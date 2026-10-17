import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { and, desc, eq } from "drizzle-orm";

import db from "~/db.server";
import { connections } from "~/db/schema.server";
import { syncJobs } from "~/db/syncJobsSchema.server";
import { unauthenticated } from "~/shopify.server";

import { readTopLevelErrors } from "./runMutation.server";

/**
 * Metaobject webhooks need a `type:` filter naming each type (no
 * wildcard), so they can't be in shopify.app.toml. Instead each source
 * store gets its own subscriptions, through the Admin API, for the entry
 * types its auto-sync connections last synced.
 */
const TOPICS = ["METAOBJECTS_CREATE", "METAOBJECTS_UPDATE"] as const;
const WEBHOOK_PATH = "/webhooks/source-changed";

const EXISTING_QUERY = `#graphql
  query MetaobjectSubscriptions($topics: [WebhookSubscriptionTopic!], $uri: String) {
    webhookSubscriptions(first: 10, topics: $topics, uri: $uri) {
      nodes { id topic filter }
    }
  }
`;
const CREATE = `#graphql
  mutation MetaobjectSubscriptionCreate($topic: WebhookSubscriptionTopic!, $sub: WebhookSubscriptionInput!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: $sub) {
      webhookSubscription { id }
      userErrors { field message }
    }
  }
`;
const UPDATE = `#graphql
  mutation MetaobjectSubscriptionUpdate($id: ID!, $sub: WebhookSubscriptionInput!) {
    webhookSubscriptionUpdate(id: $id, webhookSubscription: $sub) {
      webhookSubscription { id }
      userErrors { field message }
    }
  }
`;
const DELETE = `#graphql
  mutation MetaobjectSubscriptionDelete($id: ID!) {
    webhookSubscriptionDelete(id: $id) {
      deletedWebhookSubscriptionId
      userErrors { field message }
    }
  }
`;

type Existing = { id: string; topic: string; filter: string | null };

/** Entry types (`metaobjectEntries:<type>`) in the last sync of each of
 * the shop's approved auto-sync connections. */
export async function autoSyncEntryTypes(shop: string): Promise<string[]> {
  const rows = await db.query.connections.findMany({
    where: and(
      eq(connections.autoSync, true),
      eq(connections.status, "APPROVED"),
    ),
    with: { source: true },
  });
  const types = new Set<string>();
  for (const connection of rows) {
    if (connection.source.shop !== shop) continue;
    const last = await db.query.syncJobs.findFirst({
      where: eq(syncJobs.connectionId, connection.id),
      columns: { selection: true },
      orderBy: [desc(syncJobs.startedAt)],
    });
    for (const key of (last?.selection as string[] | undefined) ?? []) {
      const [kind, type] = key.split(":");
      if (kind === "metaobjectEntries" && type) types.add(type);
    }
  }
  return [...types].sort();
}

/** `type:a OR type:b`, or null when there's nothing to watch. */
export function typeFilter(types: string[]): string | null {
  return types.length ? types.map((t) => `type:${t}`).join(" OR ") : null;
}

async function run(
  admin: AdminApiContext,
  query: string,
  variables: Record<string, unknown>,
): Promise<void> {
  const response = await admin.graphql(query, { variables });
  const body = (await response.json()) as {
    data?: Record<string, { userErrors?: { message: string }[] } | undefined>;
  };
  const error =
    readTopLevelErrors(body) ??
    Object.values(body.data ?? {})[0]
      ?.userErrors?.map((e) => e.message)
      .join("; ");
  if (error) throw new Error(error);
}

/** Makes the shop's two metaobject subscriptions match `filter`: created,
 * updated, or deleted when the filter is null. */
export async function reconcileSubscriptions(
  admin: AdminApiContext,
  { uri, filter }: { uri: string; filter: string | null },
): Promise<void> {
  const response = await admin.graphql(EXISTING_QUERY, {
    variables: { topics: TOPICS, uri },
  });
  const body = (await response.json()) as {
    data?: { webhookSubscriptions?: { nodes: Existing[] } };
  };
  const error = readTopLevelErrors(body);
  if (error) throw new Error(error);
  const existing = body.data?.webhookSubscriptions?.nodes ?? [];

  for (const topic of TOPICS) {
    const current = existing.find((sub) => sub.topic === topic);
    if (!filter) {
      if (current) await run(admin, DELETE, { id: current.id });
    } else if (!current) {
      await run(admin, CREATE, { topic, sub: { uri, filter } });
    } else if (current.filter !== filter) {
      await run(admin, UPDATE, { id: current.id, sub: { uri, filter } });
    }
  }
}

/**
 * Brings a source store's metaobject subscriptions in line with its
 * auto-sync connections. Called when auto-sync is switched and when a
 * sync on an auto-sync connection is queued (it may add types). Failures
 * are logged, not thrown: the sync or switch itself already succeeded,
 * and the next change retries.
 */
export async function refreshMetaobjectSubscriptions(
  shop: string,
): Promise<void> {
  const appUrl = process.env.SHOPIFY_APP_URL;
  if (!appUrl) return;
  try {
    const filter = typeFilter(await autoSyncEntryTypes(shop));
    const { admin } = await unauthenticated.admin(shop);
    await reconcileSubscriptions(admin, {
      uri: new URL(WEBHOOK_PATH, appUrl).toString(),
      filter,
    });
  } catch (error) {
    console.error(
      `Couldn't update metaobject webhook subscriptions for ${shop}:`,
      error,
    );
  }
}
