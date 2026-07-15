import { describe, expect, it, vi } from "vitest";

import { collectMediaPaths, signMediaPaths, SUBMISSIONS_BUCKET } from "./media";

describe("collectMediaPaths", () => {
  it("flattens string media paths and ignores non-array / non-string entries", () => {
    expect(
      collectMediaPaths([
        { media_urls: ["a/1.jpg", "a/2.jpg"] },
        { media_urls: null },
        { media_urls: "not-an-array" },
        { media_urls: ["b/1.jpg", 42, undefined] },
      ])
    ).toEqual(["a/1.jpg", "a/2.jpg", "b/1.jpg"]);
  });
});

describe("signMediaPaths", () => {
  function fakeClient(sign: (path: string) => string | null) {
    return {
      storage: {
        from: (bucket: string) => ({
          createSignedUrl: async (path: string) => {
            expect(bucket).toBe(SUBMISSIONS_BUCKET);
            const url = sign(path);
            return url ? { data: { signedUrl: url }, error: null } : { data: null, error: new Error("nope") };
          },
        }),
      },
    } as never;
  }

  it("returns a path→url map, de-duplicating paths and signing once each", async () => {
    const createSignedUrl = vi.fn(async (path: string) => ({
      data: { signedUrl: `https://signed/${path}` },
      error: null,
    }));
    const client = {
      storage: { from: () => ({ createSignedUrl }) },
    } as never;

    const map = await signMediaPaths(client, ["x/1.jpg", "x/1.jpg", "x/2.jpg"]);
    expect(map.get("x/1.jpg")).toBe("https://signed/x/1.jpg");
    expect(map.get("x/2.jpg")).toBe("https://signed/x/2.jpg");
    expect(createSignedUrl).toHaveBeenCalledTimes(2); // de-duped
  });

  it("maps a failed signing to null and skips empty/blank paths", async () => {
    const client = fakeClient((p) => (p === "bad" ? null : `https://signed/${p}`));
    const map = await signMediaPaths(client, ["good", "bad", "", "good"]);
    expect(map.get("good")).toBe("https://signed/good");
    expect(map.get("bad")).toBeNull();
    expect(map.has("")).toBe(false);
    expect(map.size).toBe(2);
  });

  it("no paths → empty map, no I/O", async () => {
    const createSignedUrl = vi.fn();
    const client = { storage: { from: () => ({ createSignedUrl }) } } as never;
    const map = await signMediaPaths(client, []);
    expect(map.size).toBe(0);
    expect(createSignedUrl).not.toHaveBeenCalled();
  });
});
