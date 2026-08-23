import { describe, expect, it } from "vitest";

import { generateAuthToken, hashAuthToken } from "./authToken.server";

describe("generateAuthToken", () => {
  it("returns a raw token whose hash matches hashAuthToken", () => {
    const { raw, hash } = generateAuthToken();
    expect(hashAuthToken(raw)).toBe(hash);
  });

  it("sets an expiry roughly 48 hours out", () => {
    const before = Date.now();
    const { expiresAt } = generateAuthToken();
    const hours = (expiresAt.getTime() - before) / (60 * 60 * 1000);
    expect(hours).toBeGreaterThan(47.9);
    expect(hours).toBeLessThan(48.1);
  });

  it("generates a different raw token each call", () => {
    const a = generateAuthToken();
    const b = generateAuthToken();
    expect(a.raw).not.toBe(b.raw);
  });
});

describe("hashAuthToken", () => {
  it("is deterministic for the same input", () => {
    expect(hashAuthToken("same-input")).toBe(hashAuthToken("same-input"));
  });

  it("differs for different input", () => {
    expect(hashAuthToken("a")).not.toBe(hashAuthToken("b"));
  });
});
