import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "~/db/schema.server";

// Supabase Postgres — see app/db/schema.server.ts's doc comment for what
// lives here. Use the pooled/pgbouncer DATABASE_URL (same variable Prisma
// used); migrations need the direct connection instead (DIRECT_URL, see
// drizzle.config.ts).

declare global {
  // eslint-disable-next-line no-var
  var poolGlobal: Pool;
}

// Same dev-hot-reload guard the Prisma client this replaces used — without
// it, every Vite HMR reload would open a fresh pg.Pool and leak
// connections until Supabase's pooled-connection limit is hit.
if (process.env.NODE_ENV !== "production") {
  if (!global.poolGlobal) {
    global.poolGlobal = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
  }
}

const pool =
  global.poolGlobal ?? new Pool({ connectionString: process.env.DATABASE_URL });

// Log every query outside production — same debugging aid the Prisma
// client this replaces had (`log: ["query"]`); see
// docs/architecture/auth.md's "Debugging a stuck auth flow".
const db = drizzle(pool, {
  schema,
  logger: process.env.NODE_ENV !== "production",
});

/** Exposed so callers that need to close the underlying connection (e.g.
 * e2e teardown, one-off scripts) can — `db` itself has no `$disconnect()`
 * equivalent since it just wraps whichever pool it's given. */
export { pool };
export default db;
