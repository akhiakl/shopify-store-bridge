import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

export type CreateResult =
  { ok: true; skipped?: boolean } | { ok: false; error: string };

/** Top-level GraphQL `errors` (a bad query, a missing scope) joined into one
 * message, or `undefined` when the response carried none. Shared by every
 * caller that reads a raw `admin.graphql(...).then(r => r.json())`
 * response — `admin.graphql`'s return type only declares `data` on the
 * parsed body, but the runtime response can carry this too, so it's cast
 * the same loose way `payload` in `createOne` is (this codebase doesn't
 * have generated types wired into these hand-written calls yet — see
 * shopify.app.toml's TODO on that). */
export function readTopLevelErrors(body: unknown): string | undefined {
  const { errors } = body as { errors?: { message: string }[] };
  if (!errors) return undefined;
  return Array.isArray(errors)
    ? errors.map((e: { message: string }) => e.message).join("; ")
    : String(errors);
}

/** Runs one write mutation. A `TAKEN` userError code — confirmed via
 * `MetaobjectUserErrorCode`/`MetafieldDefinitionCreateUserErrorCode` — means
 * the definition already exists on the target; that's `skipped`, not
 * `failed`, so a clean re-run doesn't read as an error in job history.
 * Top-level GraphQL `errors` (a bad query, a missing scope) and a missing
 * response payload are both real failures — treating them as an empty
 * `userErrors` array silently marked a job SUCCEEDED when the mutation
 * never actually ran. */
export async function createOne(
  admin: AdminApiContext,
  query: string,
  variables: Record<string, unknown>,
): Promise<CreateResult> {
  const response = await admin.graphql(query, { variables });
  const body = (await response.json()) as { data?: Record<string, unknown> };
  const errorMessage = readTopLevelErrors(body);
  if (errorMessage) {
    return { ok: false, error: errorMessage };
  }
  const payload = Object.values(body.data ?? {})[0] as
    { userErrors: { message: string; code?: string }[] } | undefined;
  if (!payload) {
    return { ok: false, error: "Shopify returned an unexpected response." };
  }
  const userErrors = payload.userErrors ?? [];
  if (userErrors.length === 0) return { ok: true };
  if (userErrors.some((e) => e.code === "TAKEN")) {
    return { ok: true, skipped: true };
  }
  return { ok: false, error: userErrors.map((e) => e.message).join("; ") };
}
