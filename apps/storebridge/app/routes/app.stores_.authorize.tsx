import type { ReactNode } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";

import { authenticate } from "~/shopify.server";
import {
  approvePairingRequest,
  getPairingLinkStatus,
} from "~/routes/app.stores/pairing.server";

type LoaderData =
  | {
      state: "pending";
      token: string;
      sourceShop: string;
      groupName: string | null;
    }
  | { state: "already_approved"; sourceShop: string; groupName: string | null }
  | { state: "already_declined" }
  | { state: "expired" }
  | { state: "not_found" };

/**
 * Redeems a pairing-authorization link (see ConnectStoreForm/
 * pairing.server.ts's requestPairing). A trailing-underscore route name
 * (app.stores_.authorize) so it lands at /app/stores/authorize without
 * nesting under app.stores/route.tsx's layout — this is its own page, not
 * part of the dashboard.
 */
export const loader = async ({
  request,
}: LoaderFunctionArgs): Promise<LoaderData> => {
  const { session } = await authenticate.admin(request);
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const status = await getPairingLinkStatus(token, session.shop);

  switch (status.state) {
    case "pending":
      return {
        state: "pending",
        token,
        sourceShop: status.target.group.source.shop,
        groupName: status.target.group.name,
      };
    case "already_approved":
      return {
        state: "already_approved",
        sourceShop: status.sourceShop,
        groupName: status.groupName,
      };
    case "already_declined":
    case "expired":
    case "not_found":
      return { state: status.state };
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  return approvePairingRequest({
    token: String(formData.get("token") ?? ""),
    shop: session.shop,
  });
};

function PairingStatusBanner({
  heading,
  tone,
  children,
}: {
  heading: string;
  tone: "critical" | "info" | "success";
  children: ReactNode;
}) {
  return (
    <s-page heading="Pairing link">
      <s-banner tone={tone} heading={heading}>
        <s-paragraph>{children}</s-paragraph>
      </s-banner>
    </s-page>
  );
}

/**
 * Split from the default export so tests can render each loader state
 * directly (`renderAuthorizeState({ state: "already_approved", ... })`)
 * without needing a router/loader-data context — the state → banner
 * mapping is the part actually worth regression-testing (see
 * app.stores_.authorize.test.tsx).
 */
export function renderAuthorizeState(data: LoaderData, actionError?: string) {
  switch (data.state) {
    case "not_found":
      return (
        <PairingStatusBanner
          heading="This link is invalid or expired"
          tone="critical"
        >
          Ask the store that sent it for a new pairing request, or check{" "}
          <s-link href="/app/stores">Connected stores</s-link> for pending
          invites you can decline.
        </PairingStatusBanner>
      );
    case "expired":
      return (
        <PairingStatusBanner
          heading="This pairing link has expired"
          tone="critical"
        >
          Ask the store that sent it for a new pairing request — links are only
          valid for a limited time.
        </PairingStatusBanner>
      );
    case "already_declined":
      return (
        <PairingStatusBanner
          heading="This pairing request was declined"
          tone="info"
        >
          You already declined this invite. Check{" "}
          <s-link href="/app/stores">Connected stores</s-link> if you want to
          ask the source store to send a new one.
        </PairingStatusBanner>
      );
    case "already_approved":
      return (
        <PairingStatusBanner
          heading={`Already paired with ${data.sourceShop}`}
          tone="success"
        >
          {data.groupName
            ? `You already approved joining the "${data.groupName}" sync group.`
            : "You already approved this pairing."}{" "}
          See it under <s-link href="/app/stores">Connected stores</s-link>.
        </PairingStatusBanner>
      );
    case "pending":
      return (
        <s-page heading="Confirm pairing">
          <s-section heading={`Pairing request from ${data.sourceShop}`}>
            {actionError && (
              <s-banner tone="critical" heading={actionError}></s-banner>
            )}
            <s-paragraph>
              {data.groupName
                ? `You're being invited to join the "${data.groupName}" sync group.`
                : "You're being invited to join a sync group."}{" "}
              Only approve this if you recognize {data.sourceShop} and were
              given this link by someone who actually runs it.
            </s-paragraph>
            <Form method="post">
              <input type="hidden" name="token" value={data.token} />
              <s-button-group>
                <s-button slot="primary-action" type="submit" variant="primary">
                  Approve pairing
                </s-button>
                <s-button slot="secondary-actions" href="/app/stores">
                  Not now
                </s-button>
              </s-button-group>
            </Form>
          </s-section>
        </s-page>
      );
  }
}

export default function AuthorizePairing() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const actionError =
    actionData && !actionData.ok ? actionData.error : undefined;
  return renderAuthorizeState(data, actionError);
}
