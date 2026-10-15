import { useFetcher } from "react-router";

/** Starts the upgrade; the action redirects to Shopify's approval page. */
export function UpgradeButton() {
  const fetcher = useFetcher();
  return (
    <fetcher.Form method="post">
      <input type="hidden" name="intent" value="upgrade" />
      <s-button
        type="submit"
        variant="primary"
        loading={fetcher.state !== "idle"}
      >
        Upgrade to Pro
      </s-button>
    </fetcher.Form>
  );
}
