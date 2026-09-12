import { beforeEach, describe, expect, it, vi } from "vitest";

// Asset cover images uploaded straight to storage (lib/assets/actions.ts): prepare gates, then verify-before-update.

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
vi.mock("@/lib/inspections/category-defaults-data", () => ({ getOrgCategoryDefaults: vi.fn(async () => []) }));
vi.mock("@/lib/assets/list", () => ({ deleteEligibility: vi.fn() }));

import { prepareCoverUpload, updateAsset } from "@/lib/assets/actions";
import { FILE_VERIFY_FAILED_MESSAGE } from "@/lib/storage/direct-upload";

const ORG = "11111111-1111-4111-8111-111111111111";
const ASSET = "22222222-2222-4222-8222-222222222222";
const OTHER = "44444444-4444-4444-8444-444444444444";
const COVER = `org/${ORG}/asset/${ASSET}/cover/33333333-3333-4333-8333-333333333333.jpg`;
const OLD_COVER = `org/${ORG}/asset/${ASSET}/cover/55555555-5555-4555-8555-555555555555.png`;
const publicUrl = (path: string) => `http://127.0.0.1:54321/storage/v1/object/public/public-assets/${path}`;
const DETAIL = `REDIRECT:/dashboard/assets/${ASSET}`;

function fakeClient(
  opts: {
    existing?: { organization_id: string; cover_image_url: string | null; id?: string } | null;
    updateResult?: { data: unknown; error: { code?: string } | null };
    signFails?: boolean;
  } = {}
) {
  const storageApi = {
    createSignedUploadUrl: vi.fn(async (path: string) =>
      opts.signFails
        ? { data: null, error: { message: "denied" } }
        : { data: { signedUrl: `https://storage.test/sign/${path}?token=t` }, error: null }
    ),
    remove: vi.fn(async (paths: string[]) => ({ data: paths.map((name) => ({ name })), error: null })),
    getPublicUrl: vi.fn((path: string) => ({ data: { publicUrl: publicUrl(path) } })),
    upload: vi.fn(async () => ({ error: null })),
    list: vi.fn(),
    createSignedUrls: vi.fn(),
  };
  let updated: Record<string, unknown> | null = null;
  const existing =
    opts.existing === undefined
      ? { id: ASSET, organization_id: ORG, cover_image_url: publicUrl(OLD_COVER) }
      : opts.existing;
  const assets = {
    select: vi.fn(() => assets),
    eq: vi.fn(() => assets),
    update: vi.fn((values: Record<string, unknown>) => {
      updated = values;
      return assets;
    }),
    maybeSingle: vi.fn(async () =>
      updated ? (opts.updateResult ?? { data: { id: ASSET }, error: null }) : { data: existing, error: null }
    ),
  };
  const client = { from: vi.fn(() => assets), storage: { from: vi.fn(() => storageApi) } };
  createClient.mockResolvedValue(client);
  return { storageApi, assets, updated: () => updated };
}

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  fd.set("asset_code", "A-100");
  fd.set("asset_name", "Tandem trailer");
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireProfile.mockResolvedValue({ organization_id: ORG });
});

describe("prepareCoverUpload", () => {
  it("signs one server-built image path in this asset's cover folder", async () => {
    const { storageApi } = fakeClient();
    const result = await prepareCoverUpload(ASSET, { name: "cover.jpg", size: 4_800_000, type: "image/jpeg" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.path).toMatch(new RegExp(`^org/${ORG}/asset/${ASSET}/cover/[0-9a-f-]{36}\\.jpg$`));
    expect(storageApi.createSignedUploadUrl).toHaveBeenCalledWith(result.path);
  });

  it.each([
    ["an image over 5 MB", { size: 6 * 1024 * 1024, type: "image/jpeg" }],
    ["a non-image", { size: 10, type: "application/pdf" }],
  ])("refuses %s before any lookup", async (_name, declared) => {
    fakeClient();
    expect((await prepareCoverUpload(ASSET, declared)).ok).toBe(false);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("refuses an asset the caller cannot see", async () => {
    fakeClient({ existing: null });
    expect(await prepareCoverUpload(ASSET, { size: 10, type: "image/png" })).toEqual({ ok: false, error: "Asset not found." });
  });
});

describe("updateAsset with an uploaded cover", () => {
  it("verifies the stored image, saves its public URL and removes the previous cover", async () => {
    const { storageApi, updated } = fakeClient();
    verifyClaimedObject.mockResolvedValue({ ok: true, path: COVER, size: 4_800_000, type: "image/jpeg" });
    await expect(
      updateAsset(ASSET, {}, form({ cover_claim: COVER, cover_image_url: "https://example.com/stale.jpg" }))
    ).rejects.toThrow(DETAIL);
    expect(verifyClaimedObject).toHaveBeenCalledWith(
      expect.objectContaining({ prefix: `org/${ORG}/asset/${ASSET}/cover` }),
      COVER,
      expect.objectContaining({ maxBytes: 5 * 1024 * 1024 })
    );
    // The uploaded image wins over the typed URL.
    expect(updated()).toMatchObject({ cover_image_url: publicUrl(COVER) });
    expect(storageApi.remove).toHaveBeenCalledWith([OLD_COVER]);
  });

  it("refuses another asset's cover path without verifying or saving", async () => {
    const { assets } = fakeClient();
    expect(
      await updateAsset(ASSET, {}, form({ cover_claim: `org/${ORG}/asset/${OTHER}/cover/33333333-3333-4333-8333-333333333333.jpg` }))
    ).toEqual({ error: FILE_VERIFY_FAILED_MESSAGE });
    expect(verifyClaimedObject).not.toHaveBeenCalled();
    expect(assets.update).not.toHaveBeenCalled();
  });

  it("does not save an image that fails verification", async () => {
    const { assets } = fakeClient();
    verifyClaimedObject.mockResolvedValue({ ok: false, reason: "content", deleted: true });
    expect(await updateAsset(ASSET, {}, form({ cover_claim: COVER }))).toEqual({ error: FILE_VERIFY_FAILED_MESSAGE });
    expect(assets.update).not.toHaveBeenCalled();
  });

  it("removes the just-uploaded image when the asset cannot be saved", async () => {
    const { storageApi } = fakeClient({ updateResult: { data: null, error: { code: "23505" } } });
    verifyClaimedObject.mockResolvedValue({ ok: true, path: COVER, size: 10, type: "image/jpeg" });
    expect(await updateAsset(ASSET, {}, form({ cover_claim: COVER }))).toEqual({
      error: "An asset with that code already exists.",
    });
    expect(storageApi.remove).toHaveBeenCalledWith([COVER]);
    expect(storageApi.remove).not.toHaveBeenCalledWith([OLD_COVER]);
  });
});
