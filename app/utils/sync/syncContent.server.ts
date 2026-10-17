import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import type {
  PlannedArticle,
  PlannedBlog,
  PlannedPage,
} from "./content.server";
import { articleKey, blogKey, pageKey } from "./definitionKey";
import {
  createOne,
  readTopLevelErrors,
  type CreateResult,
} from "./runMutation.server";
import type { SyncItemResult, SyncStep } from "./syncTarget.server";

/** Each lookup narrows by `handle:` and then matches exactly, so an
 * unsupported filter still finds the record among the first 250. */
const TARGET_PAGE_QUERY = `#graphql
  query TargetPage($query: String!) {
    pages(first: 250, query: $query) { nodes { id handle } }
  }
`;

const TARGET_BLOG_QUERY = `#graphql
  query TargetBlog($query: String!) {
    blogs(first: 250, query: $query) {
      nodes { id handle articles(first: 250) { nodes { id handle } } }
    }
  }
`;

const PAGE_CREATE = `#graphql
  mutation PageCreate($page: PageCreateInput!) {
    pageCreate(page: $page) { page { id } userErrors { field message code } }
  }
`;
const PAGE_UPDATE = `#graphql
  mutation PageUpdate($id: ID!, $page: PageUpdateInput!) {
    pageUpdate(id: $id, page: $page) { page { id } userErrors { field message code } }
  }
`;
const BLOG_CREATE = `#graphql
  mutation BlogCreate($blog: BlogCreateInput!) {
    blogCreate(blog: $blog) { blog { id } userErrors { field message code } }
  }
`;
const BLOG_UPDATE = `#graphql
  mutation BlogUpdate($id: ID!, $blog: BlogUpdateInput!) {
    blogUpdate(id: $id, blog: $blog) { blog { id } userErrors { field message code } }
  }
`;
const ARTICLE_CREATE = `#graphql
  mutation ArticleCreate($article: ArticleCreateInput!) {
    articleCreate(article: $article) { article { id } userErrors { field message code } }
  }
`;
const ARTICLE_UPDATE = `#graphql
  mutation ArticleUpdate($id: ID!, $article: ArticleUpdateInput!) {
    articleUpdate(id: $id, article: $article) { article { id } userErrors { field message code } }
  }
`;

type Lookup<T> = { ok: true; found?: T } | { ok: false; error: string };

async function findByHandle<T extends { handle: string }>(
  admin: AdminApiContext,
  { gql, root, handle }: { gql: string; root: string; handle: string },
): Promise<Lookup<T>> {
  const response = await admin.graphql(gql, {
    variables: { query: `handle:${JSON.stringify(handle)}` },
  });
  const body = (await response.json()) as {
    data?: Record<string, { nodes: T[] } | undefined>;
  };
  const error = readTopLevelErrors(body);
  if (error) return { ok: false, error };
  const found = body.data?.[root]?.nodes.find((n) => n.handle === handle);
  return { ok: true, found };
}

function contentItem(key: string, result: CreateResult): SyncItemResult {
  return result.ok
    ? { key, kind: "VALUE", status: "SUCCEEDED", errorMessage: null }
    : { key, kind: "VALUE", status: "FAILED", errorMessage: result.error };
}

/** Upserts a page by handle, overwriting the target's title, body,
 * template and published state. */
export function pageStep(page: PlannedPage): SyncStep {
  return async ({ targetAdmin }) => {
    const target = await findByHandle<{ id: string; handle: string }>(
      targetAdmin,
      { gql: TARGET_PAGE_QUERY, root: "pages", handle: page.handle },
    );
    if (!target.ok) return [contentItem(pageKey(page.handle), target)];
    const result = target.found
      ? await createOne(targetAdmin, PAGE_UPDATE, {
          id: target.found.id,
          page,
        })
      : await createOne(targetAdmin, PAGE_CREATE, { page });
    return [contentItem(pageKey(page.handle), result)];
  };
}

function articleInput(article: PlannedArticle) {
  const { author, image, ...rest } = article;
  return {
    ...rest,
    // An article needs an author; the source's name, or the store's.
    author: { name: author?.name || "Staff" },
    image: image ? { url: image.url, altText: image.altText } : undefined,
  };
}

type TargetBlog = {
  id: string;
  handle: string;
  articles: { nodes: { id: string; handle: string }[] };
};

/** Upserts the blog by handle, then each of its articles by handle within
 * it. One step, since the articles need the target blog's id; each
 * article still gets its own job-history row. */
export function blogStep(blog: PlannedBlog): SyncStep {
  return async ({ targetAdmin }) => {
    const { articles, ...shell } = blog;
    const lookup = await findByHandle<TargetBlog>(targetAdmin, {
      gql: TARGET_BLOG_QUERY,
      root: "blogs",
      handle: blog.handle,
    });
    if (!lookup.ok) return [contentItem(blogKey(blog.handle), lookup)];
    const blogInput = {
      handle: shell.handle,
      title: shell.title,
      commentPolicy: shell.commentPolicy,
      templateSuffix: shell.templateSuffix,
    };
    let blogId = lookup.found?.id;
    let result: CreateResult;
    if (blogId) {
      result = await createOne(targetAdmin, BLOG_UPDATE, {
        id: blogId,
        blog: blogInput,
      });
    } else {
      const created = await createBlog(targetAdmin, blogInput);
      blogId = created.id;
      result = created.result;
    }
    const items = [contentItem(blogKey(blog.handle), result)];
    const existing = new Map(
      (lookup.found?.articles.nodes ?? []).map((a) => [a.handle, a.id]),
    );
    for (const article of articles) {
      const key = articleKey(blog.handle, article.handle);
      if (!blogId) {
        items.push(contentItem(key, { ok: false, error: "Blog not synced." }));
        continue;
      }
      const id = existing.get(article.handle);
      const input = { ...articleInput(article), blogId };
      items.push(
        contentItem(
          key,
          id
            ? await createOne(targetAdmin, ARTICLE_UPDATE, {
                id,
                article: input,
              })
            : await createOne(targetAdmin, ARTICLE_CREATE, { article: input }),
        ),
      );
    }
    return items;
  };
}

/** blogCreate, keeping the new blog's id for its articles. */
async function createBlog(
  admin: AdminApiContext,
  blog: Record<string, unknown>,
): Promise<{ id?: string; result: CreateResult }> {
  const response = await admin.graphql(BLOG_CREATE, { variables: { blog } });
  const body = (await response.json()) as {
    data?: {
      blogCreate?: {
        blog: { id: string } | null;
        userErrors: { message: string }[];
      };
    };
  };
  const error = readTopLevelErrors(body);
  if (error) return { result: { ok: false, error } };
  const payload = body.data?.blogCreate;
  if (!payload) {
    return {
      result: { ok: false, error: "Shopify returned an unexpected response." },
    };
  }
  if (payload.userErrors.length || !payload.blog) {
    const message = payload.userErrors.map((e) => e.message).join("; ");
    return { result: { ok: false, error: message || "Blog not created." } };
  }
  return { id: payload.blog.id, result: { ok: true } };
}
