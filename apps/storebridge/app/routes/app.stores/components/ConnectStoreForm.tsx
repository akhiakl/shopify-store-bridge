import { useEffect, useRef } from "react";
import { useFetcher } from "react-router";

type ConnectActionData =
  | { ok: true; authorizeUrl: string }
  | { ok: false; error: string; installUrl?: string };

/**
 * Invite a target store (by domain) into a new sync group. The current
 * store is always the source — there's no source picker, see AGENTS.md's
 * store-pairing notes. On success, shows a one-time authorization link to
 * copy and send to whoever actually runs the target store (outside this
 * app) — Shopify has no API to confirm the two shops share an owner, so
 * that out-of-band handoff is the proof; only the link's holder can
 * approve the pairing.
 */
export function ConnectStoreForm() {
  const fetcher = useFetcher<ConnectActionData>();
  const formRef = useRef<HTMLFormElement>(null);
  const isSubmitting = fetcher.state !== "idle";
  const data = fetcher.data;

  useEffect(() => {
    if (data?.ok) {
      formRef.current?.reset();
    }
  }, [data]);

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
            Send this link to whoever runs the target store — only they can
            approve it, and it expires in 48 hours.
          </s-paragraph>
          <s-text-field
            label="Authorization link"
            value={data.authorizeUrl}
            readOnly
          ></s-text-field>
        </s-banner>
      )}
      <fetcher.Form method="post" ref={formRef}>
        <input type="hidden" name="intent" value="connect" />
        <s-stack gap="base">
          <s-text-field
            name="targetDomain"
            label="Store domain"
            details="your-store or your-store.myshopify.com"
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
