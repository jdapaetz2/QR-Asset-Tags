import { describe, expect, it, vi } from "vitest";

import { documentStorage } from "@/lib/documents/storage";
import { coverStorage } from "@/lib/assets/cover-storage";
import type { StorageBucketApi } from "./scoped-bucket";

// Prefix confinement for the admin direct-upload buckets (lib/storage/scoped-bucket.ts). The submission rules are
// covered by lib/forms/media-verify.test.ts.

const ORG = "11111111-1111-4111-8111-111111111111";
const ASSET = "22222222-2222-4222-8222-222222222222";
const DOC = "33333333-3333-4333-8333-333333333333";
const OTHER = "44444444-4444-4444-8444-444444444444";
const DOC_PREFIX = `org/${ORG}/asset/${ASSET}/documents/${DOC}`;
const COVER_PREFIX = `org/${ORG}/asset/${ASSET}/cover`;

function storageApi() {
  return {
    createSignedUploadUrl: vi.fn(async (path: string) => ({ data: { signedUrl: `https://storage.test/sign/${path}` }, error: null })),
    remove: vi.fn(async (paths: string[]) => ({ data: paths.map((name) => ({ name })), error: null })),
    list: vi.fn(),
    createSignedUrls: vi.fn(),
    upload: vi.fn(),
  };
}
const asApi = (api: ReturnType<typeof storageApi>) => api as unknown as StorageBucketApi;

describe("documentStorage", () => {
  it("needs a single-document prefix", () => {
    expect(() => documentStorage(asApi(storageApi()), `org/${ORG}/asset/${ASSET}/documents`)).toThrow();
    expect(() => documentStorage(asApi(storageApi()), COVER_PREFIX)).toThrow();
    expect(() => documentStorage(asApi(storageApi()), `${DOC_PREFIX}/extra`)).toThrow();
  });

  it("signs only an object named after its own document", async () => {
    const api = storageApi();
    const bucket = documentStorage(asApi(api), DOC_PREFIX);
    expect(await bucket.signUpload(`${DOC_PREFIX}/${DOC}.pdf`)).toContain(`${DOC}.pdf`);
    await expect(bucket.signUpload(`org/${ORG}/asset/${ASSET}/documents/${OTHER}/${OTHER}.pdf`)).rejects.toThrow();
    await expect(bucket.signUpload(`${DOC_PREFIX}/${DOC}.exe`)).rejects.toThrow();
    await expect(bucket.remove([`${DOC_PREFIX}/nested/${DOC}.pdf`])).rejects.toThrow();
    expect(api.createSignedUploadUrl).toHaveBeenCalledTimes(1);
  });
});

describe("coverStorage", () => {
  it("stays inside one asset's cover folder", async () => {
    const api = storageApi();
    const bucket = coverStorage(asApi(api), COVER_PREFIX);
    expect(await bucket.signUpload(`${COVER_PREFIX}/${DOC}.webp`)).toContain(`${DOC}.webp`);
    await expect(bucket.signUpload(`org/${ORG}/asset/${OTHER}/cover/${DOC}.jpg`)).rejects.toThrow();
    await expect(bucket.signUpload(`org/${ORG}/logo/${DOC}.png`)).rejects.toThrow();
    await expect(bucket.signUpload(`${COVER_PREFIX}/${DOC}.pdf`)).rejects.toThrow();
    expect(() => coverStorage(asApi(api), `org/${ORG}/logo`)).toThrow();
  });
});
