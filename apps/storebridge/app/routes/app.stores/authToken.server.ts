import { createHash, randomBytes } from "node:crypto";

/**
 * How long a generated pairing-authorization link stays valid. Short on
 * purpose right now: pairing is currently only used for migrating between
 * a merchant's own stores, where the link is opened within seconds (see
 * ConnectStoreForm's auto-redirect) rather than shared out-of-band and
 * acted on later. Widen this again once pairing supports a genuinely
 * different store owner on the other end — see requestPairing's doc
 * comment for that trust model.
 */
export const AUTH_TOKEN_TTL_MINUTES = 15;
const AUTH_TOKEN_TTL_MS = AUTH_TOKEN_TTL_MINUTES * 60 * 1000;

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
