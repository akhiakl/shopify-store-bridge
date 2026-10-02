import { describe, expect, it, vi } from "vitest";

import type { CollectionRow } from "./collections.server";
import { syncCollection } from "./syncCollection.server";

function jsonResponse(data: unknown, errors?: { message: string }[]) {
  return { json: () => Promise.resolve({ data, errors }) };
}

const manual: CollectionRow = {
  handle: "summer",
  title: "Summer",
  descriptionHtml: "<p>Hot</p>",
  sortOrder: "MANUAL",
  templateSuffix: null,
  seo: { title: "Summer sale", description: null },
  ruleSet: null,
};

const smart: CollectionRow = {
  ...manual,
  handle: "hats",
  sortOrder: "BEST_SELLING",
  ruleSet: {
    appliedDisjunctively: false,
    rules: [{ column: "TAG", relation: "EQUALS", condition: "hat" }],
  },
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

    const result = await syncCollection(admin as never, manual);

    expect(result).toEqual({ ok: true });
    expect(admin.graphql).toHaveBeenLastCalledWith(
      expect.stringContaining("collectionCreate"),
      {
        variables: {
          input: {
            handle: "summer",
            title: "Summer",
            descriptionHtml: "<p>Hot</p>",
            sortOrder: "MANUAL",
            templateSuffix: null,
            seo: { title: "Summer sale", description: null },
          },
        },
      },
    );
  });

  it("updates the existing collection, including its rule set, when the handle matches", async () => {
    const admin = targetAdmin("gid://shopify/Collection/9");

    const result = await syncCollection(admin as never, smart);

    expect(result).toEqual({ ok: true });
    expect(admin.graphql).toHaveBeenLastCalledWith(
      expect.stringContaining("collectionUpdate"),
      {
        variables: {
          input: expect.objectContaining({
            id: "gid://shopify/Collection/9",
            handle: "hats",
            ruleSet: smart.ruleSet,
          }),
        },
      },
    );
  });

  it("fails without touching the target when a rule references a metafield definition", async () => {
    const admin = targetAdmin(null);
    const withMetafieldRule: CollectionRow = {
      ...smart,
      ruleSet: {
        appliedDisjunctively: false,
        rules: [
          {
            column: "PRODUCT_METAFIELD_DEFINITION",
            relation: "EQUALS",
            condition: "red",
          },
        ],
      },
    };

    const result = await syncCollection(admin as never, withMetafieldRule);

    expect(result).toEqual({
      ok: false,
      error:
        "Rule on PRODUCT_METAFIELD_DEFINITION references a metafield definition, which can't be synced yet.",
    });
    expect(admin.graphql).not.toHaveBeenCalled();
  });

  it("fails when the handle lookup itself errors, rather than creating a duplicate", async () => {
    const admin = {
      graphql: vi.fn(() =>
        Promise.resolve(jsonResponse(null, [{ message: "Access denied" }])),
      ),
    };

    const result = await syncCollection(admin as never, manual);

    expect(result).toEqual({ ok: false, error: "Access denied" });
    expect(admin.graphql).toHaveBeenCalledTimes(1);
  });
});
