import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

import { ASSET_ID, ORG_ID, OTHER_ORG_ID, SUBMISSION_ID, mediaPath } from "./__fixtures__/rows";
import { buildPreviews, submissionPreviewStorage, type PreviewStorage } from "./previews";
import type { PreviewImageResult } from "./preview-image";
import { PREVIEW_MAX_INPUT_BYTES, previewBytesBucket } from "./preview-limits";
import type { PreviewCandidate } from "./projection";

// Engineering Phase D4 — the preview set for one notification: selection guard, storage reads, budgets, assembly.

const OWNER = { organizationId: ORG_ID, assetId: ASSET_ID, submissionId: SUBMISSION_ID };

function candidate(name: string, rank: PreviewCandidate["rank"] = 1, label = "Damage photos"): PreviewCandidate {
  return { path: mediaPath(name), label, rank };
}

type StoredObject = Uint8Array | "error";

function memoryStorage(objects: Record<string, StoredObject>, reportedSize?: number) {
  const info = vi.fn(async (path: string) => {
    const object = objects[path];
    if (object === undefined) return { status: "missing" } as const;
    if (object === "error") return { status: "error" } as const;
    return { status: "ok", size: reportedSize ?? object.byteLength } as const;
  });
  const download = vi.fn(async (path: string) => {
    const object = objects[path];
    if (object === undefined) return { status: "missing" } as const;
    if (object === "error") return { status: "error" } as const;
    return { status: "ok", blob: new Blob([new Uint8Array(object)]) } as const;
  });
  const storage: PreviewStorage = { info, download };
  return { storage, info, download };
}

const BYTES = new Uint8Array([1, 2, 3]);

function okImage(bytes = 1_000, tag = "preview"): PreviewImageResult {
  return { ok: true, jpeg: Buffer.from(tag), width: 640, height: 480, bytes };
}

function objectsFor(...names: string[]): Record<string, StoredObject> {
  return Object.fromEntries(names.map((name) => [mediaPath(name), BYTES]));
}

describe("assembly", () => {
  it("attaches up to three generated previews with generic names, in rank order", async () => {
    const { storage } = memoryStorage(objectsFor("d1", "d2", "o1", "a1"));
    const transform = vi.fn(async () => okImage());
    const result = await buildPreviews({
      candidates: [candidate("d1"), candidate("d2"), candidate("o1", 3, "Overall photo"), candidate("a1", 4)],
      requested: 3,
      owner: OWNER,
      storage,
      transform,
    });
    expect(transform).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ requested: 3, attached: 3, failureClass: null, totalBytes: 3_000 });
    expect(result.attachments.map((a) => [a.filename, a.contentId, a.contentType])).toEqual([
      ["incident-photo-1.jpg", "mm-preview-1@mulemark", "image/jpeg"],
      ["incident-photo-2.jpg", "mm-preview-2@mulemark", "image/jpeg"],
      ["incident-photo-3.jpg", "mm-preview-3@mulemark", "image/jpeg"],
    ]);
    expect(result.figures.map((f) => f.label)).toEqual(["Damage photos", "Damage photos", "Overall photo"]);
  });

  it("one preview", async () => {
    const { storage } = memoryStorage(objectsFor("d1"));
    const result = await buildPreviews({ candidates: [candidate("d1")], requested: 1, owner: OWNER, storage, transform: async () => okImage() });
    expect(result).toMatchObject({ attached: 1, failureClass: null });
  });

  it("requests nothing when the organization asked for no previews", async () => {
    const { storage, info } = memoryStorage(objectsFor("d1"));
    const result = await buildPreviews({ candidates: [candidate("d1")], requested: 0, owner: OWNER, storage });
    expect(result).toMatchObject({ requested: 0, attached: 0, attachments: [], failureClass: null });
    expect(info).not.toHaveBeenCalled();
  });

  it("keeps the other previews when one fails, renumbering what survived", async () => {
    const { storage } = memoryStorage(objectsFor("d1", "d3"));
    const transform = vi.fn(async () => okImage());
    const result = await buildPreviews({
      candidates: [candidate("d1"), candidate("d2-missing"), candidate("d3")],
      requested: 3,
      owner: OWNER,
      storage,
      transform,
    });
    expect(result).toMatchObject({ attached: 2, failureClass: "missing_object" });
    expect(result.attachments.map((a) => a.filename)).toEqual(["incident-photo-1.jpg", "incident-photo-2.jpg"]);
  });

  it("all failing yields an empty set with the first failure class", async () => {
    const { storage } = memoryStorage({ [mediaPath("d1")]: "error", [mediaPath("d2")]: BYTES });
    const result = await buildPreviews({
      candidates: [candidate("d1"), candidate("d2")],
      requested: 2,
      owner: OWNER,
      storage,
      transform: async () => ({ ok: false, failureClass: "decode_failed" }),
    });
    expect(result).toMatchObject({ attached: 0, attachments: [], figures: [], failureClass: "download_failed", totalBytes: 0 });
  });

  it("omits a preview that would exceed the total byte budget", async () => {
    const { storage } = memoryStorage(objectsFor("d1", "d2", "d3"));
    const result = await buildPreviews({
      candidates: [candidate("d1"), candidate("d2"), candidate("d3")],
      requested: 3,
      owner: OWNER,
      storage,
      transform: async () => okImage(500 * 1024),
    });
    expect(result).toMatchObject({ attached: 2, failureClass: "total_budget", totalBytes: 1000 * 1024 });
  });

  it("carries no storage path or original filename in what it returns", async () => {
    const { storage } = memoryStorage(objectsFor("IMG_4032-original"));
    const result = await buildPreviews({
      candidates: [candidate("IMG_4032-original")],
      requested: 1,
      owner: OWNER,
      storage,
      transform: async () => okImage(),
    });
    const serialized = JSON.stringify({ ...result, attachments: result.attachments.map(({ content: _c, ...rest }) => rest) });
    for (const banned of ["org/", "/submission/", "IMG_4032", ORG_ID, SUBMISSION_ID]) {
      expect(serialized).not.toContain(banned);
    }
  });
});

