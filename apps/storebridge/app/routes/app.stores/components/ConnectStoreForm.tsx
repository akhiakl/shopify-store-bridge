import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";

import { useRedirectCountdown } from "../hooks/useRedirectCountdown";

type ConnectActionData =
  | { ok: true; authorizeUrl: string; expiresInMinutes: number }
  | { ok: false; error: string; installUrl?: string };

/**
 * How long before the authorization link opens on its own — see
 * useRedirectCountdown's doc comment for why this needs a real navigation,
 * not a route change. Tune freely; nothing else depends on this number.
 */
const AUTO_REDIRECT_SECONDS = 5;

/**
 * Invite a target store (by domain) into a new sync group. The current
 * store is always the source — there's no source picker, see AGENTS.md's
 * store-pairing notes. On success, shows a one-time authorization link —
 * copyable, openable directly, and opened automatically after a short
 * countdown, since pairing today is a same-owner, both-stores-in-hand flow
 * (see authToken.server.ts's doc comment) rather than something handed to
 * an unrelated party to act on later.
 */
export function ConnectStoreForm() {
  const fetcher = useFetcher<ConnectActionData>();
  const formRef = useRef<HTMLFormElement>(null);
  const isSubmitting = fetcher.state !== "idle";
  const data = fetcher.data;
  const [copied, setCopied] = useState(false);

  const authorizeUrl = data?.ok ? data.authorizeUrl : undefined;
  const { secondsLeft, cancel, cancelled } = useRedirectCountdown(
    authorizeUrl,
    AUTO_REDIRECT_SECONDS,
  );

  // Reset the "Copied" state during render when a new successful response
  // comes in, rather than in an effect — see useRedirectCountdown's
  // trackedFor comment for why.
  const [trackedData, setTrackedData] = useState(data);
  if (data !== trackedData) {
    setTrackedData(data);
    setCopied(false);
  }

  useEffect(() => {
    if (data?.ok) {
      formRef.current?.reset();
    }
  }, [data]);

  async function copyLink(url: string) {
    await navigator.clipboard.writeText(url);
    setCopied(true);
  }

  return (
    <s-stack gap="base">
      {data && !data.ok && (
        <s-banner tone="critical" heading={data.error}>
          {data.installUrl && (
            <s-link href={data.installUrl}>Install StoreBridge there</s-link>
          )}
        </s-banner>
      )}
      {data?.ok && (
        <s-banner tone="success" heading="Pairing request created">
          <s-paragraph>
            Only whoever holds this link can approve it, and it expires in{" "}
            {data.expiresInMinutes} minutes.
          </s-paragraph>
          <s-stack direction="inline" gap="small">
            <s-link href={data.authorizeUrl} target="_blank">
              Open authorization link
            </s-link>
            <s-button onClick={() => copyLink(data.authorizeUrl)}>
              {copied ? "Copied" : "Copy link"}
            </s-button>
          </s-stack>
          {!cancelled && (
            <s-paragraph>
              Opening it automatically in {secondsLeft}s —{" "}
              <s-button variant="tertiary" onClick={cancel}>
                Cancel
              </s-button>
            </s-paragraph>
          )}
        </s-banner>
      )}
      <fetcher.Form method="post" ref={formRef}>
        <input type="hidden" name="intent" value="connect" />
        <s-stack gap="base">
          <s-text-field
            name="targetDomain"
            label="Store domain"
            details="e.g. example or example.myshopify.com"
            autocomplete="off"
            required
          ></s-text-field>
          <s-text-field
            name="groupName"
            label="Group name (optional)"
            autocomplete="off"
          ></s-text-field>
          <s-button type="submit" variant="primary" loading={isSubmitting}>
            Send pairing request
          </s-button>
        </s-stack>
      </fetcher.Form>
    </s-stack>
  );
}
