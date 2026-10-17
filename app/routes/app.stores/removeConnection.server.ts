import { waitUntil } from "@vercel/functions";
import { eq } from "drizzle-orm";

import db from "~/db.server";
import { connections } from "~/db/schema.server";
import { refreshMetaobjectSubscriptions } from "~/utils/sync/metaobjectSubscriptions.server";

/**
 * Deletes a connection, along with its sync jobs (they cascade). The
 * source can remove one in any status: cancelling a pending invite,
 * disconnecting, or clearing a declined one. The target can disconnect or
 * clear a declined one, but answers a pending request with decline
 * instead, so the source sees it was declined. Either way the stores can
 * pair again later with a new invite. `shop` must be the caller's
 * session.shop, never form input.
 */
export async function removeConnection({
  connectionId,
  shop,
}: {
  connectionId: string;
  shop: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const connection = await db.query.connections.findFirst({
    where: eq(connections.id, connectionId),
    with: { source: true, target: true },
  });
  const isSource = connection?.source.shop === shop;
  const isTarget = connection?.target.shop === shop;
  if (!connection || (!isSource && !isTarget)) {
    return { ok: false, error: "Connection not found." };
  }
  if (!isSource && connection.status === "PENDING") {
    return { ok: false, error: "Decline the request instead." };
  }

  await db.delete(connections).where(eq(connections.id, connectionId));
  // Metaobject webhooks are per store (#149): drop the types only this
  // connection was auto-syncing.
  if (connection.autoSync) {
    waitUntil(refreshMetaobjectSubscriptions(connection.source.shop));
  }
  return { ok: true };
}
