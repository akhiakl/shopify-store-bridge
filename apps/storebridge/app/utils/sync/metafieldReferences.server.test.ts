import { describe, expect, it, vi } from "vitest";

import {
  describeRef,
  isUnsupportedReference,
  referenceKind,
  referencedIds,
  resolveSourceRefs,
  targetIdFor,
} from "./metafieldReferences.server";

function jsonResponse(data: unknown, errors?: { message: string }[]) {
  return { json: () => Promise.resolve({ data, errors }) };
}

describe("reference types", () => {
  it("knows which reference types can be synced", () => {
    expect(referenceKind("product_reference")).toBe("Product");
    expect(referenceKind("list.collection_reference")).toBe("Collection");
    expect(referenceKind("metaobject_reference")).toBe("Metaobject");
    expect(referenceKind("single_line_text_field")).toBeUndefined();

    expect(isUnsupportedReference("file_reference")).toBe(true);
    expect(isUnsupportedReference("list.variant_reference")).toBe(true);
    expect(isUnsupportedReference("product_reference")).toBe(false);
    expect(isUnsupportedReference("number_integer")).toBe(false);
  });

  it("reads the GIDs out of single and list values", () => {
    expect(referencedIds("product_reference", "gid://P/1")).toEqual([
      "gid://P/1",
    ]);
    expect(
      referencedIds("list.product_reference", '["gid://P/1","gid://P/2"]'),
    ).toEqual(["gid://P/1", "gid://P/2"]);
  });

  it("describes a record for a skip or failure message", () => {
    expect(describeRef({ kind: "Product", handle: "hat" })).toBe("product hat");
    expect(
      describeRef({ kind: "Metaobject", type: "chef", handle: "ana" }),
    ).toBe("chef/ana");
    expect(describeRef({ kind: "Customer", emailAddress: "a@b.c" })).toBe(
      "customer with that email",
    );
  });
});

describe("resolveSourceRefs", () => {
  it("maps source GIDs to their cross-store identity, dropping ones that are gone", async () => {
    const admin = {
      graphql: vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            nodes: [
              { __typename: "Product", id: "gid://P/1", handle: "hat" },
              { __typename: "Collection", id: "gid://C/1", handle: "summer" },
              {
                __typename: "Metaobject",
                id: "gid://M/1",
                type: "chef",
                handle: "ana",
              },
              null,
            ],
          }),
        ),
      ),
    };

    const refs = await resolveSourceRefs(admin as never, [
      "gid://P/1",
      "gid://C/1",
      "gid://M/1",
      "gid://X",
    ]);

    expect(Object.fromEntries(refs)).toEqual({
      "gid://P/1": { kind: "Product", handle: "hat" },
      "gid://C/1": { kind: "Collection", handle: "summer" },
      "gid://M/1": { kind: "Metaobject", type: "chef", handle: "ana" },
    });
  });

  it("skips the call entirely with no IDs, and throws on a GraphQL error", async () => {
    const admin = {
      graphql: vi.fn(() =>
        Promise.resolve(jsonResponse(null, [{ message: "denied" }])),
      ),
    };

    expect((await resolveSourceRefs(admin as never, [])).size).toBe(0);
    expect(admin.graphql).not.toHaveBeenCalled();
    await expect(
      resolveSourceRefs(admin as never, ["gid://P/1"]),
    ).rejects.toThrow("denied");
  });
});

describe("targetIdFor", () => {
  it.each([
    [
      { kind: "Product", handle: "hat" },
      "productByIdentifier",
      { handle: "hat" },
    ],
    [
      { kind: "Collection", handle: "summer" },
      "collectionByIdentifier",
      { handle: "summer" },
    ],
    [
      { kind: "Metaobject", type: "chef", handle: "ana" },
      "metaobjectByHandle",
      { handle: { type: "chef", handle: "ana" } },
    ],
    [
      { kind: "Customer", emailAddress: "a@b.c" },
      "customerByIdentifier",
      { emailAddress: "a@b.c" },
    ],
  ] as const)(
    "looks up a %o by its natural key",
    async (ref, field, variables) => {
      const admin = {
        graphql: vi.fn(() =>
          Promise.resolve(jsonResponse({ [field]: { id: "gid://target/1" } })),
        ),
      };
      const cache = new Map<string, string>();

      expect(await targetIdFor(admin as never, ref, cache)).toBe(
        "gid://target/1",
      );
      expect(admin.graphql).toHaveBeenCalledWith(expect.any(String), {
        variables,
      });

      // Cached: a second lookup doesn't hit the API.
      expect(await targetIdFor(admin as never, ref, cache)).toBe(
        "gid://target/1",
      );
      expect(admin.graphql).toHaveBeenCalledTimes(1);
    },
  );

  it("returns undefined for no match without caching it, and throws on a GraphQL error", async () => {
    const admin = {
      graphql: vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ productByIdentifier: null }))
        .mockResolvedValueOnce(
          jsonResponse(null, [{ message: "Access denied" }]),
        ),
    };
    const cache = new Map<string, string>();
    const ref = { kind: "Product", handle: "hat" } as const;

    expect(await targetIdFor(admin as never, ref, cache)).toBeUndefined();
    expect(cache.size).toBe(0);
    await expect(targetIdFor(admin as never, ref, cache)).rejects.toThrow(
      "Access denied",
    );
  });
});
