import { describe, expect, it, vi } from "vitest";

import {
  metafieldValueSteps,
  VALUE_BATCH_SIZE,
} from "./syncMetafieldValues.server";
import { createStepContext } from "./syncTarget.server";

function jsonResponse(data: unknown, errors?: { message: string }[]) {
  return { json: () => Promise.resolve({ data, errors }) };
}

type Handler = (variables: Record<string, unknown>) => unknown;

/** An admin client answering by operation name; `errors` makes that
 * operation return a top-level GraphQL error instead. */
function admin(
  handlers: Record<string, Handler>,
  errors: Record<string, string> = {},
) {
  return {
    graphql: vi.fn(
      (query: string, opts?: { variables: Record<string, unknown> }) => {
        const name = /(?:query|mutation)\s+(\w+)/.exec(query)?.[1] ?? "";
        if (errors[name]) {
          return Promise.resolve(
            jsonResponse(null, [{ message: errors[name] }]),
          );
        }
        return Promise.resolve(
          jsonResponse(handlers[name]?.(opts?.variables ?? {}) ?? {}),
        );
      },
    ),
  };
}

const productDef = {
  ownerType: "PRODUCT" as const,
  namespace: "custom",
  key: "care",
};

async function run(
  set: Parameters<typeof metafieldValueSteps>[0],
  source: ReturnType<typeof admin>,
  target: ReturnType<typeof admin>,
) {
  const ctx = createStepContext(source as never, target as never);
  const results = [];
  for (const step of metafieldValueSteps(set))
    results.push(...(await step(ctx)));
  return results;
}

const setResponse = {
  MetafieldsSet: () => ({ metafieldsSet: { metafields: [], userErrors: [] } }),
};

