import { describe, expect, it, vi } from "vitest";

import type { PlannedArticle, PlannedBlog } from "./content.server";
import { blogStep, pageStep } from "./syncContent.server";

type Responder = (query: string, variables?: unknown) => unknown;

/** A target admin answering each operation (by name) from `responses`. */
function target(responses: Record<string, Responder | unknown>) {
  const graphql = vi.fn((query: string, opts?: { variables?: unknown }) => {
    const name = query.match(/(?:query|mutation) (\w+)/)?.[1] ?? "";
    const r = responses[name];
    const body = typeof r === "function" ? r(query, opts?.variables) : r;
    return Promise.resolve({ json: () => Promise.resolve(body) });
  });
  return { graphql };
}

const ok = (field: string, node: string) => ({
  data: { [field]: { [node]: { id: "gid://new" }, userErrors: [] } },
});
const ctx = (admin: unknown) => ({ targetAdmin: admin }) as never;

const page = {
  handle: "about",
  title: "About",
  body: "<p>Us</p>",
  isPublished: true,
  templateSuffix: null,
};

describe("pageStep", () => {
  it("creates the page when no target page has its handle", async () => {
    const admin = target({
      TargetPage: {
        data: { pages: { nodes: [{ id: "x", handle: "about-2" }] } },
      },
      PageCreate: ok("pageCreate", "page"),
    });

    expect(await pageStep(page)(ctx(admin))).toEqual([
      {
        key: "page:about",
        kind: "VALUE",
        status: "SUCCEEDED",
        errorMessage: null,
      },
    ]);
    expect(admin.graphql).toHaveBeenLastCalledWith(
      expect.stringContaining("pageCreate"),
      { variables: { page } },
    );
  });

  it("overwrites the target page with the same handle", async () => {
    const admin = target({
      TargetPage: {
        data: { pages: { nodes: [{ id: "gid://p/1", handle: "about" }] } },
      },
      PageUpdate: ok("pageUpdate", "page"),
    });

    await pageStep(page)(ctx(admin));

    expect(admin.graphql).toHaveBeenNthCalledWith(1, expect.any(String), {
      variables: { query: 'handle:"about"' },
    });
    expect(admin.graphql).toHaveBeenLastCalledWith(
      expect.stringContaining("pageUpdate"),
      { variables: { id: "gid://p/1", page } },
    );
  });

  it("fails the item when the lookup errors", async () => {
    const admin = target({
      TargetPage: { errors: [{ message: "Throttled" }] },
    });

    expect(await pageStep(page)(ctx(admin))).toEqual([
      {
        key: "page:about",
        kind: "VALUE",
        status: "FAILED",
        errorMessage: "Throttled",
      },
    ]);
  });
});

const article: PlannedArticle = {
  handle: "hello",
  title: "Hello",
  body: "<p>Hi</p>",
  summary: null,
  tags: [],
  isPublished: true,
  templateSuffix: null,
  author: null,
  image: { url: "https://cdn/x.png", altText: "X" },
};
const blog: PlannedBlog = {
  handle: "news",
  title: "News",
  commentPolicy: "MODERATED",
  templateSuffix: null,
  articles: [
    article,
    { ...article, handle: "second", image: null, author: { name: "Ana" } },
  ],
};
const blogInput = {
  handle: "news",
  title: "News",
  commentPolicy: "MODERATED",
  templateSuffix: null,
};

describe("blogStep", () => {
  it("creates a missing blog, then its articles in it", async () => {
    const admin = target({
      TargetBlog: { data: { blogs: { nodes: [] } } },
      BlogCreate: {
        data: { blogCreate: { blog: { id: "gid://b/9" }, userErrors: [] } },
      },
      ArticleCreate: ok("articleCreate", "article"),
    });

    const items = await blogStep(blog)(ctx(admin));

    expect(items.map((i) => [i.key, i.status])).toEqual([
      ["blog:news", "SUCCEEDED"],
      ["article:news:hello", "SUCCEEDED"],
      ["article:news:second", "SUCCEEDED"],
    ]);
    expect(admin.graphql).toHaveBeenCalledWith(
      expect.stringContaining("articleCreate"),
      {
        variables: {
          article: {
            ...article,
            author: { name: "Staff" },
            image: { url: "https://cdn/x.png", altText: "X" },
            blogId: "gid://b/9",
          },
        },
      },
    );
  });

  it("updates the blog and its existing articles, creating new ones", async () => {
    const admin = target({
      TargetBlog: {
        data: {
          blogs: {
            nodes: [
              {
                id: "gid://b/1",
                handle: "news",
                articles: { nodes: [{ id: "gid://a/1", handle: "hello" }] },
              },
            ],
          },
        },
      },
      BlogUpdate: ok("blogUpdate", "blog"),
      ArticleUpdate: ok("articleUpdate", "article"),
      ArticleCreate: ok("articleCreate", "article"),
    });

    await blogStep(blog)(ctx(admin));

    const calls = admin.graphql.mock.calls.map(([q, o]) => [
      q.match(/mutation (\w+)/)?.[1],
      o?.variables,
    ]);
    expect(calls[1]).toEqual([
      "BlogUpdate",
      { id: "gid://b/1", blog: blogInput },
    ]);
    expect(calls[2]?.[0]).toBe("ArticleUpdate");
    expect(calls[2]?.[1]).toMatchObject({ id: "gid://a/1" });
    expect(calls[3]?.[0]).toBe("ArticleCreate");
  });

  it("fails every article when the blog can't be created", async () => {
    const admin = target({
      TargetBlog: { data: { blogs: { nodes: [] } } },
      BlogCreate: {
        data: {
          blogCreate: {
            blog: null,
            userErrors: [{ message: "Title is taken" }],
          },
        },
      },
    });

    const items = await blogStep(blog)(ctx(admin));

    expect(items.map((i) => [i.status, i.errorMessage])).toEqual([
      ["FAILED", "Title is taken"],
      ["FAILED", "Blog not synced."],
      ["FAILED", "Blog not synced."],
    ]);
  });

  it("reports a top-level error from blogCreate", async () => {
    const admin = target({
      TargetBlog: { data: { blogs: { nodes: [] } } },
      BlogCreate: { errors: [{ message: "Access denied" }] },
    });

    const [item] = await blogStep({ ...blog, articles: [] })(ctx(admin));
    expect(item.errorMessage).toBe("Access denied");
  });

  it("reports a missing blogCreate payload", async () => {
    const admin = target({
      TargetBlog: { data: { blogs: { nodes: [] } } },
      BlogCreate: { data: {} },
    });

    const [item] = await blogStep({ ...blog, articles: [] })(ctx(admin));
    expect(item.errorMessage).toMatch(/unexpected response/);
  });

  it("falls back to a generic message when blogCreate returns no blog", async () => {
    const admin = target({
      TargetBlog: { data: { blogs: { nodes: [] } } },
      BlogCreate: { data: { blogCreate: { blog: null, userErrors: [] } } },
    });

    const [item] = await blogStep({ ...blog, articles: [] })(ctx(admin));
    expect(item.errorMessage).toBe("Blog not created.");
  });

  it("fails the blog when its lookup errors", async () => {
    const admin = target({
      TargetBlog: { errors: [{ message: "Throttled" }] },
    });

    expect(await blogStep(blog)(ctx(admin))).toEqual([
      {
        key: "blog:news",
        kind: "VALUE",
        status: "FAILED",
        errorMessage: "Throttled",
      },
    ]);
  });
});
