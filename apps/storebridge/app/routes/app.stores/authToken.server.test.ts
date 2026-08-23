import { describe, expect, it } from "vitest";

import {
  AUTH_TOKEN_TTL_MINUTES,
  generateAuthToken,
  hashAuthToken,
} from "./authToken.server";

describe("generateAuthToken", () => {
  it("returns a raw token whose hash matches hashAuthToken", () => {
    const { raw, hash } = generateAuthToken();
    expect(hashAuthToken(raw)).toBe(hash);
  });

  it("sets an expiry matching AUTH_TOKEN_TTL_MINUTES", () => {
    const before = Date.now();
    const { expiresAt } = generateAuthToken();
    const minutes = (expiresAt.getTime() - before) / (60 * 1000);
    expect(minutes).toBeGreaterThan(AUTH_TOKEN_TTL_MINUTES - 0.1);
    expect(minutes).toBeLessThan(AUTH_TOKEN_TTL_MINUTES + 0.1);
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
