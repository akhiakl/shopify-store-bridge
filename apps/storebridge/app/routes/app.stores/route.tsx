import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

import { authenticate } from "~/shopify.server";
import { ConnectStoreForm } from "./components/ConnectStoreForm";
import { IncomingRequestsList } from "./components/IncomingRequestsList";
import { MembershipsList } from "./components/MembershipsList";
import { OwnedGroupsList } from "./components/OwnedGroupsList";
import {
  getDashboardData,
  requestPairing,
  respondToPairingRequest,
} from "./pairing.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return getDashboardData(session.shop);
};

/**
 * Handles the three form intents this route posts: inviting a target store
 * into a sync group ("connect"), and responding to an incoming pairing
 * request ("approve"/"decline"). `session.shop` — never form input — is the
 * caller's identity, so a store can only act on its own behalf.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "connect") {
    const groupId = formData.get("groupId");
    const groupName = formData.get("groupName");
    return requestPairing({
      sourceShop: session.shop,
      targetDomain: String(formData.get("targetDomain") ?? ""),
      groupId: groupId ? String(groupId) : undefined,
      groupName: groupName ? String(groupName) : undefined,
    });
  }

  if (intent === "approve" || intent === "decline") {
    return respondToPairingRequest({
      targetId: String(formData.get("targetId") ?? ""),
      shop: session.shop,
      approve: intent === "approve",
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
