import { describe, expect, it, vi } from "vitest";

import { cleanupUploadedMedia } from "@/lib/forms/cleanup";

const ctx = { action: "damage_support", correlationId: "cid", shortCodeHash: "sch", failure: "insert" };

function clientWithRemove(remove: ReturnType<typeof vi.fn>) {
  return { storage: { from: () => ({ remove }) } } as never;
}

describe("cleanupUploadedMedia", () => {
  it("does nothing (no remove call) for an empty path list", async () => {
    const remove = vi.fn();
    const outcome = await cleanupUploadedMedia(clientWithRemove(remove), [], ctx);
    expect(outcome).toBe("none");
    expect(remove).not.toHaveBeenCalled();
  });

  it("removes exactly the paths passed and reports 'clean' when all are removed", async () => {
    const paths = ["org/a/asset/b/submission/c/1.jpg", "org/a/asset/b/submission/c/2.jpg"];
    const remove = vi.fn(async (p: string[]) => ({ data: p.map((name) => ({ name })), error: null }));
    const outcome = await cleanupUploadedMedia(clientWithRemove(remove), paths, ctx);
    expect(remove).toHaveBeenCalledWith(paths);
    expect(outcome).toBe("clean");
  });

  it("reports 'partial' when fewer objects come back than were requested", async () => {
    const paths = ["a", "b", "c"];
    const remove = vi.fn(async () => ({ data: [{ name: "a" }], error: null }));
    const outcome = await cleanupUploadedMedia(clientWithRemove(remove), paths, ctx);
    expect(outcome).toBe("partial");
  });

  it("reports 'failed' on a storage error and never throws", async () => {
    const remove = vi.fn(async () => ({ data: null, error: { message: "boom" } }));
    const outcome = await cleanupUploadedMedia(clientWithRemove(remove), ["a"], ctx);
    expect(outcome).toBe("failed");
  });

  it("reports 'failed' when remove throws (best-effort, swallowed)", async () => {
    const remove = vi.fn(async () => {
      throw new Error("network");
    });
    const outcome = await cleanupUploadedMedia(clientWithRemove(remove), ["a"], ctx);
    expect(outcome).toBe("failed");
  });
});
