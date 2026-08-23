import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData } from "react-router";

import { authenticate } from "~/shopify.server";
import {
  approvePairingRequest,
  getPendingRequestByToken,
} from "~/routes/app.stores/pairing.server";

/**
 * Redeems a pairing-authorization link (see ConnectStoreForm/
 * pairing.server.ts's requestPairing). A trailing-underscore route name
 * (app.stores_.authorize) so it lands at /app/stores/authorize without
 * nesting under app.stores/route.tsx's layout — this is its own page, not
 * part of the dashboard.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const pending = await getPendingRequestByToken(token, session.shop);

  if (!pending) {
    return { ok: false as const };
  }
  return {
    ok: true as const,
    token,
    sourceShop: pending.group.source.shop,
    groupName: pending.group.name,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  return approvePairingRequest({
    token: String(formData.get("token") ?? ""),
    shop: session.shop,
  });
};

export default function AuthorizePairing() {
  const data = useLoaderData<typeof loader>();

  if (!data.ok) {
    return (
      <s-page heading="Pairing link">
        <s-banner tone="critical" heading="This link is invalid or expired">
          <s-paragraph>
            Ask the store that sent it for a new pairing request, or check{" "}
            <s-link href="/app/stores">Connected stores</s-link> for pending
            invites you can decline.
          </s-paragraph>
        </s-banner>
      </s-page>
    );
  }

  return (
    <s-page heading="Confirm pairing">
      <s-section heading={`Pairing request from ${data.sourceShop}`}>
        <s-paragraph>
          {data.groupName
            ? `You're being invited to join the "${data.groupName}" sync group.`
            : "You're being invited to join a sync group."}{" "}
          Only approve this if you recognize {data.sourceShop} and were given
          this link by someone who actually runs it.
        </s-paragraph>
        <Form method="post">
          <input type="hidden" name="token" value={data.token} />
          <s-button type="submit" variant="primary">
            Approve pairing
          </s-button>
        </Form>
        <s-link href="/app/stores">Not now</s-link>
      </s-section>
    </s-page>
  );
}
