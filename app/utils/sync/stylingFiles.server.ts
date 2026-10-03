import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import { fileNameFromUrl, type StylingFileRef } from "./checkoutBrandingInput";
import { readTopLevelErrors } from "./runMutation.server";
import type { TargetIdCache } from "./syncMetaobjectEntry.server";

/** Scope read_files. */
const FILE_BY_NAME_QUERY = `#graphql
  query StylingFileByName($query: String!) {
    files(first: 1, query: $query) {
      nodes { id fileStatus }
    }
  }
`;

/** Scope write_files. */
const FILE_CREATE_MUTATION = `#graphql
  mutation StylingFileCreate($files: [FileCreateInput!]!) {
    fileCreate(files: $files) {
      files { id fileStatus }
      userErrors { field message code }
    }
  }
`;

const FILE_STATUS_QUERY = `#graphql
  query StylingFileStatus($id: ID!) {
    node(id: $id) { ... on File { id fileStatus } }
  }
`;

/** How long a new file gets to finish processing: fonts and logos are
 * small, so this is generous. */
const POLL_ATTEMPTS = 10;
const POLL_MS = 1000;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function query<T>(
  admin: AdminApiContext,
  operation: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const response = await admin.graphql(operation, { variables });
  const body = (await response.json()) as { data?: T };
  const error = readTopLevelErrors(body);
  if (error || !body.data)
    throw new Error(error ?? "No response from Shopify.");
  return body.data;
}

async function waitUntilReady(admin: AdminApiContext, id: string) {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    const { node } = await query<{ node: { fileStatus: string } | null }>(
      admin,
      FILE_STATUS_QUERY,
      { id },
    );
    if (node?.fileStatus === "READY") return;
    if (node?.fileStatus === "FAILED") break;
    await wait(POLL_MS);
  }
  throw new Error("A copied file didn't finish processing on this store.");
}

/**
 * The target's ID for a file the source's branding uses: an existing file
 * with the same name, or a new one created from the source's URL (Shopify
 * fetches it). Waits until it's ready, since the styling update rejects a
 * file that's still processing. Cached per job by URL.
 */
export async function ensureTargetFile(
  admin: AdminApiContext,
  ref: StylingFileRef,
  cache: TargetIdCache,
): Promise<string> {
  const cacheKey = `file:${ref.url}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const filename = fileNameFromUrl(ref.url);
  const existing = await query<{
    files: { nodes: { id: string; fileStatus: string }[] };
  }>(admin, FILE_BY_NAME_QUERY, {
    query: `filename:${JSON.stringify(filename)}`,
  });
  let id = existing.files.nodes[0]?.id;

  if (!id) {
    const created = await query<{
      fileCreate: {
        files: { id: string }[] | null;
        userErrors: { message: string }[];
      };
    }>(admin, FILE_CREATE_MUTATION, {
      files: [
        {
          originalSource: ref.url,
          filename,
          contentType: ref.kind === "IMAGE" ? "IMAGE" : "FILE",
        },
      ],
    });
    const { files, userErrors } = created.fileCreate;
    if (userErrors.length || !files?.[0]) {
      throw new Error(
        userErrors.map((e) => e.message).join("; ") ||
          "Couldn't copy a file to this store.",
      );
    }
    id = files[0].id;
  }

  await waitUntilReady(admin, id);
  cache.set(cacheKey, id);
  return id;
}
