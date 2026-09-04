import { afterEach, describe, expect, it, vi } from "vitest";

import { signPaths } from "@/lib/storage/signed-urls";

afterEach(() => vi.restoreAllMocks());

type Entry = { error: string | null; path: string | null; signedUrl: string | null };

/** A Supabase-shaped stub exposing both signing methods, so tests can assert which one is used. */
function stubClient(result: { data: Entry[] | null; error: unknown }) {
  const createSignedUrls = vi.fn(async () => result);
  const createSignedUrl = vi.fn(async () => ({ data: { signedUrl: "single" }, error: null }));
  return {
    client: { storage: { from: () => ({ createSignedUrls, createSignedUrl }) } } as never,
    createSignedUrls,
    createSignedUrl,
  };
}

const ok = (path: string): Entry => ({ error: null, path, signedUrl: `https://signed/${path}` });

describe("batching", () => {
  it("makes NO request when there are no paths", async () => {
    const { client, createSignedUrls } = stubClient({ data: [], error: null });
    const map = await signPaths(client, "submissions", [], 3600, "test");
    expect(createSignedUrls).not.toHaveBeenCalled();
    expect(map.size).toBe(0);
  });

  /** The whole point of C4: N objects, ONE Storage round trip. */
  it("signs many paths in exactly one call, and never the per-path method", async () => {
    const paths = ["a.jpg", "b.jpg", "c.jpg", "d.jpg"];
    const { client, createSignedUrls, createSignedUrl } = stubClient({
      data: paths.map(ok),
      error: null,
    });
    const map = await signPaths(client, "submissions", paths, 3600, "test");
    expect(createSignedUrls).toHaveBeenCalledTimes(1);
    expect(createSignedUrl).not.toHaveBeenCalled();
    expect(map.size).toBe(4);
    expect(map.get("c.jpg")).toBe("https://signed/c.jpg");
  });

  it("handles a single path", async () => {
    const { client, createSignedUrls } = stubClient({ data: [ok("only.jpg")], error: null });
    const map = await signPaths(client, "submissions", ["only.jpg"], 3600, "test");
    expect(createSignedUrls).toHaveBeenCalledTimes(1);
    expect(map.get("only.jpg")).toBe("https://signed/only.jpg");
  });

  it("de-duplicates and trims before requesting", async () => {
    const { client, createSignedUrls } = stubClient({ data: [ok("a.jpg")], error: null });
    await signPaths(client, "submissions", ["a.jpg", " a.jpg ", "a.jpg", "", "   "], 3600, "test");
    expect(createSignedUrls).toHaveBeenCalledWith(["a.jpg"], 3600);
  });

  it("passes the caller's TTL through unchanged", async () => {
    const { client, createSignedUrls } = stubClient({ data: [ok("a.jpg")], error: null });
    await signPaths(client, "documents", ["a.jpg"], 900, "test");
    expect(createSignedUrls).toHaveBeenCalledWith(["a.jpg"], 900);
  });
});

describe("mapping stability", () => {
  /**
   * The response contract does not promise input order. Index alignment would appear to work and could
   * hand one row the signed URL for another row's photo — a private-media mix-up between rows that may
   * belong to different assets.
   */
  it("maps by returned path even when the response is reordered", async () => {
    const { client } = stubClient({
      data: [ok("c.jpg"), ok("a.jpg"), ok("b.jpg")],
      error: null,
    });
    const map = await signPaths(client, "submissions", ["a.jpg", "b.jpg", "c.jpg"], 3600, "test");
    expect(map.get("a.jpg")).toBe("https://signed/a.jpg");
    expect(map.get("b.jpg")).toBe("https://signed/b.jpg");
    expect(map.get("c.jpg")).toBe("https://signed/c.jpg");
  });

  it("ignores a response entry that was never requested", async () => {
    const { client } = stubClient({ data: [ok("a.jpg"), ok("uninvited.jpg")], error: null });
    const map = await signPaths(client, "submissions", ["a.jpg"], 3600, "test");
    expect(map.size).toBe(1);
    expect(map.has("uninvited.jpg")).toBe(false);
  });
});

describe("failure is explicit, never a usable-looking value", () => {
  it("maps a per-entry error to null while the rest still resolve", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = stubClient({
      data: [ok("a.jpg"), { error: "Object not found", path: "b.jpg", signedUrl: null }],
      error: null,
    });
    const map = await signPaths(client, "submissions", ["a.jpg", "b.jpg"], 3600, "test");
    expect(map.get("a.jpg")).toBe("https://signed/a.jpg");
    expect(map.get("b.jpg")).toBeNull();
  });

  it("maps every path to null when the whole call fails, and does not throw", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = stubClient({ data: null, error: { message: "boom" } });
    const map = await signPaths(client, "submissions", ["a.jpg", "b.jpg"], 3600, "test");
    expect(map.get("a.jpg")).toBeNull();
    expect(map.get("b.jpg")).toBeNull();
  });

  it("survives a thrown transport error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const client = {
      storage: {
        from: () => ({
          createSignedUrls: async () => {
            throw new Error("network");
          },
        }),
      },
    } as never;
    const map = await signPaths(client, "submissions", ["a.jpg"], 3600, "test");
    expect(map.get("a.jpg")).toBeNull();
  });

  it("covers every requested path even when the response omits one", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = stubClient({ data: [ok("a.jpg")], error: null });
    const map = await signPaths(client, "submissions", ["a.jpg", "missing.jpg"], 3600, "test");
    expect(map.get("missing.jpg")).toBeNull();
    expect(map.has("missing.jpg")).toBe(true);
  });
});

describe("logging carries no capability-bearing value", () => {
  /**
   * A storage path identifies a private object and encodes the owning organization; a signed URL IS an
   * access credential for its TTL. Neither may reach a log.
   */
  it("logs counts and call site only — never a path or a signed URL", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = stubClient({
      data: [{ error: "denied", path: "org/abc-123/private-photo.jpg", signedUrl: null }],
      error: null,
    });
    await signPaths(client, "submissions", ["org/abc-123/private-photo.jpg"], 3600, "inbox");
    const line = err.mock.calls[0].join(" ");
    expect(line).not.toContain("org/abc-123");
    expect(line).not.toContain("private-photo");
    expect(line).not.toContain("https://signed");
    expect(line).toContain('"callSite":"inbox"');
    expect(line).toContain('"failed":1');
  });

  it("logs nothing when every path signs successfully", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = stubClient({ data: [ok("a.jpg")], error: null });
    await signPaths(client, "submissions", ["a.jpg"], 3600, "test");
    expect(err).not.toHaveBeenCalled();
  });
});
