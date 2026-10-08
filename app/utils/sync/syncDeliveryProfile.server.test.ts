import { describe, expect, it, vi } from "vitest";

import type { PlannedDeliveryProfile } from "./deliveryProfiles.server";
import { deliveryProfileStep } from "./syncDeliveryProfile.server";
import { createStepContext } from "./syncTarget.server";

function jsonResponse(data: unknown, errors?: { message: string }[]) {
  return { json: () => Promise.resolve({ data, errors }) };
}

type Handler = (variables: Record<string, unknown>) => unknown;

/** A target answering by operation name; `errors` makes that operation
 * return a top-level GraphQL error. */
function target(
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

const zone = {
  name: "Canada",
  countries: [{ code: "CA", includeAllProvinces: true }],
  methods: [],
};

const custom: PlannedDeliveryProfile = {
  name: "Oversized",
  isDefault: false,
  products: ["sofa", "gone"],
  locationGroups: [
    { locations: ["Warehouse", "Closed"], zones: [zone] },
    { locations: ["Nowhere"], zones: [zone] },
  ],
  skipped: [{ item: "Canada > UPS", reason: "carrier" }],
};

const lookups = {
  TargetLocationIds: () => ({
    locations: { nodes: [{ id: "gid://T/L/1", name: "Warehouse" }] },
  }),
  ProductVariantIds: ({ handle }: Record<string, unknown>) => ({
    productByIdentifier:
      handle === "sofa"
        ? { variants: { nodes: [{ id: "gid://T/V/1" }] } }
        : null,
  }),
};

const ok = { profile: { id: "gid://T/P/9" }, userErrors: [] };

function run(
  profile: PlannedDeliveryProfile,
  admin: ReturnType<typeof target>,
) {
  return deliveryProfileStep(profile)(
    createStepContext({} as never, admin as never),
  );
}

function lastWrite(admin: ReturnType<typeof target>) {
  return admin.graphql.mock.calls.at(-1) as [
    string,
    { variables: Record<string, unknown> },
  ];
}

describe("deliveryProfileStep", () => {
  it("creates a missing custom profile, reporting what couldn't be matched", async () => {
    const admin = target({
      ...lookups,
      TargetDeliveryProfiles: () => ({
        deliveryProfiles: {
          nodes: [{ id: "gid://T/P/1", name: "General", default: true }],
        },
      }),
      DeliveryProfileCreate: () => ({ deliveryProfileCreate: ok }),
    });

    const items = await run(custom, admin);

    expect(items.map((i) => [i.key, i.status, i.errorMessage])).toEqual([
      ["deliveryProfileSync:Oversized", "SUCCEEDED", null],
      ["deliveryProfileItem:Oversized:Canada > UPS", "SKIPPED", "carrier"],
      [
        "deliveryProfileItem:Oversized:Location Closed",
        "SKIPPED",
        "No location with this name on this store. Sync it first.",
      ],
      [
        "deliveryProfileItem:Oversized:Location Nowhere",
        "SKIPPED",
        "No location with this name on this store. Sync it first.",
      ],
      [
        "deliveryProfileItem:Oversized:Product gone",
        "SKIPPED",
        "No product with this handle on this store.",
      ],
    ]);
    const [query, { variables }] = lastWrite(admin);
    expect(query).toContain("deliveryProfileCreate");
    expect(variables).toEqual({
      profile: {
        name: "Oversized",
        locationGroupsToCreate: [
          {
            locations: ["gid://T/L/1"],
            zonesToCreate: [
              {
                name: "Canada",
                countries: zone.countries,
                methodDefinitionsToCreate: [],
              },
            ],
          },
        ],
        variantsToAssociate: ["gid://T/V/1"],
      },
    });
  });

  it("replaces an existing custom profile's zones and products in one update", async () => {
    const admin = target({
      ...lookups,
      TargetDeliveryProfiles: () => ({
        deliveryProfiles: {
          nodes: [{ id: "gid://T/P/2", name: "Oversized", default: false }],
        },
      }),
      TargetDeliveryProfileDetail: () => ({
        deliveryProfile: {
          profileItems: {
            nodes: [
              {
                variants: {
                  nodes: [{ id: "gid://T/V/1" }, { id: "gid://T/V/old" }],
                },
              },
            ],
          },
          profileLocationGroups: [
            {
              locationGroup: {
                id: "gid://T/G/1",
                locations: { nodes: [{ name: "Warehouse" }] },
              },
              locationGroupZones: { nodes: [{ zone: { id: "gid://T/Z/1" } }] },
            },
          ],
        },
      }),
      DeliveryProfileUpdate: () => ({ deliveryProfileUpdate: ok }),
    });

    const items = await run(
      { ...custom, products: ["sofa"], skipped: [] },
      admin,
    );

    expect(items[0].status).toBe("SUCCEEDED");
    const [query, { variables }] = lastWrite(admin);
    expect(query).toContain("deliveryProfileUpdate");
    expect(variables).toMatchObject({
      id: "gid://T/P/2",
      profile: {
        zonesToDelete: ["gid://T/Z/1"],
        locationGroupsToUpdate: [{ id: "gid://T/G/1" }],
        locationGroupsToCreate: [],
        locationGroupsToDelete: [],
        variantsToAssociate: ["gid://T/V/1"],
        variantsToDissociate: ["gid://T/V/old"],
      },
    });
  });

  it("updates the target's default profile without touching its products", async () => {
    const admin = target({
      ...lookups,
      TargetDeliveryProfiles: () => ({
        deliveryProfiles: {
          nodes: [
            { id: "gid://T/P/1", name: "General profile", default: true },
          ],
        },
      }),
      TargetDeliveryProfileDetail: () => ({ deliveryProfile: null }),
      DeliveryProfileUpdate: () => ({ deliveryProfileUpdate: ok }),
    });

    await run(
      {
        name: "Shipping",
        isDefault: true,
        products: [],
        locationGroups: [],
        skipped: [],
      },
      admin,
    );

    const [, { variables }] = lastWrite(admin);
    expect(variables).toEqual({
      id: "gid://T/P/1",
      profile: {
        zonesToDelete: [],
        locationGroupsToUpdate: [],
        locationGroupsToCreate: [],
      },
    });
  });

  it("fails the profile when a lookup errors or the write is rejected", async () => {
    const lookupFails = target(lookups, { TargetLocationIds: "Throttled" });
    expect(await run(custom, lookupFails)).toEqual([
      {
        key: "deliveryProfileSync:Oversized",
        kind: "DEFINITION",
        status: "FAILED",
        errorMessage: "Throttled",
      },
    ]);

    const writeFails = target({
      ...lookups,
      DeliveryProfileCreate: () => ({
        deliveryProfileCreate: {
          profile: null,
          userErrors: [{ message: "Zone countries overlap" }],
        },
      }),
    });
    const [row] = await run(custom, writeFails);
    expect([row.status, row.errorMessage]).toEqual([
      "FAILED",
      "Zone countries overlap",
    ]);
  });
});
