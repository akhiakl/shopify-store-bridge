import { describe, expect, it, vi } from "vitest";

const { webhookMock, triggerAutoSync, driveSyncJob, waitUntil } = vi.hoisted(
  () => ({
    webhookMock: vi.fn(),
    triggerAutoSync: vi.fn(),
    driveSyncJob: vi.fn(),
    waitUntil: vi.fn(),
  }),
);
vi.mock("~/shopify.server", () => ({
  authenticate: { webhook: webhookMock },
}));
vi.mock("~/utils/sync/autoSync.server", () => ({ triggerAutoSync }));
vi.mock("~/utils/sync/syncQueue.server", () => ({ driveSyncJob }));
vi.mock("@vercel/functions", () => ({ waitUntil }));

const { action } = await import("./webhooks.source-changed");

describe("webhooks.source-changed action", () => {
  it("starts the shop's auto-sync jobs in the background and acknowledges", async () => {
    webhookMock.mockResolvedValue({
      topic: "COLLECTIONS_UPDATE",
      shop: "source.myshopify.com",
    });
    triggerAutoSync.mockResolvedValue(["job-1", "job-2"]);

    const response = await action({
      request: new Request("https://example.com/webhooks/source-changed"),
    } as never);

    expect(response.status).toBe(200);
    expect(triggerAutoSync).toHaveBeenCalledWith("source.myshopify.com");
    expect(driveSyncJob).toHaveBeenCalledWith("job-1");
    expect(driveSyncJob).toHaveBeenCalledWith("job-2");
    expect(waitUntil).toHaveBeenCalledTimes(2);
  });
});
