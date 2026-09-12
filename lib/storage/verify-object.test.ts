import { describe, expect, it, vi } from "vitest";

import type { ListedObject, ScopedBucket } from "./scoped-bucket";
import { verifyClaimedObject, type ObjectRules } from "./verify-object";

// Server-side verification of one directly uploaded object (lib/storage/verify-object.ts).

const ORG = "11111111-1111-4111-8111-111111111111";
const ASSET = "22222222-2222-4222-8222-222222222222";
const PREFIX = `org/${ORG}/asset/${ASSET}/cover`;
const NAME = "33333333-3333-4333-8333-333333333333.jpg";
const PATH = `${PREFIX}/${NAME}`;
const JPEG_HEAD = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

const RULES: ObjectRules = {
  objectRe: /^org\/[0-9a-f-]{36}\/asset\/[0-9a-f-]{36}\/cover\/[0-9a-f-]{36}\.(jpg|png)$/,
  allowedTypes: ["image/jpeg", "image/png"],
  maxBytes: 1_000,
  extForMime: (mime) => ({ "image/jpeg": "jpg", "image/png": "png" })[mime] ?? null,
  bytesMatch: (head, mime) => mime === "image/jpeg" && head[0] === 0xff && head[1] === 0xd8,
};

function fakeBucket(objects: ListedObject[] | null, head: Uint8Array | null = JPEG_HEAD) {
  const remove = vi.fn(async (paths: string[]) => ({ removed: paths.length, failed: false }));
  const list = vi.fn(async () => objects);
  const readHeads = vi.fn(async (paths: string[]) => new Map(paths.map((path) => [path, head])));
  const bucket: ScopedBucket = { prefix: PREFIX, signUpload: vi.fn(), list, readHeads, upload: vi.fn(), remove };
  return { bucket, remove, list };
}

const stored = (overrides: Partial<ListedObject> = {}): ListedObject => ({
  name: NAME,
  size: 500,
  mimetype: "image/jpeg",
  ...overrides,
});

describe("verifyClaimedObject", () => {
  it("accepts a stored object that matches every rule, and deletes nothing", async () => {
    const { bucket, remove } = fakeBucket([stored({ name: "other.png" }), stored()]);
    expect(await verifyClaimedObject(bucket, PATH, RULES)).toEqual({ ok: true, path: PATH, size: 500, type: "image/jpeg" });
    expect(remove).not.toHaveBeenCalled();
  });

  it.each([
    ["a non-string claim", 42],
    ["another folder", `org/${ORG}/asset/${ASSET}/logo/${NAME}`],
    ["a nested path", `${PREFIX}/nested/${NAME}`],
    ["a traversal", `${PREFIX}/../cover/${NAME}`],
    ["a name outside the pattern", `${PREFIX}/cover.gif`],
  ])("refuses %s before touching storage", async (_name, claim) => {
    const { bucket, list, remove } = fakeBucket([stored()]);
    expect(await verifyClaimedObject(bucket, claim, RULES)).toEqual({ ok: false, reason: "claim", deleted: false });
    expect(list).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("reports a missing object without deleting anything", async () => {
    const { bucket, remove } = fakeBucket([stored({ name: "44444444-4444-4444-8444-444444444444.jpg" })]);
    expect(await verifyClaimedObject(bucket, PATH, RULES)).toEqual({ ok: false, reason: "missing", deleted: false });
    expect(remove).not.toHaveBeenCalled();
  });

  it("treats an unreadable listing or head as a storage error and keeps the object", async () => {
    const listFails = fakeBucket(null);
    expect(await verifyClaimedObject(listFails.bucket, PATH, RULES)).toMatchObject({ reason: "storage" });
    const headFails = fakeBucket([stored()], null);
    expect(await verifyClaimedObject(headFails.bucket, PATH, RULES)).toMatchObject({ reason: "storage" });
    expect(listFails.remove).not.toHaveBeenCalled();
    expect(headFails.remove).not.toHaveBeenCalled();
  });

  it.each([
    ["a type outside the rules", stored({ mimetype: "image/gif" })],
    ["an extension that does not match the stored type", stored({ mimetype: "image/png" })],
    ["an oversized object", stored({ size: 1_001 })],
    ["an empty object", stored({ size: 0 })],
    ["an object with no recorded type", stored({ mimetype: null })],
  ])("deletes %s", async (_name, object) => {
    const { bucket, remove } = fakeBucket([object]);
    expect(await verifyClaimedObject(bucket, PATH, RULES)).toEqual({ ok: false, reason: "content", deleted: true });
    expect(remove).toHaveBeenCalledWith([PATH]);
  });

  it("deletes an object whose leading bytes are not the stored type", async () => {
    const { bucket, remove } = fakeBucket([stored()], new Uint8Array([0x25, 0x50, 0x44, 0x46]));
    expect(await verifyClaimedObject(bucket, PATH, RULES)).toEqual({ ok: false, reason: "content", deleted: true });
    expect(remove).toHaveBeenCalledWith([PATH]);
  });
});
