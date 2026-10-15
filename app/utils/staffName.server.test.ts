import { describe, expect, it } from "vitest";

import { staffName } from "./staffName.server";

const session = (associated_user?: Record<string, unknown>) =>
  ({
    onlineAccessInfo: associated_user ? { associated_user } : undefined,
  }) as never;

describe("staffName", () => {
  it("joins the staff member's first and last name", () => {
    expect(
      staffName(session({ first_name: "Ana", last_name: "Li", email: "a@x" })),
    ).toBe("Ana Li");
  });

  it("falls back to the email when there's no name", () => {
    expect(
      staffName(session({ first_name: "", last_name: "", email: "a@x" })),
    ).toBe("a@x");
  });

  it("is null for an offline session or a user with nothing to show", () => {
    expect(staffName(session())).toBeNull();
    expect(staffName(session({}))).toBeNull();
  });
});
