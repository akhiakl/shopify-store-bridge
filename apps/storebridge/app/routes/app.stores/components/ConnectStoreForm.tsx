import { useEffect, useRef } from "react";
import { useFetcher } from "react-router";

type ConnectActionData =
  { ok: true } | { ok: false; error: string; installUrl?: string };

/**
 * Invite a target store (by domain) into a new sync group. The current
 * store is always the source — there's no source picker, see AGENTS.md's
 * store-pairing notes.
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
    <fetcher.Form method="post" ref={formRef}>
      <input type="hidden" name="intent" value="connect" />
      <s-stack gap="base">
        {data && !data.ok && (
          <s-banner tone="critical" heading={data.error}>
            {data.installUrl && (
              <s-link href={data.installUrl}>Install StoreBridge there</s-link>
            )}
          </s-banner>
        )}
        <s-text-field
          name="targetDomain"
          label="Store domain"
          details="example.myshopify.com"
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
  );
}
