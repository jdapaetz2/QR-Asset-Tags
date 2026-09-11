import { describe, expect, it, vi } from "vitest";

import { cleanupUploadedMedia } from "@/lib/forms/cleanup";

const ctx = { action: "damage_support", correlationId: "cid", shortCodeHash: "sch", failure: "insert" };

/** The submission-scoped bucket's `remove` (lib/forms/media-verify.ts) — never throws, reports a count. */
function bucketWithRemove(remove: ReturnType<typeof vi.fn>) {
  return { remove } as never;
}

describe("cleanupUploadedMedia", () => {
  it("does nothing (no remove call) for an empty path list", async () => {
    const remove = vi.fn();
    const outcome = await cleanupUploadedMedia(bucketWithRemove(remove), [], ctx);
    expect(outcome).toBe("none");
    expect(remove).not.toHaveBeenCalled();
  });

  it("removes exactly the paths passed and reports 'clean' when all are removed", async () => {
    const paths = ["org/a/asset/b/submission/c/1.jpg", "org/a/asset/b/submission/c/2.jpg"];
    const remove = vi.fn(async (p: string[]) => ({ removed: p.length, failed: false }));
    const outcome = await cleanupUploadedMedia(bucketWithRemove(remove), paths, ctx);
    expect(remove).toHaveBeenCalledWith(paths);
    expect(outcome).toBe("clean");
  });

  it("reports 'partial' when fewer objects are removed than were requested", async () => {
    const remove = vi.fn(async () => ({ removed: 1, failed: false }));
    const outcome = await cleanupUploadedMedia(bucketWithRemove(remove), ["a", "b", "c"], ctx);
    expect(outcome).toBe("partial");
  });

  it("reports 'failed' on a storage error and never throws", async () => {
    const remove = vi.fn(async () => ({ removed: 0, failed: true }));
    const outcome = await cleanupUploadedMedia(bucketWithRemove(remove), ["a"], ctx);
    expect(outcome).toBe("failed");
  });

  it("reports 'failed' when remove throws (best-effort, swallowed)", async () => {
    const remove = vi.fn(async () => {
      throw new Error("network");
    });
    const outcome = await cleanupUploadedMedia(bucketWithRemove(remove), ["a"], ctx);
    expect(outcome).toBe("failed");
  });
});
