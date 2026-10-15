import { render, screen, waitFor } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, it, vi } from "vitest";

const { requireConnectionPage, connectionPageAction } = vi.hoisted(() => ({
  requireConnectionPage: vi.fn(),
  connectionPageAction: vi.fn(),
}));
vi.mock("~/utils/sync/connectionRoute.server", () => ({
  requireConnectionPage,
  connectionPageAction,
}));

const { getContent } = vi.hoisted(() => ({ getContent: vi.fn() }));
vi.mock("~/utils/sync/content.server", () => ({ getContent }));

const { loader, action, default: Page } = await import("./route");

describe("content loader", () => {
  it("reads pages and blogs from the source admin", async () => {
    const sourceAdmin = { graphql: vi.fn() };
    requireConnectionPage.mockResolvedValue({
      connection: { id: "conn-1" },
      sourceAdmin,
      isApproved: true,
    });
    getContent.mockResolvedValue({ pages: [], blogs: [] });

    expect(await loader({} as never)).toEqual({
      connectionId: "conn-1",
      isApproved: true,
      pages: [],
      blogs: [],
    });
    expect(getContent).toHaveBeenCalledWith(sourceAdmin);
    expect(action).toBe(connectionPageAction);
  });
});

function renderAt(
  blogs: { handle: string; title: string; articlesCount: number }[],
) {
  const Stub = createRoutesStub([
    {
      path: "/app/connections/:connectionId/content",
      Component: Page,
      loader: () => ({
        connectionId: "conn-1",
        isApproved: true,
        pages: [{ handle: "about", title: "About" }],
        blogs,
      }),
    },
  ]);
  return render(<Stub initialEntries={["/app/connections/conn-1/content"]} />);
}

describe("content page", () => {
  it("renders pages and blogs, with each blog's article count", async () => {
    renderAt([
      { handle: "news", title: "News", articlesCount: 2 },
      { handle: "tips", title: "Tips", articlesCount: 1 },
    ]);

    await waitFor(() =>
      expect(
        document.querySelector('s-section[heading="Blogs"]'),
      ).not.toBeNull(),
    );
    expect(document.querySelector('s-section[heading="Pages"]')).not.toBeNull();
    expect(
      document.querySelector('s-checkbox[label="About (about)"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('s-checkbox[label="News (news, 2 articles)"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('s-checkbox[label="Tips (tips, 1 article)"]'),
    ).not.toBeNull();
    expect(screen.getByText("Sync now")).toBeInTheDocument();
  });
});
