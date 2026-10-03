import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

import { authenticate } from "~/shopify.server";
import { getDashboardData } from "~/utils/dashboard.server";
import { ConnectStoreForm } from "./components/ConnectStoreForm";
import { IncomingConnectionsList } from "./components/IncomingConnectionsList";
import { IncomingRequestsList } from "./components/IncomingRequestsList";
import { OutgoingConnectionsList } from "./components/OutgoingConnectionsList";
import {
  declinePairingRequest,
  regeneratePairingRequest,
  requestPairing,
} from "./pairing.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return getDashboardData(session.shop);
};

/** Shared by the "connect" and "regenerate" intents: both end up handing
 * the merchant the same shareable authorize link shape. */
function buildAuthorizeUrl(
  token: string,
  targetShop: string,
  requestUrl: string,
): string {
  const authorizeUrl = new URL(
    "/app/stores/authorize",
    process.env.SHOPIFY_APP_URL || requestUrl,
  );
  authorizeUrl.searchParams.set("token", token);
  authorizeUrl.searchParams.set("shop", targetShop);
  return authorizeUrl.toString();
}

/**
 * Handles the three form intents this route posts: inviting a target
 * store to connect ("connect"), declining an incoming pairing
 * request ("decline"), and reissuing a lost/expired authorize link for a
 * still-pending request the source sent ("regenerate"): approving one
 * happens on app.stores.authorize instead, since it requires the one-time
 * token from the invite (see pairing.server.ts). `session.shop` (never
 * form input) is the caller's identity, so a store can only act on its
 * own behalf.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "connect") {
    const result = await requestPairing({
      sourceShop: session.shop,
      targetDomain: String(formData.get("targetDomain") ?? ""),
    });
    if (!result.ok) return result;

    return {
      ok: true,
      authorizeUrl: buildAuthorizeUrl(
        result.authToken,
        result.targetShop,
        request.url,
      ),
    } as const;
  }

  if (intent === "decline") {
    return declinePairingRequest({
      connectionId: String(formData.get("connectionId") ?? ""),
      shop: session.shop,
    });
  }

  if (intent === "regenerate") {
    const result = await regeneratePairingRequest({
      connectionId: String(formData.get("connectionId") ?? ""),
      shop: session.shop,
    });
    if (!result.ok) return result;

    return {
      ok: true,
      authorizeUrl: buildAuthorizeUrl(
        result.authToken,
        result.targetShop,
        request.url,
      ),
    } as const;
  }

  return { ok: false, error: "Unknown action." };
};

export default function Stores() {
  const { outgoing, incomingRequests, incoming } =
    useLoaderData<typeof loader>();

  return (
    <s-page heading="Connected stores">
      <s-section heading="Connect a store">
        <ConnectStoreForm />
      </s-section>

      {incomingRequests.length > 0 && (
        <s-section heading="Pairing requests">
          <IncomingRequestsList requests={incomingRequests} />
        </s-section>
      )}

      <s-section heading="Stores you sync to">
        <OutgoingConnectionsList connections={outgoing} />
      </s-section>

      {incoming.length > 0 && (
        <s-section heading="Stores you pull from">
          <IncomingConnectionsList connections={incoming} />
        </s-section>
      )}
    </s-page>
  );
}
