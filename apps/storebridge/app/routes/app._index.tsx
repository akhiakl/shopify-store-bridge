import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

/**
 * App Home placeholder. Replaces the template's demo "generate product" page,
 * which isn't part of StoreBridge's scope. Real content (sync group status,
 * job list, pairing flow) lands here once those features are built.
 *
 * Uses Polaris Web Components (shopify-app-template-react-router's UI
 * layer) instead of the deprecated @shopify/polaris React library.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function Index() {
  return (
    <s-page heading="StoreBridge">
      <s-section heading="Welcome to StoreBridge">
        <s-paragraph>
          Sync group setup, pairing, and job history will appear here.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}
