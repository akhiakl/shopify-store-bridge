import { useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { data, useLoaderData } from "react-router";

import { authenticate } from "~/shopify.server";
import { MetafieldDefinitionsSection } from "./components/MetafieldDefinitionsSection";
import { MetaobjectDefinitionsSection } from "./components/MetaobjectDefinitionsSection";
import { getDefinitionCatalog, getOwnedGroup } from "./definitions.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const groupId = params.groupId as string;

  const group = await getOwnedGroup(groupId, session.shop);
  if (!group) {
    throw data("Sync group not found.", { status: 404 });
  }

  const catalog = await getDefinitionCatalog(admin);
  return { group, ...catalog };
};

export default function GroupDefinitions() {
  const { group, metafieldDefinitions, metaobjectDefinitions } =
    useLoaderData<typeof loader>();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleKeys = (keys: string[], select: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      for (const key of keys) {
        if (select) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  };

  return (
    <s-page heading={`Sync definitions — ${group.name || "Untitled group"}`}>
      <s-section heading="Source">
        <s-paragraph>
          Browsing definitions on {group.source.shop}. Selected definitions will
          be migrated to this group&apos;s approved target stores once migration
          is available.
        </s-paragraph>
      </s-section>

      <s-section heading="Metafield definitions">
        <MetafieldDefinitionsSection
          definitions={metafieldDefinitions}
          selected={selected}
          onToggle={toggleKeys}
        />
      </s-section>

      <s-section heading="Metaobject definitions">
        <MetaobjectDefinitionsSection
          definitions={metaobjectDefinitions}
          selected={selected}
          onToggle={toggleKeys}
        />
      </s-section>

      <s-section heading="Selection">
        <s-paragraph>{selected.size} definition(s) selected.</s-paragraph>
        <s-button disabled variant="primary">
          Migrate selected (coming soon)
        </s-button>
      </s-section>
    </s-page>
  );
}
