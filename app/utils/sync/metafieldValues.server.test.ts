import { describe, expect, it, vi } from "vitest";

import { getMetafieldValueSets } from "./metafieldValues.server";
import { VALUE_CAP_PER_DEFINITION } from "./syncCaps";

function jsonResponse(data: unknown) {
  return { json: () => Promise.resolve({ data }) };
}

const def = (ownerType: string, key = "care") =>
  ({
    id: `gid://${ownerType}/${key}`,
    name: key,
    namespace: "custom",
    key,
    description: null,
    type: "single_line_text_field",
    ownerType,
    valueCount: 1,
  }) as never;

/** Serves `pages` of owner IDs for every definition queried. */
function admin(pages: string[][]) {
  let page = 0;
  return {
    graphql: vi.fn(() => {
      const ids = pages[page] ?? [];
      const hasNextPage = page < pages.length - 1;
      page++;
      return Promise.resolve(
        jsonResponse({
          metafieldDefinition: {
            metafields: {
              nodes: ids.map((id) => ({ owner: id ? { id } : null })),
              pageInfo: { hasNextPage, endCursor: `c${page}` },
            },
          },
        }),
      );
    }),
  };
}

describe("getMetafieldValueSets", () => {
  it("lists owner IDs across pages, skipping owners it can't see", async () => {
    const source = admin([["gid://Product/1", ""], ["gid://Product/2"]]);

    const sets = await getMetafieldValueSets(source as never, [def("PRODUCT")]);

    expect(sets).toEqual([
      {
        definition: { ownerType: "PRODUCT", namespace: "custom", key: "care" },
        ownerIds: ["gid://Product/1", "gid://Product/2"],
      },
    ]);
    expect(source.graphql).toHaveBeenLastCalledWith(expect.any(String), {
      variables: {
        identifier: { ownerType: "PRODUCT", namespace: "custom", key: "care" },
        after: "c1",
      },
    });
  });

  it(`stops at ${VALUE_CAP_PER_DEFINITION} owners per definition`, async () => {
    const page = Array.from({ length: 250 }, (_, i) => `gid://Product/${i}`);
    const pages = Array.from(
      { length: VALUE_CAP_PER_DEFINITION / 250 + 2 },
      () => page,
    );
    const source = admin(pages);

    const [set] = await getMetafieldValueSets(source as never, [
      def("PRODUCT"),
    ]);

    expect(set.ownerIds).toHaveLength(VALUE_CAP_PER_DEFINITION);
    expect(source.graphql).toHaveBeenCalledTimes(
      VALUE_CAP_PER_DEFINITION / 250,
    );
  });

  it("ignores owner types with no cross-store key and drops definitions without values", async () => {
    const source = admin([[]]);

    const sets = await getMetafieldValueSets(source as never, [
      def("ORDER"),
      def("CUSTOMER"),
    ]);

    expect(sets).toEqual([]);
    // Only the CUSTOMER definition was queried.
    expect(source.graphql).toHaveBeenCalledTimes(1);
  });
});
