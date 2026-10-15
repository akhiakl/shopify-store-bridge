import { useFetcher } from "react-router";

const MODAL_ID = "cancel-plan";

/** Cancels Pro after a confirmation, since it turns off auto-sync and
 * Pro-only sync types for every connection this store is the source of. */
export function CancelPlanButton({
  subscriptionId,
}: {
  subscriptionId: string;
}) {
  const fetcher = useFetcher<{ ok: boolean }>();
  const cancel = () => {
    void fetcher.submit(
      { intent: "cancel", subscriptionId },
      { method: "post" },
    );
  };

  return (
    <>
      <s-button
        tone="critical"
        loading={fetcher.state !== "idle"}
        commandFor={MODAL_ID}
        command="--show"
      >
        Cancel Pro
      </s-button>
      <s-modal id={MODAL_ID} heading="Cancel StoreBridge Pro?">
        <s-paragraph>
          Auto-sync stops, and only metafields, metaobjects and collections can
          be synced from this store. Shopify credits the unused part of this
          billing period.
        </s-paragraph>
        <s-button
          slot="primary-action"
          variant="primary"
          tone="critical"
          commandFor={MODAL_ID}
          command="--hide"
          onClick={cancel}
        >
          Cancel Pro
        </s-button>
        <s-button
          slot="secondary-actions"
          commandFor={MODAL_ID}
          command="--hide"
        >
          Keep Pro
        </s-button>
      </s-modal>
    </>
  );
}
