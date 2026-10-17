import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import { readTopLevelErrors } from "./runMutation.server";

/** Scope read_content (covered by write_content, see shopify.app.toml).
 * Lists only what the picker shows; bodies are read when a job is
 * planned. Capped at 250 pages, 250 blogs and 250 articles per blog. */
const CONTENT_LIST_QUERY = `#graphql
  query ContentList {
    pages(first: 250) { nodes { handle title } }
    blogs(first: 250) {
      nodes { handle title articlesCount { count } }
    }
  }
`;

const PAGES_PLAN_QUERY = `#graphql
  query PagesPlan {
    pages(first: 250) {
      nodes { handle title body isPublished templateSuffix }
    }
  }
`;

const BLOGS_PLAN_QUERY = `#graphql
  query BlogsPlan {
    blogs(first: 250) {
      nodes {
        handle
        title
        commentPolicy
        templateSuffix
        articles(first: 250) {
          nodes {
            handle
            title
            body
            summary
            tags
            isPublished
            templateSuffix
            author { name }
            image { url altText }
          }
        }
      }
    }
  }
`;

export interface PageRow {
  handle: string;
  title: string;
}

export interface BlogRow {
  handle: string;
  title: string;
  articlesCount: number;
}

export interface PlannedPage {
  handle: string;
  title: string;
  body: string;
  isPublished: boolean;
  templateSuffix: string | null;
}

export interface PlannedArticle {
  handle: string;
  title: string;
  body: string;
  summary: string | null;
  tags: string[];
  isPublished: boolean;
  templateSuffix: string | null;
  author: { name: string } | null;
  image: { url: string; altText: string | null } | null;
}

export interface PlannedBlog {
  handle: string;
  title: string;
  commentPolicy: string;
  templateSuffix: string | null;
  articles: PlannedArticle[];
}

async function query<T>(admin: AdminApiContext, gql: string): Promise<T> {
  const response = await admin.graphql(gql);
  const body = (await response.json()) as { data?: T };
  const error = readTopLevelErrors(body);
  if (error) throw new Error(error);
  return body.data as T;
}

export async function getContent(
  admin: AdminApiContext,
): Promise<{ pages: PageRow[]; blogs: BlogRow[] }> {
  const data = await query<{
    pages?: { nodes: PageRow[] };
    blogs?: {
      nodes: {
        handle: string;
        title: string;
        articlesCount?: { count: number };
      }[];
    };
  }>(admin, CONTENT_LIST_QUERY);
  return {
    pages: data?.pages?.nodes ?? [],
    blogs: (data?.blogs?.nodes ?? []).map((blog) => ({
      handle: blog.handle,
      title: blog.title,
      articlesCount: blog.articlesCount?.count ?? 0,
    })),
  };
}

/** The selected pages and blogs, bodies and articles included, read once
 * when the job is planned. A handle gone from the source is dropped. */
export async function planContent(
  admin: AdminApiContext,
  selection: { pageHandles: string[]; blogHandles: string[] },
): Promise<{ pages: PlannedPage[]; blogs: PlannedBlog[] }> {
  const [pages, blogs] = await Promise.all([
    selection.pageHandles.length
      ? query<{ pages?: { nodes: PlannedPage[] } }>(admin, PAGES_PLAN_QUERY)
      : undefined,
    selection.blogHandles.length
      ? query<{
          blogs?: {
            nodes: (Omit<PlannedBlog, "articles"> & {
              articles: { nodes: PlannedArticle[] };
            })[];
          };
        }>(admin, BLOGS_PLAN_QUERY)
      : undefined,
  ]);
  return {
    pages: (pages?.pages?.nodes ?? []).filter((page) =>
      selection.pageHandles.includes(page.handle),
    ),
    blogs: (blogs?.blogs?.nodes ?? [])
      .filter((blog) => selection.blogHandles.includes(blog.handle))
      .map(({ articles, ...blog }) => ({ ...blog, articles: articles.nodes })),
  };
}
