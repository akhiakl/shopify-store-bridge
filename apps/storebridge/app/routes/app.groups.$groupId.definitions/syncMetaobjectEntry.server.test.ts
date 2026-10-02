import { describe, expect, it, vi } from "vitest";

import type { MetaobjectEntryRow } from "./metaobjectEntries.server";
import {
  syncMetaobjectEntry,
  type TargetIdCache,
} from "./syncMetaobjectEntry.server";

function jsonResponse(data: unknown, errors?: { message: string }[]) {
  return { json: () => Promise.resolve({ data, errors }) };
}

/** Target admin that knows `existing` (`type/handle` → GID) and accepts
 * every upsert. */
function targetAdmin(existing: Record<string, string> = {}) {
  return {
    graphql: vi.fn(
      (query: string, opts?: { variables: Record<string, unknown> }) => {
        if (query.includes("MetaobjectIdByHandle")) {
          const { type, handle } = opts?.variables.handle as {
            type: string;
            handle: string;
          };
          const id = existing[`${type}/${handle}`];
          return Promise.resolve(
            jsonResponse({ metaobjectByHandle: id ? { id } : null }),
          );
        }
        return Promise.resolve(
          jsonResponse({
            metaobjectUpsert: {
              metaobject: { id: "gid://new" },
              userErrors: [],
            },
          }),
        );
      },
    ),
  };
}

const recipe: MetaobjectEntryRow = {
  type: "recipe",
  handle: "soup",
  status: "ACTIVE",
  fields: [
    { key: "title", type: "single_line_text_field", value: "Soup" },
    { key: "notes", type: "multi_line_text_field", value: null },
    {
      key: "author",
      type: "metaobject_reference",
      value: "gid://source/1",
      refs: [{ type: "chef", handle: "ana" }],
    },
    {
      key: "tags",
      type: "list.metaobject_reference",
      value: '["gid://source/2","gid://source/3"]',
      refs: [
        { type: "tag", handle: "hot" },
        { type: "tag", handle: "quick" },
      ],
    },
  ],
};

describe("syncMetaobjectEntry", () => {
  it("upserts by (type, handle) with target GIDs, status, and only non-empty fields", async () => {
    const admin = targetAdmin({
      "chef/ana": "gid://target/c",
      "tag/hot": "gid://target/t1",
      "tag/quick": "gid://target/t2",
    });

    const result = await syncMetaobjectEntry(admin as never, recipe, new Map());

    expect(result).toEqual({ ok: true });
    expect(admin.graphql).toHaveBeenLastCalledWith(
      expect.stringContaining("metaobjectUpsert"),
      {
        variables: {
          handle: { type: "recipe", handle: "soup" },
          metaobject: {
            fields: [
              { key: "title", value: "Soup" },
              { key: "author", value: "gid://target/c" },
              { key: "tags", value: '["gid://target/t1","gid://target/t2"]' },
            ],
            capabilities: { publishable: { status: "ACTIVE" } },
          },
        },
      },
    );
  });

  it("reuses cached target GIDs instead of looking them up again", async () => {
    const admin = targetAdmin();
    const cache: TargetIdCache = new Map([
      ["chef/ana", "gid://target/c"],
      ["tag/hot", "gid://target/t1"],
      ["tag/quick", "gid://target/t2"],
    ]);

    await syncMetaobjectEntry(admin as never, recipe, cache);

    expect(admin.graphql).toHaveBeenCalledTimes(1);
  });

  it("fails when a referenced entry doesn't exist on the target yet", async () => {
    const admin = targetAdmin({ "tag/hot": "gid://target/t1" });

    const result = await syncMetaobjectEntry(admin as never, recipe, new Map());

    expect(result).toEqual({
      ok: false,
      error:
        'Field "author" references chef/ana, which doesn\'t exist on this store yet.',
    });
    expect(admin.graphql).not.toHaveBeenCalledWith(
      expect.stringContaining("metaobjectUpsert"),
      expect.anything(),
    );
  });

  it("fails without touching the target when a field holds an unsupported reference", async () => {
    const admin = targetAdmin();
    const withImage: MetaobjectEntryRow = {
      ...recipe,
      fields: [{ key: "photo", type: "file_reference", value: "gid://File/1" }],
    };

    const result = await syncMetaobjectEntry(
      admin as never,
      withImage,
      new Map(),
    );

    expect(result).toEqual({
      ok: false,
      error: 'Field "photo" is a file_reference, which can\'t be synced yet.',
    });
    expect(admin.graphql).not.toHaveBeenCalled();
  });

  it("ignores an empty unsupported reference, omits a dangling reference, and skips status when unpublishable", async () => {
    const admin = targetAdmin();
    const entry: MetaobjectEntryRow = {
      type: "faq",
      handle: "q1",
      status: null,
      fields: [
        { key: "photo", type: "file_reference", value: null },
        {
          key: "related",
          type: "metaobject_reference",
          value: "gid://source/deleted",
          refs: [],
        },
        { key: "answer", type: "single_line_text_field", value: "Yes" },
      ],
    };

    const result = await syncMetaobjectEntry(admin as never, entry, new Map());

    expect(result).toEqual({ ok: true });
    expect(admin.graphql).toHaveBeenCalledWith(
      expect.stringContaining("metaobjectUpsert"),
      {
        variables: {
          handle: { type: "faq", handle: "q1" },
          metaobject: { fields: [{ key: "answer", value: "Yes" }] },
        },
      },
    );
  });

  it("fails when the target lookup itself errors", async () => {
    const admin = {
      graphql: vi.fn(() =>
        Promise.resolve(jsonResponse(null, [{ message: "Access denied" }])),
      ),
    };

    const result = await syncMetaobjectEntry(admin as never, recipe, new Map());

    expect(result).toEqual({ ok: false, error: "Access denied" });
  });
});
