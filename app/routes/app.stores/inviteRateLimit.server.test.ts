import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, describe, expect, it, vi } from "vitest";

const { dbMock, where, rows } = vi.hoisted(() => {
  const where = vi.fn();
  const rows: { value: number }[][] = [];
  return {
    where,
    rows,
    dbMock: {
      select: vi.fn(() => ({
        from: () => ({
          where: (condition: unknown) => {
            where(condition);
            return Promise.resolve(rows.shift());
          },
        }),
      })),
    },
  };
});
vi.mock("~/db.server", () => ({ default: dbMock }));

const { INVITES_PER_HOUR, inviteLimitReached } =
  await import("./inviteRateLimit.server");

afterEach(() => {
  vi.useRealTimers();
});

describe("inviteLimitReached", () => {
  it("counts the source's requests from the last hour against the limit", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-08T12:00:00Z"));
    rows.push([{ value: INVITES_PER_HOUR - 1 }], [{ value: INVITES_PER_HOUR }]);

    expect(await inviteLimitReached("source-id")).toBe(false);
    expect(await inviteLimitReached("source-id")).toBe(true);

    const { sql, params } = new PgDialect().sqlToQuery(where.mock.calls[0][0]);
    expect(sql).toContain('"requestedAt" >=');
    expect(params[0]).toBe("source-id");
    expect(params[1]).toBe("2026-10-08T11:00:00.000Z");
  });
});
