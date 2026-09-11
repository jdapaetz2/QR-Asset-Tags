import { describe, expect, it, vi } from "vitest";

import {
  isObjectUnderPrefix,
  mintSignedUploads,
  readMediaClaims,
  removeUnclaimedObjects,
  scopedSubmissionBucket,
  verifyClaimedMedia,
  type ScopedSubmissionBucket,
} from "./media-verify";
import { MAX_FILE_BYTES } from "./media";
import { MEDIA_PATHS_FIELD } from "./upload-contract";

// Direct-upload storage capability and server-side verification (lib/forms/media-verify.ts).

const ORG = "11111111-1111-4111-8111-111111111111";
const ASSET = "22222222-2222-4222-8222-222222222222";
const SUB = "33333333-3333-4333-8333-333333333333";
const PREFIX = `org/${ORG}/asset/${ASSET}/submission/${SUB}`;
const OTHER_PREFIX = `org/${ORG}/asset/${ASSET}/submission/55555555-5555-4555-8555-555555555555`;
const JPEG = "44444441-4444-4444-8444-444444444444.jpg";
const JPEG_2 = "44444442-4444-4444-8444-444444444444.jpg";
const PNG = "44444443-4444-4444-8444-444444444444.png";
const JPEG_HEAD = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const PNG_HEAD = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);

const at = (name: string, prefix = PREFIX) => `${prefix}/${name}`;

type Stored = { size: number | null; mimetype: string | null; head: Uint8Array | null };

function fakeBucket(objects: Record<string, Stored>, opts: { listFails?: boolean; signFails?: boolean } = {}) {
  const remove = vi.fn(async (paths: string[]) => ({ removed: paths.length, failed: false }));
  const bucket: ScopedSubmissionBucket = {
    prefix: PREFIX,
    signUpload: vi.fn(async (path: string) => (opts.signFails ? null : `https://storage.test/upload/${path}?token=t`)),
    list: vi.fn(async () =>
      opts.listFails
        ? null
        : Object.entries(objects).map(([name, object]) => ({ name, size: object.size, mimetype: object.mimetype }))
    ),
    readHeads: vi.fn(async (paths: string[]) => new Map(paths.map((path) => [path, objects[path.slice(PREFIX.length + 1)]?.head ?? null]))),
    upload: vi.fn(async () => true),
    remove,
  };
  return { bucket, remove };
}

describe("isObjectUnderPrefix", () => {
  it("accepts only a strict object directly under the submission's own prefix", () => {
    expect(isObjectUnderPrefix(PREFIX, at(JPEG))).toBe(true);
    expect(isObjectUnderPrefix(PREFIX, at(JPEG, OTHER_PREFIX))).toBe(false);
    expect(isObjectUnderPrefix(PREFIX, `${PREFIX}/nested/${JPEG}`)).toBe(false);
    expect(isObjectUnderPrefix(PREFIX, `${PREFIX}/..`)).toBe(false);
    expect(isObjectUnderPrefix(PREFIX, `${PREFIX}/../${JPEG}`)).toBe(false);
    expect(isObjectUnderPrefix(PREFIX, 42)).toBe(false);
  });
});

describe("readMediaClaims", () => {
  const form = (value: string | null) => {
    const fd = new FormData();
    if (value !== null) fd.set(MEDIA_PATHS_FIELD, value);
    return fd;
  };

  it("absent or empty means no claims", () => {
    expect(readMediaClaims(form(null), 5)).toEqual({ kind: "none" });
    expect(readMediaClaims(form("[]"), 5)).toEqual({ kind: "none" });
  });

  it("parses well-formed claims", () => {
    const claims = [{ slotId: "overall", path: at(JPEG) }, { slotId: null, path: at(PNG) }];
    expect(readMediaClaims(form(JSON.stringify(claims)), 5)).toEqual({ kind: "claims", claims });
  });

  it.each([
    ["malformed JSON", "{nope"],
    ["not an array", JSON.stringify({ path: "x" })],
    ["too many", JSON.stringify(Array.from({ length: 6 }, (_, i) => ({ slotId: null, path: `p${i}` })))],
    ["duplicate paths", JSON.stringify([{ slotId: null, path: "p" }, { slotId: null, path: "p" }])],
    ["a non-string path", JSON.stringify([{ slotId: null, path: 7 }])],
    ["an empty slot id", JSON.stringify([{ slotId: "", path: "p" }])],
  ])("%s is invalid", (_name, value) => {
    expect(readMediaClaims(form(value), 5)).toEqual({ kind: "invalid" });
  });
});

