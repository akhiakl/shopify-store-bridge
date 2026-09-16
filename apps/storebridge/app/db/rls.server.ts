import { pgPolicy } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { serviceRole } from "drizzle-orm/supabase";

// RLS is enabled on every table across schema.server.ts and
// syncJobsSchema.server.ts (defense-in-depth, tracked in each table's
// definition so drizzle-kit generate keeps the migration/snapshot in
// sync with intent). The app itself never needs a policy to work:
// app/db.server.ts connects with Supabase's `postgres` role, which has
// BYPASSRLS and ignores these entirely. What this guards against is
// anything else reaching these tables through Supabase's
// PostgREST/client-library path — a leaked anon/authenticated key, or
// the connection ever being switched to Supavisor's `service_role`
// transaction mode. Each table gets exactly one explicit "service_role,
// full access" policy; `anon`/`authenticated` get none, so RLS's
// default-deny applies to them. (`sessions` in schema.server.ts skips
// the `.enableRLS()` builder call for a type reason explained on that
// table — RLS is still on for it, just enabled outside this schema.)
export function serviceRoleOnly(tableName: string) {
  return pgPolicy(`${tableName}_service_role_only`, {
    as: "permissive",
    for: "all",
    to: serviceRole,
    using: sql`true`,
    withCheck: sql`true`,
  });
}
