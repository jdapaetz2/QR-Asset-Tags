import { describe, expect, it, vi } from "vitest";

import { collectSelectedPhotos, stripSelectedPhotos, uploadPhotosDirect } from "./upload-client";
import { UPLOAD_FAILED_MESSAGE, type PrepareUploadsRequest, type PrepareUploadsResult } from "./upload-contract";

// Browser side of direct photo uploads (lib/forms/upload-client.ts).

const SUB = "33333333-3333-4333-8333-333333333333";

const photoFile = (name: string, size = 10, type = "image/jpeg") => new File([new Uint8Array(size)], name, { type });

function prepared(slots: (string | null)[], submissionId = SUB): PrepareUploadsResult {
  return {
    ok: true,
    submissionId,
    uploads: slots.map((slotId, index) => ({
      slotId,
      path: `org/o/asset/a/submission/${submissionId}/photo-${index}.jpg`,
      signedUrl: `https://storage.test/upload/${index}?token=t`,
    })),
  };
}

describe("collectSelectedPhotos / stripSelectedPhotos", () => {
  it("collects non-empty media and photo-slot files with their slots, and strips only those fields", () => {
    const fd = new FormData();
    fd.set("name", "Renter");
    fd.append("media", photoFile("a.jpg"));
    fd.append("media", new File([], "empty.jpg", { type: "image/jpeg" }));
    fd.append("photo:overall", photoFile("b.jpg"));
    fd.append("photo:damage_photos", photoFile("c.jpg"));
    expect(collectSelectedPhotos(fd).map((photo) => [photo.slotId, photo.file.name])).toEqual([
      [null, "a.jpg"],
      ["overall", "b.jpg"],
      ["damage_photos", "c.jpg"],
    ]);
    stripSelectedPhotos(fd);
    expect([...fd.keys()]).toEqual(["name"]);
  });
});

describe("uploadPhotosDirect", () => {
  const photos = [
    { slotId: "overall", file: photoFile("a.jpg", 100) },
    { slotId: "overall", file: photoFile("b.png", 200, "image/png") },
    { slotId: "damage_photos", file: photoFile("c.jpg", 300) },
  ];

  it("declares metadata only, PUTs each photo to its signed URL, and returns the claims", async () => {
    const prepare = vi.fn(async (_request: PrepareUploadsRequest) => prepared(["overall", "overall", "damage_photos"]));
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));
    const progress = vi.fn();

    const result = await uploadPhotosDirect({
      photos,
      submissionId: SUB,
      honeypot: "",
      prepare,
      onProgress: progress,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(prepare.mock.calls[0][0]).toEqual({
      submissionId: SUB,
      honeypot: "",
      files: [
        { slotId: "overall", name: "a.jpg", size: 100, type: "image/jpeg" },
        { slotId: "overall", name: "b.png", size: 200, type: "image/png" },
        { slotId: "damage_photos", name: "c.jpg", size: 300, type: "image/jpeg" },
      ],
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const [url, init] = fetchImpl.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe("https://storage.test/upload/1?token=t");
    expect(init).toMatchObject({ method: "PUT", headers: { "content-type": "image/png", "x-upsert": "false" } });
    expect(result).toEqual({
      ok: true,
      submissionId: SUB,
      claims: [
        { slotId: "overall", path: `org/o/asset/a/submission/${SUB}/photo-0.jpg` },
        { slotId: "overall", path: `org/o/asset/a/submission/${SUB}/photo-1.jpg` },
        { slotId: "damage_photos", path: `org/o/asset/a/submission/${SUB}/photo-2.jpg` },
      ],
    });
    expect(progress).toHaveBeenLastCalledWith(3, 3);
  });

  it("never uploads more than two at a time", async () => {
    let active = 0;
    let peak = 0;
    const fetchImpl = vi.fn(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active--;
      return new Response(null, { status: 200 });
    });
    await uploadPhotosDirect({
      photos,
      submissionId: SUB,
      honeypot: "",
      prepare: async () => prepared(["overall", "overall", "damage_photos"]),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(peak).toBe(2);
  });

  it("returns the server's refusal as-is (e.g. a cap or the rate limit)", async () => {
    const result = await uploadPhotosDirect({
      photos,
      submissionId: SUB,
      honeypot: "",
      prepare: async () => ({ ok: false, error: "Attach at most 8 photos." }),
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });
    expect(result).toEqual({ ok: false, error: "Attach at most 8 photos." });
  });

  it("an undeliverable prepare becomes a recoverable upload error", async () => {
    const result = await uploadPhotosDirect({
      photos,
      submissionId: SUB,
      honeypot: "",
      prepare: async () => {
        throw new Error("An unexpected response was received from the server.");
      },
    });
    expect(result).toEqual({ ok: false, error: UPLOAD_FAILED_MESSAGE });
  });

  it("refuses a prepare answer that does not match the photos", async () => {
    const fetchImpl = vi.fn();
    const wrongCount = await uploadPhotosDirect({
      photos,
      submissionId: SUB,
      honeypot: "",
      prepare: async () => prepared(["overall"]),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const wrongSlot = await uploadPhotosDirect({
      photos,
      submissionId: SUB,
      honeypot: "",
      prepare: async () => prepared(["overall", "damage_photos", "overall"]),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(wrongCount).toEqual({ ok: false, error: UPLOAD_FAILED_MESSAGE });
    expect(wrongSlot).toEqual({ ok: false, error: UPLOAD_FAILED_MESSAGE });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ["a rejected PUT", async () => new Response(null, { status: 400 })],
    ["a network failure", async () => {
      throw new TypeError("Failed to fetch");
    }],
  ])("%s fails the whole upload", async (_name, put) => {
    const result = await uploadPhotosDirect({
      photos,
      submissionId: SUB,
      honeypot: "",
      prepare: async () => prepared(["overall", "overall", "damage_photos"]),
      fetchImpl: vi.fn(put) as unknown as typeof fetch,
    });
    expect(result).toEqual({ ok: false, error: UPLOAD_FAILED_MESSAGE });
  });

  it("a silent honeypot prepare uploads nothing and yields no claims", async () => {
    const fetchImpl = vi.fn();
    const result = await uploadPhotosDirect({
      photos,
      submissionId: SUB,
      honeypot: "https://spam.example",
      prepare: async () => ({ ok: true, submissionId: SUB, uploads: [] }),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual({ ok: true, submissionId: SUB, claims: [] });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
