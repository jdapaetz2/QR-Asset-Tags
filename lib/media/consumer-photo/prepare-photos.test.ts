import sharp from "sharp";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { COVER_PHOTO, EVIDENCE_PHOTO, PHOTO_REFUSAL_MESSAGES } from "@/lib/media/photo-policy";
import { PhotoPreparationAborted, preparePhotos, type PhotoConverter } from "./prepare-photos";

// Preparing picked photos in the browser (lib/media/consumer-photo/prepare-photos.ts), with a fake converter.

const MB = 1024 * 1024;
let smallJpeg: Buffer;
let smallPng: Buffer;
let convertedJpeg: Buffer;

beforeAll(async () => {
  const create = (width: number, height: number) =>
    sharp({ create: { width, height, channels: 3, background: { r: 90, g: 110, b: 130 } } });
  smallJpeg = await create(400, 300).jpeg().toBuffer();
  smallPng = await create(64, 64).png().toBuffer();
  convertedJpeg = await create(200, 150).jpeg().toBuffer();
});

const u32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const ascii = (text: string) => Array.from(text, (char) => char.charCodeAt(0));
const heic = () => new Uint8Array([...u32(24), ...ascii("ftypheic"), 0, 0, 0, 0, ...ascii("mif1heic"), ...new Array(200).fill(7)]);

const file = (bytes: Uint8Array | Buffer, name: string, type = "") => new File([new Uint8Array(bytes)], name, { type });

function converter(result: Awaited<ReturnType<PhotoConverter>> | ((job: Parameters<PhotoConverter>[0]) => Awaited<ReturnType<PhotoConverter>>)) {
  return vi.fn<PhotoConverter>(async (job) => (typeof result === "function" ? result(job) : result));
}

const run = (files: File[], convert: PhotoConverter, profile = EVIDENCE_PHOTO, signal = new AbortController().signal) =>
  preparePhotos(files, profile, { convert, signal });

describe("preparePhotos", () => {
  it("keeps web-safe photos untouched, with a generic name and the type their bytes prove", async () => {
    const convert = converter({ ok: false, reason: "decode" });
    // Windows often hands over an empty type; a renamed file keeps a misleading extension.
    const [jpeg, png] = await run([file(smallJpeg, "IMG_0001.HEIC", ""), file(smallPng, "Screenshot 2026-09-12.jpg", "image/jpeg")], convert);
    expect(jpeg).toMatchObject({ ok: true, converted: false });
    expect(png).toMatchObject({ ok: true, converted: false });
    if (!jpeg.ok || !png.ok) return;
    expect([jpeg.file.name, jpeg.file.type, jpeg.file.size]).toEqual(["photo-1.jpg", "image/jpeg", smallJpeg.length]);
    expect([png.file.name, png.file.type]).toEqual(["photo-2.png", "image/png"]);
    expect(convert).not.toHaveBeenCalled();
  });

  it("converts a HEIC through the converter and names the output by its type", async () => {
    const convert = converter({ ok: true, blob: new Blob([new Uint8Array(convertedJpeg)]) });
    const [result] = await run([file(heic(), "IMG_0002.HEIC", "image/heic")], convert);
    expect(convert).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "heic", target: EVIDENCE_PHOTO.targets[0] })
    );
    expect(result).toMatchObject({ ok: true, converted: true });
    if (result.ok) expect([result.file.name, result.file.type, result.file.size]).toEqual(["photo-1.jpg", "image/jpeg", convertedJpeg.length]);
  });

  it("keeps selection order and reports each failure on its own", async () => {
    const convert = converter({ ok: false, reason: "decode" });
    const results = await run(
      [file(smallJpeg, "a.jpg"), file(heic(), "broken.heic"), file(new TextEncoder().encode("<svg/>"), "logo.svg"), file(smallPng, "b.png")],
      convert
    );
    expect(results.map((r) => (r.ok ? r.file.name : `refused:${r.name}`))).toEqual([
      "photo-1.jpg",
      "refused:broken.heic",
      "refused:logo.svg",
      "photo-4.png",
    ]);
    expect(results[1]).toEqual({ ok: false, name: "broken.heic", message: PHOTO_REFUSAL_MESSAGES.unsupported });
    expect(results[2]).toEqual({ ok: false, name: "logo.svg", message: PHOTO_REFUSAL_MESSAGES.vector });
  });

  it("tries the next, smaller target when an output is over the size limit or not the requested type", async () => {
    const outputs = [
      new Blob([new Uint8Array(COVER_PHOTO.maxBytes + 1)]),
      new Blob([new Uint8Array(smallPng)]), // a PNG where a JPEG was asked for
      new Blob([new Uint8Array(convertedJpeg)]),
    ];
    const convert = converter(() => ({ ok: true, blob: outputs.shift() as Blob }));
    const [result] = await run([file(heic(), "cover.heic")], convert, COVER_PHOTO);
    expect(convert.mock.calls.map(([job]) => job.target)).toEqual(COVER_PHOTO.targets);
    expect(result).toMatchObject({ ok: true, converted: true });
  });

  it("refuses with guidance when every target fails, and passes timeouts and size refusals through", async () => {
    expect((await run([file(heic(), "x.heic")], converter({ ok: false, reason: "encode" })))[0]).toMatchObject({
      message: PHOTO_REFUSAL_MESSAGES["too-large"],
    });
    expect((await run([file(heic(), "x.heic")], converter({ ok: false, reason: "timeout" })))[0]).toMatchObject({
      message: PHOTO_REFUSAL_MESSAGES.timeout,
    });
    expect((await run([file(heic(), "x.heic")], converter({ ok: false, reason: "too-large" })))[0]).toMatchObject({
      message: PHOTO_REFUSAL_MESSAGES["too-large"],
    });
  });

  it("converts a large JPEG rather than refusing it", async () => {
    const big = new Uint8Array(12 * MB);
    big.set(smallJpeg);
    const convert = converter({ ok: true, blob: new Blob([new Uint8Array(convertedJpeg)]) });
    const [result] = await run([file(big, "48mp.jpg", "image/jpeg")], convert);
    expect(convert).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ ok: true, converted: true });
  });

  it("stops when cancelled", async () => {
    const controller = new AbortController();
    const convert = converter(() => {
      controller.abort();
      return { ok: false, reason: "decode" };
    });
    await expect(run([file(heic(), "a.heic"), file(smallJpeg, "b.jpg")], convert, EVIDENCE_PHOTO, controller.signal)).rejects.toBeInstanceOf(
      PhotoPreparationAborted
    );
  });
});
