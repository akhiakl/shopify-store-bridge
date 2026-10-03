import { describe, expect, it } from "vitest";

import { dataRequestCsv } from "./dataRequestCsv";

describe("dataRequestCsv", () => {
  it("writes a header and one quoted line per row, escaping quotes", () => {
    expect(
      dataRequestCsv([
        {
          syncedAt: new Date("2026-10-01T10:00:00Z"),
          targetShop: "eu.myshopify.com",
          metafield: "custom.tier",
          status: "SKIPPED",
          errorMessage: 'No "matching" customer on this store.',
        },
        {
          syncedAt: new Date("2026-10-02T10:00:00Z"),
          targetShop: "us.myshopify.com",
          metafield: "custom.tier",
          status: "SUCCEEDED",
          errorMessage: null,
        },
      ]),
    ).toBe(
      [
        '"Synced at","Target store","Metafield","Status","Note"',
        '"2026-10-01T10:00:00.000Z","eu.myshopify.com","custom.tier","SKIPPED","No ""matching"" customer on this store."',
        '"2026-10-02T10:00:00.000Z","us.myshopify.com","custom.tier","SUCCEEDED",""',
      ].join("\n"),
    );
  });
});
