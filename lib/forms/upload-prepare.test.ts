import { beforeEach, describe, expect, it, vi } from "vitest";

// Step 1 of a direct photo upload (lib/forms/upload-prepare.ts): the gates run before any signed URL exists.

const {
  checkRateLimit,
  logAbuseEvent,
  resolvePublicEquipment,
  createPublicClient,
  publicSubmissionBucket,
  resolveReturnTemplate,
  getAssetReturnTemplate,
  requireStaffAssetByShortCode,
  createClient,
  resolveStaffReturnTemplate,
  resolveOutboundTemplate,
} = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  logAbuseEvent: vi.fn(),
  resolvePublicEquipment: vi.fn(),
  createPublicClient: vi.fn(() => ({})),
  publicSubmissionBucket: vi.fn(),
  resolveReturnTemplate: vi.fn(),
  getAssetReturnTemplate: vi.fn(),
  requireStaffAssetByShortCode: vi.fn(),
  createClient: vi.fn(),
  resolveStaffReturnTemplate: vi.fn(),
  resolveOutboundTemplate: vi.fn(),
}));

vi.mock("@/lib/ratelimit/limiter", () => ({ checkRateLimit }));
vi.mock("@/lib/ratelimit/log", () => ({ logAbuseEvent }));
vi.mock("@/lib/public/resolve", () => ({ resolvePublicEquipment }));
vi.mock("@/lib/supabase/public", () => ({ createPublicClient }));
vi.mock("@/lib/forms/upload-intake", () => ({ publicSubmissionBucket }));
vi.mock("@/lib/inspections/resolve", () => ({ resolveReturnTemplate }));
vi.mock("@/lib/inspections/org-templates-data", () => ({ getAssetReturnTemplate }));
vi.mock("@/lib/staff/guard", () => ({ requireStaffAssetByShortCode }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/inspections/staff-return-templates", () => ({ resolveStaffReturnTemplate }));
vi.mock("@/lib/inspections/outbound-templates", () => ({ resolveOutboundTemplate }));

import { preparePublicUploads, prepareStaffUploads } from "@/lib/forms/upload-prepare";
import { RATE_LIMITED_MESSAGE } from "@/lib/ratelimit/policy";
import { UPLOAD_FAILED_MESSAGE, type DeclaredFile } from "@/lib/forms/upload-contract";
import type { InspectionTemplate } from "@/lib/inspections/types";

const ORG = "11111111-1111-4111-8111-111111111111";
const ASSET = "22222222-2222-4222-8222-222222222222";
const SUB = "33333333-3333-4333-8333-333333333333";
const PREFIX = `org/${ORG}/asset/${ASSET}/submission/${SUB}/`;

const TEMPLATE: InspectionTemplate = {
  key: "prep_test",
  version: "1",
  inspection_type: "return",
  name: "Prepare test",
  description: "",
  equipmentTypes: [],
  sections: [
    {
      id: "photos",
      title: "Photos",
      fields: [
        { id: "overall", type: "photo_slot", label: "Overall", photo: { minPhotos: 0, maxPhotos: 2 } },
        { id: "damage_photos", type: "photo_slot", label: "Damage photos", photo: { minPhotos: 0, maxPhotos: 6 } },
      ],
    },
  ],
};

const jpeg = (overrides: Partial<DeclaredFile> = {}): DeclaredFile => ({
  slotId: null,
  name: "photo.jpg",
  size: 2_000_000,
  type: "image/jpeg",
  ...overrides,
});

function signingBucket(prefix: string, fails = false) {
  return {
    prefix,
    signUpload: vi.fn(async (path: string) => (fails ? null : `https://storage.test/upload/${path}?token=t`)),
    list: vi.fn(),
    readHeads: vi.fn(),
    upload: vi.fn(),
    remove: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimit.mockResolvedValue({ allowed: true, retryAfter: 0, shortCodeHash: "hash" });
  resolvePublicEquipment.mockResolvedValue({
    organizationId: ORG,
    assetId: ASSET,
    returnInspectionTemplateId: null,
    returnInspectionTemplateKey: "utility_trailer",
    category: null,
  });
  resolveReturnTemplate.mockReturnValue(TEMPLATE);
  publicSubmissionBucket.mockImplementation((prefix: string) => signingBucket(prefix));
});

describe("preparePublicUploads", () => {
  it("honeypot: a silent, empty success — no rate limit, no signing", async () => {
    const result = await preparePublicUploads("tag", "damage", { submissionId: SUB, honeypot: "spam", files: [jpeg()] });
    expect(result).toEqual({ ok: true, submissionId: SUB, uploads: [] });
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(publicSubmissionBucket).not.toHaveBeenCalled();
  });

  it("spends the submission's rate-limit token here, with media rules", async () => {
    await preparePublicUploads("tag", "damage", { submissionId: SUB, honeypot: "", files: [jpeg()] });
    expect(checkRateLimit).toHaveBeenCalledTimes(1);
    expect(checkRateLimit.mock.calls[0][0]).toMatchObject({ action: "damage_support", shortCode: "tag", hasMedia: true });
  });

  it("a limited request signs nothing and resolves nothing", async () => {
    checkRateLimit.mockResolvedValue({ allowed: false, retryAfter: 30, shortCodeHash: "hash" });
    const result = await preparePublicUploads("tag", "damage", { submissionId: SUB, honeypot: "", files: [jpeg()] });
    expect(result).toEqual({ ok: false, error: RATE_LIMITED_MESSAGE });
    expect(resolvePublicEquipment).not.toHaveBeenCalled();
    expect(publicSubmissionBucket).not.toHaveBeenCalled();
  });

  it("an unavailable tag signs nothing", async () => {
    resolvePublicEquipment.mockResolvedValue(null);
    const result = await preparePublicUploads("tag", "support", { submissionId: SUB, honeypot: "", files: [jpeg()] });
    expect(result).toEqual({ ok: false, error: "This form is no longer available." });
    expect(publicSubmissionBucket).not.toHaveBeenCalled();
  });

  it.each([
    ["a disallowed type", [jpeg({ type: "image/heic" })], "Only JPG, PNG, or WebP images are allowed."],
    ["an oversized photo", [jpeg({ size: 10 * 1024 * 1024 + 1 })], "Each photo must be 10 MB or smaller."],
    ["too many photos", Array.from({ length: 6 }, () => jpeg()), "Attach at most 5 photos."],
    ["a slot on a report form", [jpeg({ slotId: "overall" })], "Those photos don't match this form. Reload the page and try again."],
  ])("damage/support refuses %s before signing", async (_name, files, message) => {
    const result = await preparePublicUploads("tag", "damage", { submissionId: SUB, honeypot: "", files });
    expect(result).toEqual({ ok: false, error: message });
    expect(publicSubmissionBucket).not.toHaveBeenCalled();
  });

  it("signs one URL per photo under this submission's own prefix", async () => {
    const result = await preparePublicUploads("tag", "damage", {
      submissionId: SUB,
      honeypot: "",
      files: [jpeg(), jpeg({ type: "image/png", name: "b.png" })],
    });
    expect(publicSubmissionBucket).toHaveBeenCalledWith(PREFIX.slice(0, -1));
    if (!result.ok) throw new Error("expected uploads");
    expect(result.submissionId).toBe(SUB);
    expect(result.uploads).toHaveLength(2);
    expect(result.uploads[0].path.startsWith(PREFIX)).toBe(true);
    expect(result.uploads[0].path).toMatch(/\.jpg$/);
    expect(result.uploads[1].path).toMatch(/\.png$/);
    expect(result.uploads[0].signedUrl).toContain("token=t");
  });

  it("replaces an invalid submission id with a fresh one and returns it", async () => {
    const result = await preparePublicUploads("tag", "damage", { submissionId: "not-a-uuid", honeypot: "", files: [jpeg()] });
    if (!result.ok) throw new Error("expected uploads");
    expect(result.submissionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.submissionId).not.toBe("not-a-uuid");
    expect(result.uploads[0].path).toContain(`/submission/${result.submissionId}/`);
  });

  it("a signing failure is a recoverable upload error", async () => {
    publicSubmissionBucket.mockImplementation((prefix: string) => signingBucket(prefix, true));
    const result = await preparePublicUploads("tag", "damage", { submissionId: SUB, honeypot: "", files: [jpeg()] });
    expect(result).toEqual({ ok: false, error: UPLOAD_FAILED_MESSAGE });
  });

  it.each([
    ["no files", []],
    ["a malformed file entry", [{ slotId: null, name: "a", size: "big", type: "image/jpeg" }]],
  ])("refuses %s", async (_name, files) => {
    const result = await preparePublicUploads("tag", "damage", {
      submissionId: SUB,
      honeypot: "",
      files: files as unknown as DeclaredFile[],
    });
    expect(result).toEqual({ ok: false, error: UPLOAD_FAILED_MESSAGE });
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  describe("return checklist", () => {
    it("uses the return rate-limit action and the resolved template's slots", async () => {
      const result = await preparePublicUploads("tag", "return", {
        submissionId: SUB,
        honeypot: "",
        files: [jpeg({ slotId: "overall" }), jpeg({ slotId: "damage_photos" })],
      });
      expect(checkRateLimit.mock.calls[0][0]).toMatchObject({ action: "return" });
      expect(result.ok).toBe(true);
    });

    it.each([
      ["an unknown slot", [jpeg({ slotId: "not_a_slot" })], "Those photos don't match this form. Reload the page and try again."],
      ["a missing slot", [jpeg()], "Those photos don't match this form. Reload the page and try again."],
      ["more than a slot allows", [jpeg({ slotId: "overall" }), jpeg({ slotId: "overall" }), jpeg({ slotId: "overall" })], '"Overall" allows at most 2 photos.'],
      ["more than 40 MB in total", Array.from({ length: 5 }, () => jpeg({ slotId: "damage_photos", size: 9 * 1024 * 1024 })), "Photos total more than 40 MB — remove some and try again."],
    ])("refuses %s", async (_name, files, message) => {
      const result = await preparePublicUploads("tag", "return", { submissionId: SUB, honeypot: "", files });
      expect(result).toEqual({ ok: false, error: message });
    });

    it("an assigned custom template decides the slots", async () => {
      resolvePublicEquipment.mockResolvedValue({
        organizationId: ORG,
        assetId: ASSET,
        returnInspectionTemplateId: "custom-1",
        returnInspectionTemplateKey: null,
        category: null,
      });
      getAssetReturnTemplate.mockResolvedValue({
        definition: { ...TEMPLATE, sections: [{ id: "s", title: "S", fields: [{ id: "yard", type: "photo_slot", label: "Yard" }] }] },
      });
      const result = await preparePublicUploads("tag", "return", {
        submissionId: SUB,
        honeypot: "",
        files: [jpeg({ slotId: "overall" })],
      });
      expect(result).toMatchObject({ ok: false });
    });
  });
});

describe("prepareStaffUploads", () => {
  function staffStorage() {
    const api = {
      createSignedUploadUrl: vi.fn(async (path: string) => ({ data: { signedUrl: `https://storage.test/${path}?token=s`, token: "s", path }, error: null })),
    };
    createClient.mockResolvedValue({ storage: { from: vi.fn(() => api) } });
    return api;
  }

  beforeEach(() => {
    requireStaffAssetByShortCode.mockResolvedValue({
      profile: { id: "p" },
      organizationId: ORG,
      asset: { id: ASSET, return_inspection_template_key: null, category: null },
    });
    resolveStaffReturnTemplate.mockReturnValue(TEMPLATE);
    resolveOutboundTemplate.mockReturnValue(TEMPLATE);
  });

  it("signs with the staff user's own session under the guard's organization and asset", async () => {
    const api = staffStorage();
    const result = await prepareStaffUploads("tag", "staff_return", {
      submissionId: SUB,
      honeypot: "",
      files: [jpeg({ slotId: "overall" })],
    });
    if (!result.ok) throw new Error("expected uploads");
    expect(result.uploads[0].path.startsWith(PREFIX)).toBe(true);
    expect(api.createSignedUploadUrl).toHaveBeenCalledWith(result.uploads[0].path);
    expect(publicSubmissionBucket).not.toHaveBeenCalled();
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(resolveStaffReturnTemplate).toHaveBeenCalled();
  });

  it("uses the outbound template for an outbound inspection", async () => {
    staffStorage();
    await prepareStaffUploads("tag", "outbound", { submissionId: SUB, honeypot: "", files: [jpeg({ slotId: "overall" })] });
    expect(resolveOutboundTemplate).toHaveBeenCalled();
  });

  it("applies the same slot caps", async () => {
    staffStorage();
    const result = await prepareStaffUploads("tag", "staff_return", {
      submissionId: SUB,
      honeypot: "",
      files: [jpeg({ slotId: "somewhere" })],
    });
    expect(result).toMatchObject({ ok: false });
  });
});
