import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

import { authenticate } from "~/shopify.server";
import { ConnectStoreForm } from "./components/ConnectStoreForm";
import { IncomingRequestsList } from "./components/IncomingRequestsList";
import { MembershipsList } from "./components/MembershipsList";
import { OwnedGroupsList } from "./components/OwnedGroupsList";
import {
  declinePairingRequest,
  getDashboardData,
  requestPairing,
} from "./pairing.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return getDashboardData(session.shop);
};

/**
 * Handles the two form intents this route posts: inviting a target store
 * into a sync group ("connect"), and declining an incoming pairing
 * request ("decline") — approving one happens on app.stores.authorize
 * instead, since it requires the one-time token from the invite (see
 * pairing.server.ts). `session.shop` — never form input — is the caller's
 * identity, so a store can only act on its own behalf.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "connect") {
    const groupId = formData.get("groupId");
    const groupName = formData.get("groupName");
    const result = await requestPairing({
      sourceShop: session.shop,
      targetDomain: String(formData.get("targetDomain") ?? ""),
      groupId: groupId ? String(groupId) : undefined,
      groupName: groupName ? String(groupName) : undefined,
    });
    if (!result.ok) return result;

    const authorizeUrl = new URL(
      "/app/stores/authorize",
      process.env.SHOPIFY_APP_URL || request.url,
    );
    authorizeUrl.searchParams.set("token", result.authToken);
    authorizeUrl.searchParams.set("shop", result.targetShop);
    return { ok: true, authorizeUrl: authorizeUrl.toString() } as const;
  }

  if (intent === "decline") {
    return declinePairingRequest({
      targetId: String(formData.get("targetId") ?? ""),
      shop: session.shop,
    });
  }

  return { ok: false, error: "Unknown action." };
};

export default function Stores() {
  const { ownedGroups, incomingRequests, memberships } =
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

      <s-section heading="Your sync groups">
        <OwnedGroupsList groups={ownedGroups} />
      </s-section>

      {memberships.length > 0 && (
        <s-section heading="Paired as a target">
          <MembershipsList memberships={memberships} />
        </s-section>
      )}
    </s-page>
  );
}