describe("metafieldValueSteps", () => {
  it(`makes one step per ${VALUE_BATCH_SIZE} records`, () => {
    const ownerIds = Array.from({ length: 60 }, (_, i) => `gid://Product/${i}`);
    expect(
      metafieldValueSteps({ definition: productDef, ownerIds }),
    ).toHaveLength(3);
  });

  it("writes matched values in one metafieldsSet and skips what can't be matched, with reasons", async () => {
    const source = admin({
      MetafieldValueSources: () => ({
        nodes: [
          {
            id: "gid://P/1",
            handle: "hat",
            metafield: { type: "single_line_text_field", value: "Wash cold" },
          },
          {
            id: "gid://P/2",
            handle: "scarf",
            metafield: { type: "single_line_text_field", value: "Dry clean" },
          },
          { id: "gid://P/3", handle: "sock", metafield: null },
          null,
        ],
      }),
    });
    const target = admin({
      ProductIdByHandle: ({ handle }) => ({
        productByIdentifier: handle === "hat" ? { id: "gid://T/1" } : null,
      }),
      ...setResponse,
    });

    const items = await run(
      {
        definition: productDef,
        ownerIds: ["gid://P/1", "gid://P/2", "gid://P/3", "gid://P/4"],
      },
      source,
      target,
    );

    expect(items).toEqual([
      {
        key: "metafieldValue:PRODUCT:custom:care:scarf",
        kind: "VALUE",
        status: "SKIPPED",
        errorMessage: "No matching product scarf on this store.",
      },
      {
        key: "metafieldValue:PRODUCT:custom:care:sock",
        kind: "VALUE",
        status: "SKIPPED",
        errorMessage: "No longer has a value on the source store.",
      },
      {
        key: "metafieldValue:PRODUCT:custom:care:gid://P/4",
        kind: "VALUE",
        status: "SKIPPED",
        errorMessage: "No longer exists on the source store.",
      },
      {
        key: "metafieldValue:PRODUCT:custom:care:hat",
        kind: "VALUE",
        status: "SUCCEEDED",
        errorMessage: null,
      },
    ]);
    expect(target.graphql).toHaveBeenLastCalledWith(
      expect.stringContaining("metafieldsSet"),
      {
        variables: {
          metafields: [
            {
              ownerId: "gid://T/1",
              namespace: "custom",
              key: "care",
              type: "single_line_text_field",
              value: "Wash cold",
            },
          ],
        },
      },
    );
  });

  it("matches customers by email but records them by source GID, never the email", async () => {
    const customerDef = { ...productDef, ownerType: "CUSTOMER" as const };
    const source = admin({
      MetafieldValueSources: () => ({
        nodes: [
          {
            id: "gid://shopify/Customer/7",
            defaultEmailAddress: { emailAddress: "ana@example.com" },
            metafield: { type: "number_integer", value: "3" },
          },
          {
            id: "gid://shopify/Customer/8",
            defaultEmailAddress: null,
            metafield: { type: "number_integer", value: "1" },
          },
        ],
      }),
    });
    const target = admin({
      CustomerIdByEmail: ({ emailAddress }) => ({
        customerByIdentifier:
          emailAddress === "ana@example.com" ? { id: "gid://T/C/1" } : null,
      }),
      ...setResponse,
    });

    const items = await run(
      {
        definition: customerDef,
        ownerIds: ["gid://shopify/Customer/7", "gid://shopify/Customer/8"],
      },
      source,
      target,
    );

    expect(items.map((i) => [i.key, i.status, i.errorMessage])).toEqual([
      [
        "metafieldValue:CUSTOMER:custom:care:gid://shopify/Customer/8",
        "SKIPPED",
        "Has no email to match on.",
      ],
      [
        "metafieldValue:CUSTOMER:custom:care:gid://shopify/Customer/7",
        "SUCCEEDED",
        null,
      ],
    ]);
    expect(JSON.stringify(items)).not.toContain("@");
  });

  it("rewrites product and metaobject references to the target's GIDs", async () => {
    const source = admin({
      MetafieldValueSources: () => ({
        nodes: [
          {
            id: "gid://P/1",
            handle: "hat",
            metafield: {
              type: "list.product_reference",
              value: '["gid://P/9","gid://P/gone"]',
            },
          },
          {
            id: "gid://P/2",
            handle: "scarf",
            metafield: { type: "metaobject_reference", value: "gid://M/1" },
          },
        ],
      }),
      MetafieldReferences: () => ({
        nodes: [
          { __typename: "Product", id: "gid://P/9", handle: "gloves" },
          {
            __typename: "Metaobject",
            id: "gid://M/1",
            type: "chef",
            handle: "ana",
          },
          null,
        ],
      }),
    });
    const target = admin({
      ProductIdByHandle: ({ handle }) => ({
        productByIdentifier: { id: `gid://T/${handle}` },
      }),
      MetaobjectIdByHandle: () => ({
        metaobjectByHandle: { id: "gid://T/chef-ana" },
      }),
      ...setResponse,
    });

    const items = await run(
      { definition: productDef, ownerIds: ["gid://P/1", "gid://P/2"] },
      source,
      target,
    );

    expect(items.every((i) => i.status === "SUCCEEDED")).toBe(true);
    const [, { variables }] = target.graphql.mock.calls.at(-1) as [
      string,
      { variables: { metafields: { value: string }[] } },
    ];
    expect(variables.metafields.map((m) => m.value)).toEqual([
      '["gid://T/gloves"]', // the reference deleted on the source is dropped
      "gid://T/chef-ana",
    ]);
  });

  it("fails a record whose reference can't be synced or isn't on the target", async () => {
    const source = admin({
      MetafieldValueSources: () => ({
        nodes: [
          {
            id: "gid://P/1",
            handle: "hat",
            metafield: { type: "file_reference", value: "gid://File/1" },
          },
          {
            id: "gid://P/2",
            handle: "scarf",
            metafield: { type: "product_reference", value: "gid://P/9" },
          },
          {
            id: "gid://P/3",
            handle: "sock",
            metafield: { type: "product_reference", value: "gid://P/gone" },
          },
        ],
      }),
      MetafieldReferences: () => ({
        nodes: [
          { __typename: "Product", id: "gid://P/9", handle: "gloves" },
          null,
        ],
      }),
    });
    const target = admin({
      ProductIdByHandle: ({ handle }) => ({
        productByIdentifier:
          handle === "gloves" ? null : { id: `gid://T/${handle}` },
      }),
    });

    const items = await run(
      {
        definition: productDef,
        ownerIds: ["gid://P/1", "gid://P/2", "gid://P/3"],
      },
      source,
      target,
    );

    expect(items.map((i) => [i.status, i.errorMessage])).toEqual([
      ["FAILED", "It's a file_reference, which can't be synced yet."],
      ["FAILED", "It references product gloves, which isn't on this store."],
      ["FAILED", "It references a record deleted on the source store."],
    ]);
    // Nothing left to write, so no metafieldsSet call.
    expect(
      target.graphql.mock.calls.some(([q]) => q.includes("metafieldsSet")),
    ).toBe(false);
  });

  it("fails every record in the batch when the source can't be read", async () => {
    const source = admin(
      {},
      { MetafieldValueSources: "Not approved to access Customer data" },
    );

    const items = await run(
      { definition: productDef, ownerIds: ["gid://P/1", "gid://P/2"] },
      source,
      admin({}),
    );

    expect(items).toHaveLength(2);
    expect(
      items.every(
        (i) =>
          i.status === "FAILED" &&
          i.errorMessage === "Not approved to access Customer data",
      ),
    ).toBe(true);
  });

  it("fails a record whose target lookup errors, and the whole write when metafieldsSet rejects it", async () => {
    const source = admin({
      MetafieldValueSources: () => ({
        nodes: [
          {
            id: "gid://P/1",
            handle: "hat",
            metafield: { type: "single_line_text_field", value: "a" },
          },
          {
            id: "gid://P/2",
            handle: "scarf",
            metafield: { type: "single_line_text_field", value: "b" },
          },
        ],
      }),
    });
    let lookups = 0;
    const target = {
      graphql: vi.fn((query: string) => {
        if (query.includes("ProductIdByHandle")) {
          lookups++;
          return Promise.resolve(
            lookups === 1
              ? jsonResponse(null, [{ message: "Throttled" }])
              : jsonResponse({ productByIdentifier: { id: "gid://T/2" } }),
          );
        }
        return Promise.resolve(
          jsonResponse({
            metafieldsSet: {
              metafields: null,
              userErrors: [{ message: "Value is invalid" }],
            },
          }),
        );
      }),
    };

    const items = await run(
      { definition: productDef, ownerIds: ["gid://P/1", "gid://P/2"] },
      source,
      target as never,
    );

    expect(items.map((i) => [i.key, i.status, i.errorMessage])).toEqual([
      ["metafieldValue:PRODUCT:custom:care:hat", "FAILED", "Throttled"],
      [
        "metafieldValue:PRODUCT:custom:care:scarf",
        "FAILED",
        "Value is invalid",
      ],
    ]);
  });
});
