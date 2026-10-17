import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock, deleteWhere } = vi.hoisted(() => {
  const deleteWhere = vi.fn(() => Promise.resolve());
  return {
    deleteWhere,
    dbMock: {
      query: { connections: { findFirst: vi.fn() } },
      delete: vi.fn(() => ({ where: deleteWhere })),
    },
  };
});
vi.mock("~/db.server", () => ({ default: dbMock }));

const { removeConnection } = await import("./removeConnection.server");
const { connections } = await import("~/db/schema.server");

const SOURCE = "source.myshopify.com";
const TARGET = "target.myshopify.com";

function stored(status: "PENDING" | "APPROVED" | "DECLINED") {
  return {
    id: "conn-1",
    status,
    source: { shop: SOURCE },
    target: { shop: TARGET },
  };
}

beforeEach(() => vi.clearAllMocks());

describe("removeConnection", () => {
  it.each(["PENDING", "APPROVED", "DECLINED"] as const)(
    "lets the source remove a %s connection",
    async (status) => {
      dbMock.query.connections.findFirst.mockResolvedValue(stored(status));

      const result = await removeConnection({
        connectionId: "conn-1",
        shop: SOURCE,
      });

      expect(result).toEqual({ ok: true });
      expect(dbMock.delete).toHaveBeenCalledWith(connections);
      expect(deleteWhere).toHaveBeenCalledWith(eq(connections.id, "conn-1"));
    },
  );

  it("lets the target disconnect, but not remove a pending request", async () => {
    dbMock.query.connections.findFirst.mockResolvedValue(stored("APPROVED"));
    expect(
      await removeConnection({ connectionId: "conn-1", shop: TARGET }),
    ).toEqual({ ok: true });

    dbMock.query.connections.findFirst.mockResolvedValue(stored("PENDING"));
    expect(
      await removeConnection({ connectionId: "conn-1", shop: TARGET }),
    ).toEqual({ ok: false, error: "Decline the request instead." });
    expect(dbMock.delete).toHaveBeenCalledTimes(1);
  });

  it("refuses a missing connection, or one the shop isn't part of", async () => {
    dbMock.query.connections.findFirst.mockResolvedValue(undefined);
    expect(
      await removeConnection({ connectionId: "gone", shop: SOURCE }),
    ).toEqual({ ok: false, error: "Connection not found." });

    dbMock.query.connections.findFirst.mockResolvedValue(stored("APPROVED"));
    expect(
      await removeConnection({
        connectionId: "conn-1",
        shop: "other.myshopify.com",
      }),
    ).toEqual({ ok: false, error: "Connection not found." });
    expect(dbMock.delete).not.toHaveBeenCalled();
  });
});
