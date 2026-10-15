import { describe, expect, it } from "vitest";

import { staffNote } from "./staffNote";

describe("staffNote", () => {
  it("names who requested and who approved", () => {
    expect(
      staffNote({ status: "APPROVED", requestedBy: "Ana", respondedBy: "Bo" }),
    ).toBe("Requested by Ana · Approved by Bo");
  });

  it("says declined for a declined connection", () => {
    expect(
      staffNote({ status: "DECLINED", requestedBy: null, respondedBy: "Bo" }),
    ).toBe("Declined by Bo");
  });

  it("is null when nobody was recorded", () => {
    expect(
      staffNote({ status: "PENDING", requestedBy: null, respondedBy: null }),
    ).toBeNull();
  });
});
