import { describe, expect, it, vi } from "vitest";

import { getCollections } from "./collections.server";

function jsonResponse(data: unknown) {
  return { json: () => Promise.resolve({ data }) };
}

describe("getCollections", () => {
  it("returns the source store's collections", async () => {
    const collection = {
      handle: "summer",
      title: "Summer",
      descriptionHtml: "<p>Hot</p>",
      sortOrder: "BEST_SELLING",
      templateSuffix: null,
      seo: { title: null, description: null },
      ruleSet: null,
    };
    const graphql = vi.fn(() =>
      Promise.resolve(jsonResponse({ collections: { nodes: [collection] } })),
    );

    expect(await getCollections({ graphql } as never)).toEqual([collection]);
  });

  it("returns an empty list when the API returns no collections", async () => {
    const graphql = vi.fn(() => Promise.resolve(jsonResponse({})));

    expect(await getCollections({ graphql } as never)).toEqual([]);
  });
});
