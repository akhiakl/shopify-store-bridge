import { createHash, randomBytes } from "node:crypto";

import { AUTH_TOKEN_TTL_MINUTES } from "./authTokenTtl";

/**
 * How long a generated pairing-authorization link stays valid. Pairing is
 * a same-owner, both-stores-in-hand flow (see store-pairing.md) — the
 * merchant sending the link and the one opening it are typically doing so
 * within the same short session, not over days, so a long TTL isn't
 * buying anything except a bigger window for a leaked link. 15 minutes
 * (see authTokenTtl.ts) matches the sibling `#60`/`#61` branch's value;
 * "Resend link" (`regeneratePairingRequest`) covers a link that expires
 * before it's used.
 */
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
