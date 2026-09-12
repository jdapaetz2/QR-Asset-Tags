import { describe, expect, it, vi } from "vitest";

import { FILE_UPLOAD_FAILED_MESSAGE } from "./direct-upload";
import { putFileToSignedUrl, uploadFileDirect } from "./signed-upload-client";

// Browser side of single-file direct uploads (lib/storage/signed-upload-client.ts).

const URL = "https://storage.test/object/upload/sign/documents/org/x?token=t";
const PATH = "org/11111111-1111-4111-8111-111111111111/asset/22222222-2222-4222-8222-222222222222/cover/33333333-3333-4333-8333-333333333333.jpg";
const file = () => new File([new Uint8Array([0xff, 0xd8, 0xff])], "cover.jpg", { type: "image/jpeg" });
const ok = () => vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(null, { status: 200 }));

describe("putFileToSignedUrl", () => {
  it("PUTs the file with its own type and no overwrite", async () => {
    const fetchImpl = ok();
    expect(await putFileToSignedUrl(URL, file(), fetchImpl as unknown as typeof fetch)).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(URL);
    expect(init).toMatchObject({ method: "PUT", headers: { "content-type": "image/jpeg", "x-upsert": "false" } });
  });

  it("reports a refused or failed PUT as false", async () => {
    const refused = vi.fn(async () => new Response(null, { status: 400 }));
    const broken = vi.fn(async () => {
      throw new TypeError("network");
    });
    expect(await putFileToSignedUrl(URL, file(), refused as unknown as typeof fetch)).toBe(false);
    expect(await putFileToSignedUrl(URL, file(), broken as unknown as typeof fetch)).toBe(false);
  });
});

describe("uploadFileDirect", () => {
  it("declares the file, PUTs it and returns the uploaded path", async () => {
    const prepare = vi.fn(async () => ({ ok: true as const, path: PATH, signedUrl: URL }));
    const fetchImpl = ok();
    expect(await uploadFileDirect({ file: file(), prepare, fetchImpl: fetchImpl as unknown as typeof fetch })).toEqual({
      ok: true,
      path: PATH,
    });
    expect(prepare).toHaveBeenCalledWith({ name: "cover.jpg", size: 3, type: "image/jpeg" });
  });

  it("passes on the server's refusal and never uploads", async () => {
    const prepare = vi.fn(async () => ({ ok: false as const, error: "Cover image must be 5 MB or smaller." }));
    const fetchImpl = ok();
    expect(await uploadFileDirect({ file: file(), prepare, fetchImpl: fetchImpl as unknown as typeof fetch })).toEqual({
      ok: false,
      error: "Cover image must be 5 MB or smaller.",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("a prepare request that cannot be delivered, or a failed PUT, keeps the form with the upload message", async () => {
    const thrown = vi.fn(async () => {
      throw new Error("An unexpected response was received from the server.");
    });
    expect(await uploadFileDirect({ file: file(), prepare: thrown })).toEqual({ ok: false, error: FILE_UPLOAD_FAILED_MESSAGE });

    const prepare = vi.fn(async () => ({ ok: true as const, path: PATH, signedUrl: URL }));
    const refused = vi.fn(async () => new Response(null, { status: 403 }));
    expect(await uploadFileDirect({ file: file(), prepare, fetchImpl: refused as unknown as typeof fetch })).toEqual({
      ok: false,
      error: FILE_UPLOAD_FAILED_MESSAGE,
    });
  });
});
