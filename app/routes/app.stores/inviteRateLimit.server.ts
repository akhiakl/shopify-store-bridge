import { and, count, eq, gte } from "drizzle-orm";

import db from "~/db.server";
import { connections } from "~/db/schema.server";

/** Connection requests one source store may send per rolling hour (#68).
 * Generous for a merchant connecting a handful of stores at once, low
 * enough to stop scripted invite spam. */
export const INVITES_PER_HOUR = 20;

const HOUR_MS = 60 * 60 * 1000;

/**
 * Whether `sourceStoreId` has hit its hourly invite limit. Counts the
 * source's connections requested in the last hour: a new invite, or a
 * declined one reopened, sets `requestedAt`. "Resend link" doesn't, since
 * it only reissues the token of a request already counted.
 */
export async function inviteLimitReached(
  sourceStoreId: string,
): Promise<boolean> {
  const [{ value }] = await db
    .select({ value: count() })
    .from(connections)
    .where(
      and(
        eq(connections.sourceStoreId, sourceStoreId),
        gte(connections.requestedAt, new Date(Date.now() - HOUR_MS)),
      ),
    );
  return value >= INVITES_PER_HOUR;
}
