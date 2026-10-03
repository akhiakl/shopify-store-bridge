import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StylingFileRef } from "./checkoutBrandingInput";
import { ensureTargetFile } from "./stylingFiles.server";

const ref: StylingFileRef = {
  path: ["components", "favicon", "mediaImageId"],
  kind: "IMAGE",
  url: "https://cdn.shopify.com/files/logo.png?v=3",
};

type Reply = { data?: unknown; errors?: { message: string }[] };

/** Answers each operation (matched by name) from its queue of replies. */
function target(replies: Record<string, Reply[]>) {
  return {
    graphql: vi.fn((query: string) => {
      const name = Object.keys(replies).find((key) => query.includes(key));
      const reply = (name && replies[name].shift()) || { data: {} };
      return Promise.resolve({ json: () => Promise.resolve(reply) });
    }),
  };
}

const ready = (id: string): Reply => ({
  data: { node: { id, fileStatus: "READY" } },
});

describe("ensureTargetFile", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("reuses a file with the same name and caches it", async () => {
    const admin = target({
      StylingFileByName: [
        {
          data: {
            files: { nodes: [{ id: "gid://M/1", fileStatus: "READY" }] },
          },
        },
      ],
      StylingFileStatus: [ready("gid://M/1")],
    });
    const cache = new Map<string, string>();

    expect(await ensureTargetFile(admin as never, ref, cache)).toBe(
      "gid://M/1",
    );
    expect(admin.graphql).toHaveBeenCalledWith(
      expect.stringContaining("StylingFileByName"),
      { variables: { query: 'filename:"logo.png"' } },
    );
    expect(await ensureTargetFile(admin as never, ref, cache)).toBe(
      "gid://M/1",
    );
    expect(admin.graphql).toHaveBeenCalledTimes(2);
  });

  it("creates a missing file from the source URL and waits for it", async () => {
    const admin = target({
      StylingFileByName: [{ data: { files: { nodes: [] } } }],
      StylingFileCreate: [
        {
          data: {
            fileCreate: { files: [{ id: "gid://G/2" }], userErrors: [] },
          },
        },
      ],
      StylingFileStatus: [
        { data: { node: { id: "gid://G/2", fileStatus: "PROCESSING" } } },
        ready("gid://G/2"),
      ],
    });

    const result = ensureTargetFile(
      admin as never,
      { ...ref, kind: "FONT" },
      new Map(),
    );
    await vi.advanceTimersByTimeAsync(1000);

    expect(await result).toBe("gid://G/2");
    expect(admin.graphql).toHaveBeenCalledWith(
      expect.stringContaining("fileCreate"),
      {
        variables: {
          files: [
            {
              originalSource: ref.url,
              filename: "logo.png",
              contentType: "FILE",
            },
          ],
        },
      },
    );
  });

  it("fails on create errors, failed processing and query errors", async () => {
    const createError = target({
      StylingFileByName: [{ data: { files: { nodes: [] } } }],
      StylingFileCreate: [
        {
          data: {
            fileCreate: { files: null, userErrors: [{ message: "Bad URL" }] },
          },
        },
      ],
    });
    await expect(
      ensureTargetFile(createError as never, ref, new Map()),
    ).rejects.toThrow("Bad URL");

    const noFiles = target({
      StylingFileByName: [{ data: { files: { nodes: [] } } }],
      StylingFileCreate: [
        { data: { fileCreate: { files: [], userErrors: [] } } },
      ],
    });
    await expect(
      ensureTargetFile(noFiles as never, ref, new Map()),
    ).rejects.toThrow("Couldn't copy a file to this store.");

    const failed = target({
      StylingFileByName: [
        {
          data: {
            files: { nodes: [{ id: "gid://M/1", fileStatus: "FAILED" }] },
          },
        },
      ],
      StylingFileStatus: [
        { data: { node: { id: "gid://M/1", fileStatus: "FAILED" } } },
      ],
    });
    await expect(
      ensureTargetFile(failed as never, ref, new Map()),
    ).rejects.toThrow("didn't finish processing");

    const errored = target({
      StylingFileByName: [{ errors: [{ message: "Access denied" }] }],
    });
    await expect(
      ensureTargetFile(errored as never, ref, new Map()),
    ).rejects.toThrow("Access denied");
  });

  it("gives up when a file never becomes ready", async () => {
    const admin = target({
      StylingFileByName: [
        {
          data: {
            files: { nodes: [{ id: "gid://M/1", fileStatus: "UPLOADED" }] },
          },
        },
      ],
      StylingFileStatus: Array.from({ length: 10 }, () => ({
        data: { node: null },
      })),
    });

    const result = ensureTargetFile(admin as never, ref, new Map());
    const assertion = expect(result).rejects.toThrow(
      "didn't finish processing",
    );
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
  });
});
