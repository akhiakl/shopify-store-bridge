import { describe, expect, it, vi } from "vitest";

import {
  buildSyncSteps,
  createStepContext,
  runSyncSteps,
  tallyItems,
  type SyncStep,
} from "./syncTarget.server";

const ctx = createStepContext(
  { graphql: vi.fn() } as never,
  { graphql: vi.fn() } as never,
);

function step(key: string): SyncStep {
  return vi.fn(async () => [
    {
      key,
      kind: "DEFINITION" as const,
      status: "SUCCEEDED" as const,
      errorMessage: null,
    },
  ]);
}

describe("runSyncSteps", () => {
  it("resumes from the given index and reports where to continue", async () => {
    const steps = [step("a"), step("b"), step("c")];

    const result = await runSyncSteps({ steps, ctx, from: 1 });

    expect(result.items.map((i) => i.key)).toEqual(["b", "c"]);
    expect(result.next).toBe(3);
    expect(steps[0]).not.toHaveBeenCalled();
  });

  it("stops between steps once the deadline has passed", async () => {
    let now = 1000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const slow: SyncStep = async () => {
      now += 600;
      return [];
    };

    const result = await runSyncSteps({
      steps: [slow, slow, slow],
      ctx,
      deadline: 2000,
    });

    // 1000 → 1600 → 2200: the second step started before the deadline and
    // finished; the third never starts.
    expect(result.next).toBe(2);
    vi.restoreAllMocks();
  });
});

describe("buildSyncSteps", () => {
  it("orders definitions before content, one step per plan entry", () => {
    const steps = buildSyncSteps({
      metaobjectDefinitions: [
        {
          id: "1",
          type: "faq",
          name: "FAQ",
          fieldDefinitions: [],
          fieldCount: 0,
          entryCount: 1,
        },
      ],
      metafieldDefinitions: [],
      shopPolicies: [{ type: "REFUND_POLICY", title: "Refund", body: "x" }],
      collections: [],
      metaobjectEntries: [
        { type: "faq", handle: "q1", status: null, fields: [] },
      ],
      metafieldValues: [],
      menus: [],
      locations: [],
    });

    expect(steps).toHaveLength(3);
  });
});

describe("tallyItems", () => {
  it("counts items by status", () => {
    expect(
      tallyItems([
        { key: "a", kind: "VALUE", status: "SUCCEEDED", errorMessage: null },
        { key: "b", kind: "VALUE", status: "SKIPPED", errorMessage: null },
        { key: "c", kind: "VALUE", status: "FAILED", errorMessage: "x" },
        { key: "d", kind: "VALUE", status: "SUCCEEDED", errorMessage: null },
      ]),
    ).toEqual({ itemsSynced: 2, itemsSkipped: 1, itemsFailed: 1 });
  });
});

describe("shop policy steps", () => {
  function policyRun(payload: unknown) {
    const targetAdmin = {
      graphql: vi.fn(() =>
        Promise.resolve({ json: () => Promise.resolve({ data: payload }) }),
      ),
    };
    const run = runSyncSteps({
      ctx: createStepContext(
        { graphql: vi.fn() } as never,
        targetAdmin as never,
      ),
      steps: buildSyncSteps({
        metaobjectDefinitions: [],
        metafieldDefinitions: [],
        collections: [],
        metaobjectEntries: [],
        metafieldValues: [],
        menus: [],
        locations: [],
        shopPolicies: [
          { type: "REFUND_POLICY", title: "Refund policy", body: "30 days." },
        ],
      }),
    });
    return { targetAdmin, run };
  }

  it("upserts the policy body by type and records it as a VALUE item", async () => {
    const { targetAdmin, run } = policyRun({
      shopPolicyUpdate: { shopPolicy: { id: "gid://1" }, userErrors: [] },
    });

    expect((await run).items).toEqual([
      {
        key: "policy:REFUND_POLICY",
        kind: "VALUE",
        status: "SUCCEEDED",
        errorMessage: null,
      },
    ]);
    expect(targetAdmin.graphql).toHaveBeenCalledWith(
      expect.stringContaining("ShopPolicyUpdate"),
      {
        variables: { shopPolicy: { type: "REFUND_POLICY", body: "30 days." } },
      },
    );
  });

  it("records a userError as a failed item", async () => {
    const { run } = policyRun({
      shopPolicyUpdate: {
        shopPolicy: null,
        userErrors: [{ message: "Body can't be blank" }],
      },
    });

    expect((await run).items[0]).toMatchObject({
      status: "FAILED",
      errorMessage: "Body can't be blank",
    });
  });
});
