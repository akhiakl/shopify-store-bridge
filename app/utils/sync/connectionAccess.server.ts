import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { eq } from "drizzle-orm";

import db from "~/db.server";
import { connections } from "~/db/schema.server";
import { unauthenticated } from "~/shopify.server";

export type ConnectionAccess = NonNullable<
  Awaited<ReturnType<typeof getConnectionAccess>>
>;

/**
 * Who `shop` is on this connection. The source can open it in any state
 * (it sees why syncing is unavailable while pending or declined); the
 * target only once it has approved, and then pulls into itself. Anyone
 * else gets null. `shop` must be the caller's session.shop, never
 * form/URL input.
 */
export async function getConnectionAccess(connectionId: string, shop: string) {
  const connection = await db.query.connections.findFirst({
    where: eq(connections.id, connectionId),
    with: { source: true, target: true },
  });
  if (!connection) return null;
  if (connection.source.shop === shop) {
    return { connection, role: "source" as const };
  }
  if (connection.target.shop === shop && connection.status === "APPROVED") {
    return { connection, role: "target" as const };
  }
  return null;
}

/** Admin client for the connection's source. A target viewer has no
 * source session of its own, so it goes through the source's stored
 * offline session, the same way sync jobs reach the other store. */
export async function sourceAdminFor(
  access: ConnectionAccess,
  sessionAdmin: AdminApiContext,
): Promise<AdminApiContext> {
  if (access.role === "source") return sessionAdmin;
  const { admin } = await unauthenticated.admin(access.connection.source.shop);
  return admin;
}
