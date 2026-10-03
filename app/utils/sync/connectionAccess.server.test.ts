import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock, unauthenticatedMock } = vi.hoisted(() => ({
  dbMock: { query: { connections: { findFirst: vi.fn() } } },
  unauthenticatedMock: { admin: vi.fn() },
}));
vi.mock("~/db.server", () => ({ default: dbMock }));
vi.mock("~/shopify.server", () => ({ unauthenticated: unauthenticatedMock }));

const { getConnectionAccess, sourceAdminFor } =
  await import("./connectionAccess.server");

function connection(status: string) {
  return {
    id: "conn-1",
    status,
    source: { shop: "source.myshopify.com" },
    target: { shop: "target.myshopify.com" },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getConnectionAccess", () => {
  it("lets the source in whatever the status", async () => {
    dbMock.query.connections.findFirst.mockResolvedValue(connection("PENDING"));

    expect(await getConnectionAccess("conn-1", "source.myshopify.com")).toEqual(
      { connection: connection("PENDING"), role: "source" },
    );
  });

  it("lets the target in once it has approved", async () => {
    dbMock.query.connections.findFirst.mockResolvedValue(
      connection("APPROVED"),
    );

    expect(
      await getConnectionAccess("conn-1", "target.myshopify.com"),
    ).toMatchObject({ role: "target" });
  });

  it("keeps the target out before it approves", async () => {
    dbMock.query.connections.findFirst.mockResolvedValue(connection("PENDING"));

    expect(
      await getConnectionAccess("conn-1", "target.myshopify.com"),
    ).toBeNull();
  });

  it("denies any other shop", async () => {
    dbMock.query.connections.findFirst.mockResolvedValue(
      connection("APPROVED"),
    );

    expect(
      await getConnectionAccess("conn-1", "stranger.myshopify.com"),
    ).toBeNull();
  });

  it("returns null when the connection doesn't exist", async () => {
    dbMock.query.connections.findFirst.mockResolvedValue(undefined);

    expect(
      await getConnectionAccess("missing", "source.myshopify.com"),
    ).toBeNull();
  });
});

describe("sourceAdminFor", () => {
  const sessionAdmin = { graphql: vi.fn() } as never;

  it("uses the caller's own admin when the caller is the source", async () => {
    const admin = await sourceAdminFor(
      { connection: connection("APPROVED"), role: "source" } as never,
      sessionAdmin,
    );

    expect(admin).toBe(sessionAdmin);
    expect(unauthenticatedMock.admin).not.toHaveBeenCalled();
  });

  it("loads the source's stored session when the target is the caller", async () => {
    const sourceAdmin = { graphql: vi.fn() };
    unauthenticatedMock.admin.mockResolvedValue({ admin: sourceAdmin });

    const admin = await sourceAdminFor(
      { connection: connection("APPROVED"), role: "target" } as never,
      sessionAdmin,
    );

    expect(unauthenticatedMock.admin).toHaveBeenCalledWith(
      "source.myshopify.com",
    );
    expect(admin).toBe(sourceAdmin);
  });
});
