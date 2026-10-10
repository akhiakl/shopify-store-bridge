// Creates the Supabase-provided roles our migrations reference (the RLS
// policies grant `TO "service_role"`) when developing against a plain local
// Postgres, which doesn't ship them. Without this, `drizzle-kit migrate`
// fails on `role "service_role" does not exist`, and drizzle-kit swallows
// the error, so `pnpm dev` just looks like it hangs on "applying migrations".
//
// Only ever touches a database on this machine: Supabase (production)
// already has these roles, and a dev command shouldn't be issuing DDL
// against a shared database anyway.
import pg from "pg";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const ROLES = ["service_role"];

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  throw new Error("DIRECT_URL or DATABASE_URL must be set.");
}

const { hostname } = new URL(url);
if (!LOCAL_HOSTS.has(hostname)) {
  console.log(`[db-roles] ${hostname} is not local, skipping.`);
  process.exit(0);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  for (const role of ROLES) {
    const { rowCount } = await client.query(
      "SELECT 1 FROM pg_roles WHERE rolname = $1",
      [role],
    );
    if (rowCount === 0) {
      // Role names can't be bound as parameters; ROLES is a fixed list above.
      await client.query(`CREATE ROLE "${role}"`);
      console.log(`[db-roles] created role ${role}`);
    }
  }
} finally {
  await client.end();
}
