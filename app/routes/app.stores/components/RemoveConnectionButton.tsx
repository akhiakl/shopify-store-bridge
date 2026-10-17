import { useFetcher } from "react-router";

import type { CONNECTION_STATUS } from "~/utils/connectionStatus";

type ConnectionStatus = keyof typeof CONNECTION_STATUS;

/** Button and dialog wording per status (`{shop}` is the other store): a pending connection is still an
 * invite, a declined one is only cleared from the list. */
const COPY: Record<
  ConnectionStatus,
  { action: string; heading: string; body: string }
> = {
  PENDING: {
    action: "Cancel invite",
    heading: "Cancel the invite to {shop}?",
    body: "The pairing link stops working. You can send a new invite later.",
  },
  APPROVED: {
    action: "Disconnect",
    heading: "Disconnect {shop}?",
    body: "Syncing between the two stores stops and this connection's job history is deleted. Data already synced stays on both stores. You can pair again later with a new invite.",
  },
  DECLINED: {
    action: "Remove",
    heading: "Remove the declined request with {shop}?",
    body: "It's cleared from the list. You can send a new invite later.",
  },
};

/** Deletes a connection or invite after a confirmation, since it can't be
 * undone and takes the job history with it. */
export function RemoveConnectionButton({
  connectionId,
  status,
  shop,
}: {
  connectionId: string;
  status: ConnectionStatus;
  /** The other store, named in the dialog. */
  shop: string;
}) {
  const fetcher = useFetcher<{ ok: true } | { ok: false; error: string }>();
  const modalId = `remove-connection-${connectionId}`;
  const copy = COPY[status];
  const remove = () => {
    void fetcher.submit({ intent: "remove", connectionId }, { method: "post" });
  };

  return (
    <>
      <s-button
        tone="critical"
        variant="tertiary"
        loading={fetcher.state !== "idle"}
        commandFor={modalId}
        command="--show"
      >
        {copy.action}
      </s-button>
      {fetcher.data && !fetcher.data.ok && (
        <s-text tone="critical">{fetcher.data.error}</s-text>
      )}
      <s-modal id={modalId} heading={copy.heading.replace("{shop}", shop)}>
        <s-paragraph>{copy.body}</s-paragraph>
        <s-button
          slot="primary-action"
          variant="primary"
          tone="critical"
          commandFor={modalId}
          command="--hide"
          onClick={remove}
        >
          {copy.action}
        </s-button>
        <s-button
          slot="secondary-actions"
          commandFor={modalId}
          command="--hide"
        >
          Keep
        </s-button>
      </s-modal>
    </>
  );
}
