import { createHash, randomBytes } from "node:crypto";

/** How long a generated pairing-authorization link stays valid. */
const AUTH_TOKEN_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours

/**
 * Generates a pairing-authorization token: a raw, URL-safe secret to hand
 * to the caller (shown once, put in the shareable link) and its SHA-256
 * hash to persist instead (never store the raw value — same reasoning as
 * a password reset token).
 */
export function generateAuthToken(): {
  raw: string;
  hash: string;
  expiresAt: Date;
} {
  const raw = randomBytes(32).toString("base64url");
  return {
    raw,
    hash: hashAuthToken(raw),
    expiresAt: new Date(Date.now() + AUTH_TOKEN_TTL_MS),
  };
}

/** Hashes a raw token the same way for lookup as for storage. */
export function hashAuthToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
