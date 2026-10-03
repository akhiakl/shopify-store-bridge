import { describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: { query: { syncJobs: { findMany: vi.fn() } } },
}));
vi.mock("~/db.server", () => ({ default: dbMock }));

const { parseSelection, resolvePlan, getJobHistory } =
  await import("./sync.server");

function jsonResponse(data: unknown) {
  return { json: () => Promise.resolve({ data }) };
}

/** A source store with one item in every category the sync can push. */
function sourceAdmin() {
  return {
    graphql: vi.fn((query: string) => {
      if (query.includes("MetaobjectDefinitionsList")) {
        return Promise.resolve(
          jsonResponse({
            metaobjectDefinitions: {
              nodes: [
                {
                  id: "gid://MetaobjectDefinition/1",
                  type: "faq",
                  name: "FAQ",
                  metaobjectsCount: 1,
                  fieldDefinitions: [],
                },
              ],
            },
          }),
        );
      }
      if (query.includes("MetafieldDefinitionsByOwner")) {
        return Promise.resolve(
          jsonResponse({
            metafieldDefinitions: {
              nodes: [
                {
                  id: "gid://MetafieldDefinition/1",
                  name: "Care",
                  namespace: "custom",
                  key: "care",
                  description: null,
                  type: { name: "single_line_text_field" },
                },
              ],
            },
          }),
        );
      }
      if (query.includes("ShopPoliciesList")) {
        return Promise.resolve(
          jsonResponse({
            shop: {
              shopPolicies: [
                { type: "REFUND_POLICY", title: "Refunds", body: "30 days" },
              ],
            },
          }),
        );
      }
      if (query.includes("CollectionsList")) {
        return Promise.resolve(
          jsonResponse({
            collections: {
              nodes: [
                {
                  handle: "summer",
                  title: "Summer",
                  descriptionHtml: "",
                  sortOrder: "MANUAL",
                  templateSuffix: null,
                  seo: { title: null, description: null },
                },
              ],
            },
          }),
        );
      }
      if (query.includes("LocationsList")) {
        return Promise.resolve(
          jsonResponse({
            locations: {
              nodes: ["Main: Warehouse", "Pop-up"].map((name) => ({
                name,
                isFulfillmentService: false,
                fulfillsOnlineOrders: true,
                address: { countryCode: "CA" },
              })),
            },
          }),
        );
      }
      if (query.includes("MenusList")) {
        return Promise.resolve(
          jsonResponse({
            menus: {
              nodes: ["main-menu", "footer"].map((handle) => ({
                handle,
                title: handle,
                items: [
                  {
                    title: "Home",
                    type: "FRONTPAGE",
                    url: "/",
                    resourceId: null,
                    tags: [],
                  },
                ],
              })),
            },
          }),
        );
      }
      if (query.includes("MetafieldValueOwners")) {
        return Promise.resolve(
          jsonResponse({
            metafieldDefinition: {
              metafields: {
                nodes: [{ owner: { id: "gid://Product/1" } }],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          }),
        );
      }
      if (query.includes("MetaobjectEntries")) {
        return Promise.resolve(
          jsonResponse({
            metaobjects: {
              nodes: [
                {
                  handle: "q1",
                  capabilities: { publishable: null },
                  fields: [],
                },
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    }),
  };
}

describe("parseSelection", () => {
  it("splits every key kind into its identifying parts", () => {
    expect(
      parseSelection([
        "metaobject:size_chart",
        "metafield:PRODUCT:custom:care",
        "policy:REFUND_POLICY",
        "collection:summer-sale",
        "metaobjectEntries:faq",
        "metafieldValues:CUSTOMER:custom:tier",
        "menu:main-menu",
        "location:Main: Warehouse",
      ]),
    ).toEqual({
      metaobjectTypes: ["size_chart"],
      metafieldSelectors: [
        { ownerType: "PRODUCT", namespace: "custom", key: "care" },
      ],
      policyTypes: ["REFUND_POLICY"],
      collectionHandles: ["summer-sale"],
      metaobjectEntryTypes: ["faq"],
      metafieldValueSelectors: [
        { ownerType: "CUSTOMER", namespace: "custom", key: "tier" },
      ],
      menuHandles: ["main-menu"],
      locationNames: ["Main: Warehouse"],
    });
  });
});

describe("resolvePlan", () => {
  it("keeps only selected items that exist on the source, read fresh", async () => {
    const admin = sourceAdmin();

    const plan = await resolvePlan(
      admin as never,
      parseSelection([
        "metaobject:faq",
        "metafield:PRODUCT:custom:care",
        "policy:REFUND_POLICY",
        "collection:summer",
        "metaobjectEntries:faq",
        "metafieldValues:PRODUCT:custom:care",
        "metafieldValues:SHOP:custom:care",
        "menu:main-menu",
        "location:Main: Warehouse",
      ]),
    );

    expect(plan.metaobjectDefinitions.map((d) => d.type)).toEqual(["faq"]);
    // The metafield query runs once per owner type; only PRODUCT matches.
    expect(plan.metafieldDefinitions).toHaveLength(1);
    expect(plan.metafieldDefinitions[0].ownerType).toBe("PRODUCT");
    expect(plan.shopPolicies.map((p) => p.type)).toEqual(["REFUND_POLICY"]);
    expect(plan.collections.map((c) => c.handle)).toEqual(["summer"]);
    expect(plan.metaobjectEntries.map((e) => e.handle)).toEqual(["q1"]);
    expect(plan.metafieldValues).toEqual([
      {
        definition: { ownerType: "PRODUCT", namespace: "custom", key: "care" },
        ownerIds: ["gid://Product/1"],
      },
    ]);
    // The Shop's value needs no owner lookup, just its definition; and
    // selecting it doesn't select the definition itself.
    expect(plan.shopMetafieldValues?.map((d) => d.ownerType)).toEqual(["SHOP"]);
    expect(plan.metafieldDefinitions.some((d) => d.ownerType === "SHOP")).toBe(
      false,
    );
    expect(plan.locations).toEqual([
      {
        name: "Main: Warehouse",
        fulfillsOnlineOrders: true,
        address: { countryCode: "CA" },
      },
    ]);
    expect(plan.menus).toEqual([
      {
        handle: "main-menu",
        title: "main-menu",
        items: [
          {
            title: "Home",
            type: "FRONTPAGE",
            tags: [],
            link: { kind: "plain", url: "/" },
            items: [],
          },
        ],
      },
    ]);
  });

  it("drops keys that no longer match, and never queries entries of an unknown type", async () => {
    const admin = sourceAdmin();

    const plan = await resolvePlan(
      admin as never,
      parseSelection([
        "metaobject:gone",
        "policy:LEGAL_NOTICE",
        "collection:winter",
        "metaobjectEntries:gone",
        "metafieldValues:PRODUCT:custom:gone",
      ]),
    );

    expect(Object.values(plan).every((list) => list.length === 0)).toBe(true);
    expect(
      admin.graphql.mock.calls.some(
        ([q]) =>
          q.includes("MetaobjectEntries") ||
          q.includes("MetafieldValueOwners") ||
          // No menu or location selected, so neither is even listed.
          q.includes("MenusList") ||
          q.includes("LocationsList"),
      ),
    ).toBe(false);
  });
});

describe("getJobHistory", () => {
  it("queries jobs for the connection, newest first, with their items", async () => {
    dbMock.query.syncJobs.findMany.mockResolvedValue([{ id: "job-1" }]);

    const history = await getJobHistory("conn-1");

    expect(dbMock.query.syncJobs.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        columns: { plan: false },
        with: { items: true },
      }),
    );
    expect(history).toEqual([{ id: "job-1" }]);
  });
});
