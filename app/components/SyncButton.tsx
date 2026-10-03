import { useId } from "react";
import { useFetcher } from "react-router";

type SyncActionData =
  { ok: true; jobId: string } | { ok: false; error: string };

interface SyncButtonProps {
  selected: Set<string>;
  /** False until the target approves the connection: no syncing yet. */
  isApproved: boolean;
  /** Where job progress shows: the group's Job history page. */
  historyHref: string;
  /** Asks first, for a sync that changes something live on the target. */
  confirm?: { heading: string; body: string };
}

/**
 * "Sync now" as the page's primary action, which the embedded admin shows
 * in its title bar, so it stays in reach however long the list below is.
 * Must render as a direct child of `s-page` (slots only work there): a
 * group page renders it at the top of its fragment, straight into the
 * layout's `s-page`. Feedback banners render in the page itself. Each
 * selected key is sent as its own `selection` field (`formData.getAll` on
 * the server).
 */
export function SyncButton({
  selected,
  isApproved,
  historyHref,
  confirm,
}: SyncButtonProps) {
  const modalId = useId();
  const fetcher = useFetcher<SyncActionData>();
  const data = fetcher.data;

  const submit = () => {
    const formData = new FormData();
    formData.append("intent", "sync");
    for (const key of selected) formData.append("selection", key);
    void fetcher.submit(formData, { method: "post" });
  };

  return (
    <>
      <s-button
        slot="primary-action"
        variant="primary"
        disabled={selected.size === 0 || !isApproved}
        loading={fetcher.state !== "idle"}
        {...(confirm
          ? { commandFor: modalId, command: "--show" as const }
          : { onClick: submit })}
      >
        {selected.size > 0 ? `Sync ${selected.size} selected` : "Sync now"}
      </s-button>
      {confirm && (
        <s-modal id={modalId} heading={confirm.heading}>
          <s-paragraph>{confirm.body}</s-paragraph>
          <s-button
            slot="primary-action"
            variant="primary"
            commandFor={modalId}
            command="--hide"
            onClick={submit}
          >
            Sync
          </s-button>
          <s-button
            slot="secondary-actions"
            commandFor={modalId}
            command="--hide"
          >
            Cancel
          </s-button>
        </s-modal>
      )}
      {!isApproved && (
        <s-banner tone="warning" heading="Waiting for approval">
          Syncing is available once the other store approves the pairing
          request.
        </s-banner>
      )}
      {data && !data.ok && (
        <s-banner tone="critical" heading={data.error}></s-banner>
      )}
      {data?.ok && (
        <s-banner tone="info" heading="Sync started" dismissible>
          It runs in the background. Follow its progress in{" "}
          <s-link href={historyHref}>Job history</s-link>.
        </s-banner>
      )}
    </>
  );
}
