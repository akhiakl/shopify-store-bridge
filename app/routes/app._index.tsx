import type { LoaderFunctionArgs } from "@remix-run/node";
import { Page, Layout, Card, BlockStack, Text } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

/**
 * App Home placeholder. Replaces the template's demo "generate product" page,
 * which isn't part of StoreBridge's scope. Real content (sync group status,
 * job list, pairing flow) lands here once those features are built.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function Index() {
  return (
    <Page>
      <TitleBar title="StoreBridge" />
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">
                Welcome to StoreBridge
              </Text>
              <Text as="p" variant="bodyMd">
                Sync group setup, pairing, and job history will appear here.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
