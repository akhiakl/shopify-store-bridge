import { describe, expect, it, vi } from "vitest";

import { getContent, planContent } from "./content.server";

function admin(data: Record<string, unknown>, errors?: { message: string }[]) {
  return {
    graphql: vi.fn((query: string) => {
      const name = query.match(/query (\w+)/)?.[1] ?? "";
      return Promise.resolve({
        json: () => Promise.resolve({ data: data[name], errors }),
      });
    }),
  };
}

const article = {
  handle: "hello",
  title: "Hello",
  body: "<p>Hi</p>",
  summary: null,
  tags: ["news"],
  isPublished: true,
  templateSuffix: null,
  author: { name: "Ana" },
  image: null,
};

describe("getContent", () => {
  it("lists pages and blogs with their article counts", async () => {
    const source = admin({
      ContentList: {
        pages: { nodes: [{ handle: "about", title: "About" }] },
        blogs: {
          nodes: [
            { handle: "news", title: "News", articlesCount: { count: 3 } },
            { handle: "empty", title: "Empty" },
          ],
        },
      },
    });

    expect(await getContent(source as never)).toEqual({
      pages: [{ handle: "about", title: "About" }],
      blogs: [
        { handle: "news", title: "News", articlesCount: 3 },
        { handle: "empty", title: "Empty", articlesCount: 0 },
      ],
    });
  });

  it("returns nothing when the store has no content", async () => {
    expect(await getContent(admin({ ContentList: {} }) as never)).toEqual({
      pages: [],
      blogs: [],
    });
  });

  it("throws a top-level GraphQL error instead of listing nothing", async () => {
    const source = admin({}, [{ message: "Access denied" }]);
    await expect(getContent(source as never)).rejects.toThrow("Access denied");
  });
});

describe("planContent", () => {
  it("reads only the selected pages and blogs, articles flattened", async () => {
    const page = {
      handle: "about",
      title: "About",
      body: "<p>Us</p>",
      isPublished: true,
      templateSuffix: null,
    };
    const blog = {
      handle: "news",
      title: "News",
      commentPolicy: "MODERATED",
      templateSuffix: null,
    };
    const source = admin({
      PagesPlan: {
        pages: { nodes: [page, { ...page, handle: "contact" }] },
      },
      BlogsPlan: {
        blogs: {
          nodes: [
            { ...blog, articles: { nodes: [article] } },
            { ...blog, handle: "other", articles: { nodes: [] } },
          ],
        },
      },
    });

    expect(
      await planContent(source as never, {
        pageHandles: ["about", "gone"],
        blogHandles: ["news"],
      }),
    ).toEqual({ pages: [page], blogs: [{ ...blog, articles: [article] }] });
  });

  it("skips the queries when nothing of a kind is selected", async () => {
    const source = admin({});
    expect(
      await planContent(source as never, { pageHandles: [], blogHandles: [] }),
    ).toEqual({ pages: [], blogs: [] });
    expect(source.graphql).not.toHaveBeenCalled();
  });
});
