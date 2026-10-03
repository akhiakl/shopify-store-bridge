import { describe, expect, it, vi } from "vitest";

import { ENTRY_CAP_PER_TYPE } from "./syncCaps";
import { getMetaobjectEntries } from "./metaobjectEntries.server";

function jsonResponse(data: unknown) {
  return { json: () => Promise.resolve({ data }) };
}

function entry(
  handle: string,
  fields: { key: string; type: string; value: string | null }[] = [],
) {
  return {
    handle,
    capabilities: { publishable: { status: "ACTIVE" } },
    fields,
  };
}

/** Source admin serving `pages[type]` as successive pages, and resolving
 * `refs` (GID → {type, handle}) for the nodes(ids:) lookup. */
function sourceAdmin(
  pages: Record<string, ReturnType<typeof entry>[][]>,
  refs: Record<string, { type: string; handle: string }> = {},
) {
  const served: Record<string, number> = {};
  return {
    graphql: vi.fn(
      (query: string, opts?: { variables: Record<string, unknown> }) => {
        if (query.includes("MetaobjectRefs")) {
          const ids = opts?.variables.ids as string[];
          return Promise.resolve(
            jsonResponse({
              nodes: ids.map((id) => (refs[id] ? { id, ...refs[id] } : null)),
            }),
          );
        }
        const type = opts?.variables.type as string;
        const index = served[type] ?? 0;
        served[type] = index + 1;
        const typePages = pages[type] ?? [[]];
        return Promise.resolve(
          jsonResponse({
            metaobjects: {
              nodes: typePages[index] ?? [],
              pageInfo: {
                hasNextPage: index < typePages.length - 1,
                endCursor: `cursor-${index}`,
              },
            },
          }),
        );
      },
    ),
  };
}

describe("getMetaobjectEntries", () => {
  it("makes no calls when no types are selected", async () => {
    const admin = sourceAdmin({});

    expect(await getMetaobjectEntries(admin as never, [])).toEqual([]);
    expect(admin.graphql).not.toHaveBeenCalled();
  });

  it("follows pagination and copies status and plain fields", async () => {
    const admin = sourceAdmin({
      faq: [
        [
          entry("q1", [
            { key: "answer", type: "single_line_text_field", value: "Yes" },
          ]),
        ],
        [entry("q2")],
      ],
    });

    const entries = await getMetaobjectEntries(admin as never, ["faq"]);

    expect(entries).toEqual([
      {
        type: "faq",
        handle: "q1",
        status: "ACTIVE",
        fields: [
          { key: "answer", type: "single_line_text_field", value: "Yes" },
        ],
      },
      { type: "faq", handle: "q2", status: "ACTIVE", fields: [] },
    ]);
    expect(admin.graphql).toHaveBeenLastCalledWith(expect.any(String), {
      variables: { type: "faq", first: 50, after: "cursor-0" },
    });
  });

  it(`stops at ${ENTRY_CAP_PER_TYPE} entries per type`, async () => {
    const page = Array.from({ length: 50 }, (_, i) => entry(`e${i}`));
    const pages = ENTRY_CAP_PER_TYPE / 50 + 2;
    const admin = sourceAdmin({
      faq: Array.from({ length: pages }, () => page),
    });

    const entries = await getMetaobjectEntries(admin as never, ["faq"]);

    expect(entries).toHaveLength(ENTRY_CAP_PER_TYPE);
    expect(admin.graphql).toHaveBeenCalledTimes(ENTRY_CAP_PER_TYPE / 50);
  });

  it("rewrites metaobject references as (type, handle) and orders referenced types first", async () => {
    const admin = sourceAdmin(
      {
        recipe: [
          [
            entry("soup", [
              {
                key: "author",
                type: "metaobject_reference",
                value: "gid://M/1",
              },
              {
                key: "tags",
                type: "list.metaobject_reference",
                value: '["gid://M/1","gid://M/gone"]',
              },
            ]),
          ],
        ],
        chef: [[entry("ana")]],
      },
      { "gid://M/1": { type: "chef", handle: "ana" } },
    );

    const entries = await getMetaobjectEntries(admin as never, [
      "recipe",
      "chef",
    ]);

    expect(entries.map((e) => e.type)).toEqual(["chef", "recipe"]);
    expect(entries[1].fields).toEqual([
      {
        key: "author",
        type: "metaobject_reference",
        value: "gid://M/1",
        refs: [{ type: "chef", handle: "ana" }],
      },
      {
        key: "tags",
        type: "list.metaobject_reference",
        value: '["gid://M/1","gid://M/gone"]',
        // A reference to an entry deleted on the source is dropped.
        refs: [{ type: "chef", handle: "ana" }],
      },
    ]);
  });

  it("terminates on a reference cycle, syncing each type once", async () => {
    const admin = sourceAdmin(
      {
        a: [
          [
            entry("a1", [
              { key: "b", type: "metaobject_reference", value: "gid://B" },
            ]),
          ],
        ],
        b: [
          [
            entry("b1", [
              { key: "a", type: "metaobject_reference", value: "gid://A" },
            ]),
          ],
        ],
      },
      {
        "gid://A": { type: "a", handle: "a1" },
        "gid://B": { type: "b", handle: "b1" },
      },
    );

    const entries = await getMetaobjectEntries(admin as never, ["a", "b"]);

    expect(entries.map((e) => e.type)).toEqual(["b", "a"]);
  });
});
