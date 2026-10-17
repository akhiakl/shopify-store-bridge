import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

import { SyncButton } from "~/components/SyncButton";
import { useSelection } from "~/hooks/useSelection";
import { getContent } from "~/utils/sync/content.server";
import {
  connectionPageAction,
  requireConnectionPage,
} from "~/utils/sync/connectionRoute.server";
import { blogKey, pageKey } from "~/utils/sync/definitionKey";

import { HandleListSection } from "./components/HandleListSection";

export const loader = async (args: LoaderFunctionArgs) => {
  const { connection, sourceAdmin, isApproved } =
    await requireConnectionPage(args);
  const { pages, blogs } = await getContent(sourceAdmin);
  return { connectionId: connection.id, isApproved, pages, blogs };
};

export const action = connectionPageAction;

const PAGE_SCOPE =
  "Title, content, template and published state. Overwrites the target page with the same handle.";
const BLOG_SCOPE =
  "The blog and its articles (up to 250): title, content, summary, tags, author, image, template and published state. Overwrites matching handles on the target.";

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export default function ContentPage() {
  const { connectionId, isApproved, pages, blogs } =
    useLoaderData<typeof loader>();
  const { selected, toggleKeys } = useSelection();

  return (
    <>
      <SyncButton
        selected={selected}
        isApproved={isApproved}
        historyHref={`/app/connections/${connectionId}`}
      />
      <s-section heading="Pages">
        <HandleListSection
          items={pages}
          toKey={pageKey}
          details={PAGE_SCOPE}
          emptyText="No pages found."
          selected={selected}
          onToggle={toggleKeys}
        />
      </s-section>
      <s-section heading="Blogs">
        <HandleListSection
          items={blogs.map((blog) => ({
            ...blog,
            note: plural(blog.articlesCount, "article", "articles"),
          }))}
          toKey={blogKey}
          details={BLOG_SCOPE}
          emptyText="No blogs found."
          selected={selected}
          onToggle={toggleKeys}
        />
      </s-section>
    </>
  );
}