describe("guards before any read", () => {
  it.each([
    ["another organization's path", mediaPath("x", "jpg", OTHER_ORG_ID)],
    ["another submission's path", `org/${ORG_ID}/asset/${ASSET_ID}/submission/7c0a55e1-9999-4999-8999-999999999999/x.jpg`],
    ["a traversal path", `org/${ORG_ID}/asset/${ASSET_ID}/submission/${SUBMISSION_ID}/../other/x.jpg`],
    ["a non-image path", mediaPath("clip", "mp4")],
  ])("refuses %s without touching storage", async (_name, path) => {
    const { storage, info, download } = memoryStorage({ [path]: BYTES });
    const result = await buildPreviews({
      candidates: [{ path, label: "Damage photos", rank: 1 }],
      requested: 1,
      owner: OWNER,
      storage,
      transform: async () => okImage(),
    });
    expect(result).toMatchObject({ attached: 0, failureClass: "path_rejected" });
    expect(info).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  it("refuses an object over the input cap before downloading it", async () => {
    const { storage, download } = memoryStorage(objectsFor("huge"), PREVIEW_MAX_INPUT_BYTES + 1);
    const result = await buildPreviews({ candidates: [candidate("huge")], requested: 1, owner: OWNER, storage, transform: async () => okImage() });
    expect(result.failureClass).toBe("too_large_input");
    expect(download).not.toHaveBeenCalled();
  });

  it("re-checks the downloaded size before decoding", async () => {
    const big = new Uint8Array(PREVIEW_MAX_INPUT_BYTES + 1);
    const { storage } = memoryStorage({ [mediaPath("liar")]: big }, 10);
    const transform = vi.fn(async () => okImage());
    const result = await buildPreviews({ candidates: [candidate("liar")], requested: 1, owner: OWNER, storage, transform });
    expect(result.failureClass).toBe("too_large_input");
    expect(transform).not.toHaveBeenCalled();
  });
});

describe("time and concurrency", () => {
  it("never runs more than two transforms at once", async () => {
    const { storage } = memoryStorage(objectsFor("d1", "d2", "d3"));
    let active = 0;
    let peak = 0;
    const transform = async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 20));
      active--;
      return okImage();
    };
    const result = await buildPreviews({
      candidates: [candidate("d1"), candidate("d2"), candidate("d3")],
      requested: 3,
      owner: OWNER,
      storage,
      transform,
    });
    expect(peak).toBe(2);
    expect(result.attached).toBe(3);
  });

  it("drops a preview that outlives the media budget", async () => {
    const { storage } = memoryStorage(objectsFor("slow"));
    const transform = () => new Promise<PreviewImageResult>((resolve) => setTimeout(() => resolve(okImage()), 200));
    const result = await buildPreviews({ candidates: [candidate("slow")], requested: 1, owner: OWNER, storage, budgetMs: 25, transform });
    expect(result).toMatchObject({ attached: 0, failureClass: "time_budget" });
  });

  it("starts nothing new once the budget is spent", async () => {
    const { storage } = memoryStorage(objectsFor("d1", "d2", "d3"));
    let clock = 0;
    const transform = vi.fn(async () => {
      clock += 10_000;
      return okImage();
    });
    const result = await buildPreviews({
      candidates: [candidate("d1"), candidate("d2"), candidate("d3")],
      requested: 3,
      owner: OWNER,
      storage,
      now: () => clock,
      concurrency: 1,
      transform,
    });
    expect(transform).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ attached: 1, failureClass: "time_budget" });
    expect(result.transformMs).toBe(10_000);
  });
});