describe("mintSignedUploads", () => {
  it("signs one opaque, server-chosen path per file, with the extension of its type", async () => {
    const { bucket } = fakeBucket({});
    let n = 0;
    const uploads = await mintSignedUploads(
      bucket,
      [
        { slotId: null, name: "IMG_0001.HEIC.jpg", size: 10, type: "image/jpeg" },
        { slotId: "overall", name: "x.png", size: 10, type: "image/png" },
      ],
      () => `4444444${++n}-4444-4444-8444-444444444444`
    );
    expect(uploads).toEqual([
      { slotId: null, path: at(JPEG), signedUrl: `https://storage.test/upload/${at(JPEG)}?token=t` },
      { slotId: "overall", path: at("44444442-4444-4444-8444-444444444444.png"), signedUrl: expect.any(String) },
    ]);
    // The renter's filename never reaches a path.
    expect(JSON.stringify(uploads)).not.toContain("IMG_0001");
  });

  it("fails as a whole when any URL cannot be signed", async () => {
    const { bucket } = fakeBucket({}, { signFails: true });
    expect(await mintSignedUploads(bucket, [{ slotId: null, name: "a", size: 1, type: "image/jpeg" }])).toBeNull();
  });
});

describe("verifyClaimedMedia", () => {
  const limits = { maxFiles: 5, maxTotalBytes: null };

  it("accepts objects whose stored type, extension and bytes agree", async () => {
    const { bucket, remove } = fakeBucket({
      [JPEG]: { size: 1000, mimetype: "image/jpeg", head: JPEG_HEAD },
      [PNG]: { size: 2000, mimetype: "image/png", head: PNG_HEAD },
    });
    const result = await verifyClaimedMedia(bucket, [{ slotId: "a", path: at(JPEG) }, { slotId: "b", path: at(PNG) }], limits);
    expect(result).toEqual({
      ok: true,
      totalBytes: 3000,
      media: [
        { slotId: "a", path: at(JPEG), size: 1000, type: "image/jpeg" },
        { slotId: "b", path: at(PNG), size: 2000, type: "image/png" },
      ],
    });
    expect(remove).not.toHaveBeenCalled();
  });

  it("refuses a claim outside the prefix without listing or deleting", async () => {
    const { bucket, remove } = fakeBucket({ [JPEG]: { size: 1, mimetype: "image/jpeg", head: JPEG_HEAD } });
    expect(await verifyClaimedMedia(bucket, [{ slotId: null, path: at(JPEG, OTHER_PREFIX) }], limits)).toEqual({
      ok: false,
      reason: "claim",
      deleted: 0,
    });
    expect(bucket.list).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("refuses more claims than the form allows", async () => {
    const { bucket } = fakeBucket({});
    const claims = [JPEG, JPEG_2].map((name) => ({ slotId: null, path: at(name) }));
    expect(await verifyClaimedMedia(bucket, claims, { maxFiles: 1, maxTotalBytes: null })).toMatchObject({ reason: "claim" });
  });

  it("refuses a missing object and deletes nothing", async () => {
    const { bucket, remove } = fakeBucket({});
    expect(await verifyClaimedMedia(bucket, [{ slotId: null, path: at(JPEG) }], limits)).toMatchObject({ ok: false, reason: "missing" });
    expect(remove).not.toHaveBeenCalled();
  });

  it.each([
    ["oversized", { size: MAX_FILE_BYTES + 1, mimetype: "image/jpeg", head: JPEG_HEAD }, JPEG],
    ["empty", { size: 0, mimetype: "image/jpeg", head: JPEG_HEAD }, JPEG],
    ["a disallowed type", { size: 10, mimetype: "image/heic", head: JPEG_HEAD }, JPEG],
    ["an extension that does not match the type", { size: 10, mimetype: "image/png", head: PNG_HEAD }, JPEG],
    ["bytes that are not the stored type", { size: 10, mimetype: "image/jpeg", head: PNG_HEAD }, JPEG],
    ["bytes that are not an image", { size: 10, mimetype: "image/jpeg", head: new Uint8Array(12) }, JPEG],
  ])("deletes and refuses an object with %s", async (_name, object, name) => {
    const { bucket, remove } = fakeBucket({ [name]: object });
    expect(await verifyClaimedMedia(bucket, [{ slotId: null, path: at(name) }], limits)).toEqual({
      ok: false,
      reason: "content",
      deleted: 1,
    });
    expect(remove).toHaveBeenCalledWith([at(name)]);
  });

  it("an unreadable object is a storage failure, never a deletion", async () => {
    const { bucket, remove } = fakeBucket({ [JPEG]: { size: 10, mimetype: "image/jpeg", head: null } });
    expect(await verifyClaimedMedia(bucket, [{ slotId: null, path: at(JPEG) }], limits)).toMatchObject({ reason: "storage" });
    expect(remove).not.toHaveBeenCalled();
  });

  it("a listing failure is a storage failure", async () => {
    const { bucket } = fakeBucket({}, { listFails: true });
    expect(await verifyClaimedMedia(bucket, [{ slotId: null, path: at(JPEG) }], limits)).toMatchObject({ reason: "storage" });
  });

  it("refuses a set over the total cap without deleting valid photos", async () => {
    const { bucket, remove } = fakeBucket({
      [JPEG]: { size: 600, mimetype: "image/jpeg", head: JPEG_HEAD },
      [JPEG_2]: { size: 600, mimetype: "image/jpeg", head: JPEG_HEAD },
    });
    const claims = [JPEG, JPEG_2].map((name) => ({ slotId: null, path: at(name) }));
    expect(await verifyClaimedMedia(bucket, claims, { maxFiles: 5, maxTotalBytes: 1000 })).toMatchObject({ reason: "total" });
    expect(remove).not.toHaveBeenCalled();
  });
});

describe("removeUnclaimedObjects", () => {
  it("removes only objects the committed row does not reference", async () => {
    const { bucket, remove } = fakeBucket({
      [JPEG]: { size: 1, mimetype: "image/jpeg", head: JPEG_HEAD },
      [JPEG_2]: { size: 1, mimetype: "image/jpeg", head: JPEG_HEAD },
    });
    expect(await removeUnclaimedObjects(bucket, [at(JPEG)])).toBe(1);
    expect(remove).toHaveBeenCalledWith([at(JPEG_2)]);
  });

  it("does nothing when every object is referenced", async () => {
    const { bucket, remove } = fakeBucket({ [JPEG]: { size: 1, mimetype: "image/jpeg", head: JPEG_HEAD } });
    expect(await removeUnclaimedObjects(bucket, [at(JPEG)])).toBe(0);
    expect(remove).not.toHaveBeenCalled();
  });
});

describe("scopedSubmissionBucket — every storage call is confined to one prefix", () => {
  function storageApi() {
    return {
      createSignedUploadUrl: vi.fn(async (path: string) => ({
        data: { signedUrl: `https://storage.test/object/upload/sign/submissions/${path}?token=x`, token: "x", path },
        error: null,
      })),
      list: vi.fn(async () => ({
        data: [
          { name: JPEG, id: "obj-1", metadata: { size: 123, mimetype: "image/jpeg" } },
          { name: "folder", id: null, metadata: null },
        ],
        error: null,
      })),
      createSignedUrls: vi.fn(async (paths: string[]) => ({
        data: paths.map((path) => ({ path, signedUrl: `https://storage.test/read/${path}`, error: null })),
        error: null,
      })),
      upload: vi.fn(async () => ({ data: {}, error: null })),
      remove: vi.fn(async (paths: string[]) => ({ data: paths.map((name) => ({ name })), error: null })),
    };
  }
  const asApi = (api: ReturnType<typeof storageApi>) => api as unknown as Parameters<typeof scopedSubmissionBucket>[0];

  it("rejects anything that is not a strict submission prefix", () => {
    expect(() => scopedSubmissionBucket(asApi(storageApi()), `org/${ORG}`)).toThrow();
    expect(() => scopedSubmissionBucket(asApi(storageApi()), `${PREFIX}/extra`)).toThrow();
  });

  it("refuses a path outside the prefix before any storage call", async () => {
    const api = storageApi();
    const bucket = scopedSubmissionBucket(asApi(api), PREFIX);
    await expect(bucket.signUpload(at(JPEG, OTHER_PREFIX))).rejects.toThrow();
    await expect(bucket.remove([at(JPEG, OTHER_PREFIX)])).rejects.toThrow();
    await expect(bucket.upload(at(JPEG, OTHER_PREFIX), new Uint8Array(1), "image/jpeg")).rejects.toThrow();
    expect(api.createSignedUploadUrl).not.toHaveBeenCalled();
    expect(api.remove).not.toHaveBeenCalled();
    expect(api.upload).not.toHaveBeenCalled();
  });

  it("signs uploads without overwrite and lists files (not folders) with their metadata", async () => {
    const api = storageApi();
    const bucket = scopedSubmissionBucket(asApi(api), PREFIX);
    expect(await bucket.signUpload(at(JPEG))).toContain("token=x");
    expect(api.createSignedUploadUrl).toHaveBeenCalledWith(at(JPEG));
    expect(await bucket.list()).toEqual([{ name: JPEG, size: 123, mimetype: "image/jpeg" }]);
    expect(api.list).toHaveBeenCalledWith(PREFIX, { limit: 1000 });
  });

  it("reads only the first bytes of each object, through a short-lived signed URL", async () => {
    const api = storageApi();
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(new Uint8Array(4096).fill(0xab), { status: 206 })
    );
    const bucket = scopedSubmissionBucket(asApi(api), PREFIX, fetchImpl as unknown as typeof fetch);
    const heads = await bucket.readHeads([at(JPEG)]);
    expect(heads.get(at(JPEG))?.byteLength).toBe(12);
    expect(api.createSignedUrls).toHaveBeenCalledWith([at(JPEG)], 60);
    expect((fetchImpl.mock.calls[0][1] as RequestInit).headers).toEqual({ Range: "bytes=0-11" });
  });

  it("aborts once it has the bytes, even when the body never ends and its cancel never settles", async () => {
    // Inside Next's server runtime a fetch body can be a tee whose cancel promise waits on the other branch;
    // awaiting `reader.cancel()` there hung every direct-upload submission.
    const api = storageApi();
    let signal: AbortSignal | null | undefined;
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      signal = init?.signal;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(JPEG_HEAD);
        },
        cancel: () => new Promise<void>(() => {}),
      });
      return new Response(body, { status: 206 });
    });
    const bucket = scopedSubmissionBucket(asApi(api), PREFIX, fetchImpl as unknown as typeof fetch);
    const heads = await bucket.readHeads([at(JPEG)]);
    expect(heads.get(at(JPEG))).toEqual(JPEG_HEAD);
    expect(signal?.aborted).toBe(true);
    expect((fetchImpl.mock.calls[0][1] as RequestInit).cache).toBe("no-store");
  });

  it("reports an unreadable object as null", async () => {
    const api = storageApi();
    api.createSignedUrls.mockResolvedValueOnce({ data: null as never, error: { message: "denied" } as never });
    const bucket = scopedSubmissionBucket(asApi(api), PREFIX, vi.fn() as unknown as typeof fetch);
    expect((await bucket.readHeads([at(JPEG)])).get(at(JPEG))).toBeNull();
  });

  it("uploads without upsert and reports removals", async () => {
    const api = storageApi();
    const bucket = scopedSubmissionBucket(asApi(api), PREFIX);
    expect(await bucket.upload(at(JPEG), new Uint8Array([1]), "image/jpeg")).toBe(true);
    expect(api.upload).toHaveBeenCalledWith(at(JPEG), expect.any(Uint8Array), { contentType: "image/jpeg", upsert: false });
    expect(await bucket.remove([at(JPEG), at(PNG)])).toEqual({ removed: 2, failed: false });
    api.remove.mockResolvedValueOnce({ data: null as never, error: { message: "nope" } as never });
    expect(await bucket.remove([at(JPEG)])).toEqual({ removed: 0, failed: true });
  });
});
