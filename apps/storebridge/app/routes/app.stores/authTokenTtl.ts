/**
 * How long a generated pairing-authorization link stays valid, in minutes.
 * Split out of authToken.server.ts (a `.server` module, stripped from the
 * client bundle) so client components displaying this value — e.g.
 * PairingLinkPanel — can import it too without crossing the server/client
 * boundary React Router enforces. See authToken.server.ts's doc comment
 * for why 15 minutes.
 */
export const AUTH_TOKEN_TTL_MINUTES = 15;