describe("with the real transformer", () => {
  it("attaches a preview that carries no EXIF or GPS from the stored original", async () => {
    const original = await sharp({ create: { width: 2000, height: 1500, channels: 3, background: { r: 10, g: 120, b: 60 } } })
      .withExif({ IFD0: { Make: "MulemarkTestCam" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "49/1 15/1 0/1" } })
      .jpeg()
      .toBuffer();
    const { storage } = memoryStorage({ [mediaPath("gps")]: new Uint8Array(original) });
    const result = await buildPreviews({ candidates: [candidate("gps")], requested: 1, owner: OWNER, storage });
    expect(result.attached).toBe(1);
    const meta = await sharp(result.attachments[0].content).metadata();
    expect(meta.exif).toBeUndefined();
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(640);
  });
});

describe("submissionPreviewStorage — read-only, private bucket", () => {
  function clientWith(bucket: { info: unknown; download: unknown }) {
    const from = vi.fn(() => bucket);
    return { client: { storage: { from } } as unknown as SupabaseClient, from };
  }

  it("reads object info and bytes from the submissions bucket", async () => {
    const blob = new Blob([new Uint8Array([9])]);
    const { client, from } = clientWith({
      info: async () => ({ data: { size: 1234 }, error: null }),
      download: async () => ({ data: blob, error: null }),
    });
    const storage = submissionPreviewStorage(client);
    expect(await storage.info(mediaPath("d1"))).toEqual({ status: "ok", size: 1234 });
    expect(await storage.download(mediaPath("d1"))).toEqual({ status: "ok", blob });
    expect(from).toHaveBeenCalledWith("submissions");
  });

  it("maps not-found to missing, other errors and throws to error", async () => {
    const missing = submissionPreviewStorage(
      clientWith({
        info: async () => ({ data: null, error: { statusCode: "404", message: "Object not found" } }),
        download: async () => ({ data: null, error: { status: 400, message: "Object not found" } }),
      }).client
    );
    expect(await missing.info("p")).toEqual({ status: "missing" });
    expect(await missing.download("p")).toEqual({ status: "missing" });

    const broken = submissionPreviewStorage(
      clientWith({
        info: async () => ({ data: null, error: { statusCode: "500", message: "upstream" } }),
        download: async () => {
          throw new Error("socket hang up");
        },
      }).client
    );
    expect(await broken.info("p")).toEqual({ status: "error" });
    expect(await broken.download("p")).toEqual({ status: "error" });
  });
});

describe("previewBytesBucket", () => {
  it("logs a coarse size, never an exact one", () => {
    expect([0, 1, 249 * 1024, 300 * 1024, 700 * 1024, 1200 * 1024].map(previewBytesBucket)).toEqual([
      "none",
      "lt_250kb",
      "lt_250kb",
      "lt_500kb",
      "lt_1mb",
      "lt_1_5mb",
    ]);
  });
});
