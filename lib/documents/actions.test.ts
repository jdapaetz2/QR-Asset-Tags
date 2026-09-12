import { beforeEach, describe, expect, it, vi } from "vitest";

// Hosted documents uploaded straight to storage (lib/documents/actions.ts): prepare gates, then verify-before-insert.

const { requireProfile, createClient, verifyClaimedObject, redirect } = vi.hoisted(() => ({
  requireProfile: vi.fn(),
  createClient: vi.fn(),
  verifyClaimedObject: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("@/lib/auth/session", () => ({ requireProfile }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/storage/verify-object", () => ({ verifyClaimedObject }));
vi.mock("next/navigation", () => ({ redirect }));

import { createDocument, prepareDocumentUpload } from "@/lib/documents/actions";
import { FILE_CHECK_FAILED_MESSAGE, FILE_VERIFY_FAILED_MESSAGE } from "@/lib/storage/direct-upload";

const ORG = "11111111-1111-4111-8111-111111111111";
const ASSET = "22222222-2222-4222-8222-222222222222";
const DOC = "33333333-3333-4333-8333-333333333333";
const OTHER = "44444444-4444-4444-8444-444444444444";
const CLAIM = `org/${ORG}/asset/${ASSET}/documents/${DOC}/${DOC}.pdf`;
const LIST = `REDIRECT:/dashboard/assets/${ASSET}/documents`;

function fakeClient(opts: { assetVisible?: boolean; insertError?: { code?: string } | null; signFails?: boolean } = {}) {
  const storageApi = {
    createSignedUploadUrl: vi.fn(async (path: string) =>
      opts.signFails
        ? { data: null, error: { message: "denied" } }
        : { data: { signedUrl: `https://storage.test/sign/${path}?token=t` }, error: null }
    ),
    remove: vi.fn(async (paths: string[]) => ({ data: paths.map((name) => ({ name })), error: null })),
    upload: vi.fn(async () => ({ error: null })),
    list: vi.fn(),
    createSignedUrls: vi.fn(),
  };
  const insert = vi.fn(async (_row: Record<string, unknown>) => ({ error: opts.insertError ?? null }));
  const assets = {
    select: vi.fn(() => assets),
    eq: vi.fn(() => assets),
    maybeSingle: vi.fn(async () => ({ data: opts.assetVisible === false ? null : { id: ASSET }, error: null })),
  };
  const client = {
    from: vi.fn((table: string) => (table === "documents" ? { insert } : assets)),
    storage: { from: vi.fn(() => storageApi) },
  };
  createClient.mockResolvedValue(client);
  return { storageApi, insert };
}

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

const BASE = { title: "Operator manual", document_type: "manual", visibility: "private" };

beforeEach(() => {
  vi.clearAllMocks();
  requireProfile.mockResolvedValue({ organization_id: ORG });
});

describe("prepareDocumentUpload", () => {
  it("signs one server-built path, named after a new document, with the caller's own client", async () => {
    const { storageApi } = fakeClient();
    const result = await prepareDocumentUpload(ASSET, { name: "manual.pdf", size: 12_000_000, type: "application/pdf" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.path).toMatch(new RegExp(`^org/${ORG}/asset/${ASSET}/documents/([0-9a-f-]{36})/\\1\\.pdf$`));
    expect(result.signedUrl).toContain("token=");
    expect(storageApi.createSignedUploadUrl).toHaveBeenCalledWith(result.path);
  });

  it.each([
    ["an unsupported type", { size: 10, type: "text/html" }],
    ["a file over 50 MB", { size: 60 * 1024 * 1024, type: "application/pdf" }],
    ["malformed metadata", { size: "big", type: "application/pdf" }],
  ])("refuses %s before any lookup", async (_name, declared) => {
    fakeClient();
    const result = await prepareDocumentUpload(ASSET, declared as never);
    expect(result.ok).toBe(false);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("refuses without an organization, for an invalid id, or an asset the caller cannot see", async () => {
    fakeClient({ assetVisible: false });
    const declared = { size: 10, type: "application/pdf" };
    expect(await prepareDocumentUpload(ASSET, declared)).toEqual({ ok: false, error: "Asset not found." });
    expect(await prepareDocumentUpload("not-a-uuid", declared)).toEqual({ ok: false, error: "Asset not found." });
    requireProfile.mockResolvedValueOnce({ organization_id: null });
    expect((await prepareDocumentUpload(ASSET, declared)).ok).toBe(false);
  });

  it("reports a signing refusal", async () => {
    fakeClient({ signFails: true });
    expect(await prepareDocumentUpload(ASSET, { size: 10, type: "application/pdf" })).toEqual({
      ok: false,
      error: "Could not start the upload. Please try again.",
    });
  });
});

describe("createDocument with an uploaded file", () => {
  it("verifies the stored object, then records it under the document's own id", async () => {
    const { insert } = fakeClient();
    verifyClaimedObject.mockResolvedValue({ ok: true, path: CLAIM, size: 12, type: "application/pdf" });
    await expect(createDocument(ASSET, {}, form({ ...BASE, storage_claim: CLAIM }))).rejects.toThrow(LIST);
    expect(verifyClaimedObject).toHaveBeenCalledWith(
      expect.objectContaining({ prefix: `org/${ORG}/asset/${ASSET}/documents/${DOC}` }),
      CLAIM,
      expect.objectContaining({ maxBytes: 50 * 1024 * 1024 })
    );
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ id: DOC, organization_id: ORG, asset_id: ASSET, storage_path: CLAIM, url: null })
    );
  });

  it.each([
    ["another organization's path", `org/${OTHER}/asset/${ASSET}/documents/${DOC}/${DOC}.pdf`],
    ["another asset's path", `org/${ORG}/asset/${OTHER}/documents/${DOC}/${DOC}.pdf`],
    ["an object not named after its document", `org/${ORG}/asset/${ASSET}/documents/${DOC}/${OTHER}.pdf`],
  ])("refuses %s without verifying or recording", async (_name, claim) => {
    const { insert } = fakeClient();
    expect(await createDocument(ASSET, {}, form({ ...BASE, storage_claim: claim }))).toEqual({
      error: FILE_VERIFY_FAILED_MESSAGE,
    });
    expect(verifyClaimedObject).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("does not record a file that fails verification, and asks to retry after a storage error", async () => {
    const { insert } = fakeClient();
    verifyClaimedObject.mockResolvedValueOnce({ ok: false, reason: "content", deleted: true });
    expect(await createDocument(ASSET, {}, form({ ...BASE, storage_claim: CLAIM }))).toEqual({
      error: FILE_VERIFY_FAILED_MESSAGE,
    });
    verifyClaimedObject.mockResolvedValueOnce({ ok: false, reason: "storage", deleted: false });
    expect(await createDocument(ASSET, {}, form({ ...BASE, storage_claim: CLAIM }))).toEqual({
      error: FILE_CHECK_FAILED_MESSAGE,
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it("removes the verified object when the row cannot be written", async () => {
    const { storageApi } = fakeClient({ insertError: { code: "XX000" } });
    verifyClaimedObject.mockResolvedValue({ ok: true, path: CLAIM, size: 12, type: "application/pdf" });
    expect(await createDocument(ASSET, {}, form({ ...BASE, storage_claim: CLAIM }))).toEqual({
      error: "Could not add the document. Please try again.",
    });
    expect(storageApi.remove).toHaveBeenCalledWith([CLAIM]);
  });

  it("keeps the object on a repeated save of the same upload", async () => {
    const { storageApi } = fakeClient({ insertError: { code: "23505" } });
    verifyClaimedObject.mockResolvedValue({ ok: true, path: CLAIM, size: 12, type: "application/pdf" });
    await expect(createDocument(ASSET, {}, form({ ...BASE, storage_claim: CLAIM }))).rejects.toThrow(LIST);
    expect(storageApi.remove).not.toHaveBeenCalled();
  });

  it("refuses a link together with an uploaded file", async () => {
    fakeClient();
    expect(
      await createDocument(ASSET, {}, form({ ...BASE, url: "https://example.com/manual.pdf", storage_claim: CLAIM }))
    ).toEqual({ error: "Provide either a link or a file, not both." });
    expect(createClient).not.toHaveBeenCalled();
  });
});
