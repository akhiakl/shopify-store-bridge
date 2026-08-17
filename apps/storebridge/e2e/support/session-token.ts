import { createHmac, randomUUID } from "node:crypto";

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

interface SignSessionTokenOptions {
  shop: string;
  apiKey: string;
  apiSecretKey: string;
}

/**
 * Signs a Shopify embedded-app session token (JWT) for e2e tests — stands
 * in for the token Shopify's App Bridge would normally mint client-side.
 *
 * Claim shape and signing confirmed by reading the installed
 * @shopify/shopify-api source directly (not from memory, and no Shopify Dev
 * MCP was available this session to cross-check against the docs):
 *   - HS256, key = the raw apiSecretKey bytes, no derivation
 *     (lib/utils/get-hmac-key.js)
 *   - `aud` must equal the app's SHOPIFY_API_KEY; `dest` must be a URL
 *     whose hostname is the shop domain (lib/session/decode-session-token.js,
 *     shopify-app-react-router's authenticate/admin/authenticate.js)
 * Re-verify against Shopify Dev MCP if @shopify/shopify-api's session-token
 * verification changes in a future upgrade.
 */
export function signSessionToken({
  shop,
  apiKey,
  apiSecretKey,
}: SignSessionTokenOptions): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    iss: `https://${shop}/admin`,
    dest: `https://${shop}`,
    aud: apiKey,
    sub: "1",
    exp: now + 60,
    nbf: now - 10,
    iat: now,
    jti: randomUUID(),
    sid: randomUUID(),
  };
  const data = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = base64url(
    createHmac("sha256", apiSecretKey).update(data).digest(),
  );
  return `${data}.${signature}`;
}
