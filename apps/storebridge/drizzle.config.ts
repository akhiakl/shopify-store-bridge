import { defineConfig } from "drizzle-kit";

// Migrations need Supabase's direct (non-pgbouncer) connection — the same
// split Prisma used (DATABASE_URL for the app, DIRECT_URL for `prisma
// migrate`). Falls back to DATABASE_URL so this still works against a
// plain (non-pooled) local/staging Postgres that only sets one var.
const migrationUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!migrationUrl) {
  throw new Error("DIRECT_URL or DATABASE_URL must be set to run drizzle-kit.");
}

export default defineConfig({
  schema: "./app/db/schema.server.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: migrationUrl,
  },
});
