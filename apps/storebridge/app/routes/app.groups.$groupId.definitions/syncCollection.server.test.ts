import { describe, expect, it, vi } from "vitest";

import type { CollectionRow } from "./collections.server";
import { syncCollection } from "./syncCollection.server";

function jsonResponse(data: unknown, errors?: { message: string }[]) {
  return { json: () => Promise.resolve({ data, errors }) };
}

const collection: CollectionRow = {
  handle: "summer",
  title: "Summer",
  descriptionHtml: "<p>Hot</p>",
  sortOrder: "BEST_SELLING",
  templateSuffix: null,
  seo: { title: "Summer sale", description: null },
};

/** Target admin whose handle lookup returns `existingId` (or no match),
 * and whose create/update mutations succeed. */
function targetAdmin(existingId: string | null) {
  return {
    graphql: vi.fn((query: string) => {
      if (query.includes("CollectionByHandle")) {
        return Promise.resolve(
          jsonResponse({
            collectionByIdentifier: existingId ? { id: existingId } : null,
          }),
        );
      }
      const field = query.includes("collectionCreate")
        ? "collectionCreate"
        : "collectionUpdate";
      return Promise.resolve(
        jsonResponse({
          [field]: { collection: { id: "gid://c/1" }, userErrors: [] },
        }),
      );
    }),
  };
}

describe("syncCollection", () => {
  it("creates the collection when the target has no matching handle", async () => {
    const admin = targetAdmin(null);

    const result = await syncCollection(admin as never, collection);

    expect(result).toEqual({ ok: true });
    expect(admin.graphql).toHaveBeenLastCalledWith(
      expect.stringContaining("collectionCreate"),
      { variables: { collection } },
    );
  });

  it("updates the existing collection when the handle matches", async () => {
    const admin = targetAdmin("gid://shopify/Collection/9");

    const result = await syncCollection(admin as never, collection);

    expect(result).toEqual({ ok: true });
    expect(admin.graphql).toHaveBeenLastCalledWith(
      expect.stringContaining("collectionUpdate"),
      {
        variables: {
          collection: { ...collection, id: "gid://shopify/Collection/9" },
        },
      },
    );
  });

  it("reports a target userError as a failure", async () => {
    const admin = {
      graphql: vi.fn((query: string) =>
        Promise.resolve(
          jsonResponse(
            query.includes("CollectionByHandle")
              ? { collectionByIdentifier: null }
              : {
                  collectionCreate: {
                    collection: null,
                    userErrors: [{ message: "Title can't be blank" }],
                  },
                },
          ),
        ),
      ),
    };

    const result = await syncCollection(admin as never, collection);

    expect(result).toEqual({ ok: false, error: "Title can't be blank" });
  });

  it("fails when the handle lookup itself errors, rather than creating a duplicate", async () => {
    const admin = {
      graphql: vi.fn(() =>
        Promise.resolve(jsonResponse(null, [{ message: "Access denied" }])),
      ),
    };

    const result = await syncCollection(admin as never, collection);

    expect(result).toEqual({ ok: false, error: "Access denied" });
    expect(admin.graphql).toHaveBeenCalledTimes(1);
  });
});
