import { beforeEach, describe, expect, it, vi } from "vitest";

import { JPEG_HEAD, PNG_HEAD } from "@/tests/setup/image-heads";

/**
 * Phase C6.1 — behavioural tests for the PUBLIC guided return-checklist core.
 *
 * This file did not exist, and that is half of why the bug it now guards survived: a completed return
 * checklist committed a `status='new'` row and never called `revalidateSubmissionSurfaces()`, so the
 * admin's nav badge and inbox kept showing the old count until a full browser reload. The other half was
 * `lib/submissions/revalidate.test.ts`, which checked the staff-return and damage/support paths but not
 * this one — a coverage hole shaped exactly like the defect.
 *
 * The boundary under test: a submission is announced and the authenticated surfaces are invalidated
 * **only once a row is durably committed**. Every path that commits nothing must do neither — an
 * invalidation is merely wasteful, but a notification naming a submission the admin cannot open is a
 * support call.
 *
 * Direct uploads (lib/forms/upload-contract.ts): claimed photos must name visible slots and pass verification;
 * files uploaded by a request that then fails are removed, directly uploaded photos are kept for the retry.
 */

const {
  checkRateLimit,
  hashToken,
  resolvePublicEquipment,
  createPublicClient,
  publicSubmissionBucket,
  scheduleSubmissionNotification,
  revalidateSubmissionSurfaces,
  resolveReturnTemplate,
  logAbuseEvent,
  redirect,
} = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  hashToken: vi.fn(() => "hash"),
  resolvePublicEquipment: vi.fn(),
  createPublicClient: vi.fn(),
  publicSubmissionBucket: vi.fn(),
  scheduleSubmissionNotification: vi.fn(),
  revalidateSubmissionSurfaces: vi.fn(),
  resolveReturnTemplate: vi.fn(),
  logAbuseEvent: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("@/lib/ratelimit/limiter", () => ({ checkRateLimit, hashToken }));
vi.mock("@/lib/ratelimit/log", () => ({ logAbuseEvent }));
vi.mock("@/lib/public/resolve", () => ({ resolvePublicEquipment }));
vi.mock("@/lib/supabase/public", () => ({ createPublicClient }));
vi.mock("@/lib/forms/upload-intake", () => ({ publicSubmissionBucket }));
vi.mock("@/lib/notifications/schedule", () => ({ scheduleSubmissionNotification }));
vi.mock("@/lib/submissions/revalidate", () => ({ revalidateSubmissionSurfaces }));
vi.mock("@/lib/inspections/resolve", () => ({ resolveReturnTemplate }));
vi.mock("next/navigation", () => ({ redirect }));

import { submitReturnInspectionCore } from "@/lib/inspections/submit";
import { RATE_LIMITED_MESSAGE } from "@/lib/ratelimit/policy";
import { IDEMPOTENCY_FIELD } from "@/lib/forms/validate";
import { MEDIA_PATHS_FIELD, MEDIA_VERIFY_FAILED_MESSAGE } from "@/lib/forms/upload-contract";
import type { InspectionTemplate } from "@/lib/inspections/types";

/**
 * A minimal REAL template, so the genuine validator, flag derivation and snapshot builder all run. No
 * photo slot, which is what lets a no-media submission through without a photo-omission acknowledgement
 * (see resolvePhotoEvidence: `conditionPhotosMissing` only applies when slots exist).
 */
const TEMPLATE: InspectionTemplate = {
  key: "c61_test",
  version: "1",
  inspection_type: "return",
  name: "C6.1 test template",
  description: "",
  equipmentTypes: [],
  sections: [
    {
      id: "condition",
      title: "Condition",
      fields: [{ id: "damage_observed", type: "yes_no", label: "Any damage?", flag: "damage_observed" }],
    },
  ],
};

/** A template WITH a photo slot, for the upload paths. */
const PHOTO_TEMPLATE: InspectionTemplate = {
  ...TEMPLATE,
  sections: [
    {
      id: "condition",
      title: "Condition",
      fields: [
        { id: "damage_observed", type: "yes_no", label: "Any damage?", flag: "damage_observed" },
        { id: "overall", type: "photo_slot", label: "Overall", photo: { minPhotos: 0, maxPhotos: 4 } },
      ],
    },
  ],
};

const ORG = "11111111-1111-4111-8111-111111111111";
const ASSET = "22222222-2222-4222-8222-222222222222";
const SUB = "33333333-3333-4333-8333-333333333333";
const PREFIX = `org/${ORG}/asset/${ASSET}/submission/${SUB}`;
const photoName = (n: number) => `4444444${n}-4444-4444-8444-444444444444.jpg`;

type StoredObject = { size: number; mimetype: string; head: Uint8Array };

function makeBucket(objects: Record<string, StoredObject> = {}, uploadOk = true) {
  const upload = vi.fn(async (_path: string, _bytes: Uint8Array, _type: string) => uploadOk);
  const remove = vi.fn(async (paths: string[]) => ({ removed: paths.length, failed: false }));
  publicSubmissionBucket.mockImplementation((prefix: string) => ({
    prefix,
    upload,
    remove,
    signUpload: vi.fn(),
    list: vi.fn(async () =>
      Object.entries(objects).map(([name, object]) => ({
        name,
        size: object.size,
        mimetype: object.mimetype,
        createdAt: new Date().toISOString(),
      }))
    ),
    readHeads: vi.fn(
      async (paths: string[]) =>
        new Map(paths.map((path) => [path, objects[path.slice(prefix.length + 1)]?.head ?? null]))
    ),
  }));
  return { upload, remove };
}

function makeClient(insertResult: { error: { code?: string } | null }) {
  const insert = vi.fn(async (_row: Record<string, unknown>) => insertResult);
  return { client: { from: () => ({ insert }) }, insert };
}

function baseForm(): FormData {
  const fd = new FormData();
  fd.set("name", "Renter Rita");
  fd.set("answer:damage_observed", "no");
  return fd;
}

function formWithPhoto(): FormData {
  const fd = baseForm();
  // A real PNG head: without JavaScript the server checks a photo's bytes before storing it.
  fd.append("photo:overall", new File([PNG_HEAD], "p.png", { type: "image/png" }));
  return fd;
}

function directForm(claims: { slotId: string | null; name: string }[]): FormData {
  const fd = baseForm();
  fd.set(IDEMPOTENCY_FIELD, SUB);
  fd.set(MEDIA_PATHS_FIELD, JSON.stringify(claims.map((claim) => ({ slotId: claim.slotId, path: `${PREFIX}/${claim.name}` }))));
  return fd;
}

async function run(fd: FormData): Promise<{ result?: { error?: string }; redirectedTo?: string }> {
  try {
    const result = await submitReturnInspectionCore("short1", fd);
    return { result };
  } catch (err) {
    const m = (err as Error).message;
    if (m.startsWith("REDIRECT:")) return { redirectedTo: m.slice("REDIRECT:".length) };
    throw err;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SCAN_IP_HASH_SALT = "unit-test-salt-unit-test-salt-unit-test";
  checkRateLimit.mockResolvedValue({ allowed: true, retryAfter: 0, shortCodeHash: "hash" });
  resolvePublicEquipment.mockResolvedValue({
    organizationId: "org1",
    assetId: "asset1",
    qrLinkId: "qr1",
    activeRentalSessionId: null,
    category: null,
    returnInspectionTemplateKey: null,
    returnInspectionTemplateId: null,
    asset: {},
    page: {},
    org: {},
  });
  resolveReturnTemplate.mockReturnValue(TEMPLATE);
  scheduleSubmissionNotification.mockReturnValue(undefined);
  revalidateSubmissionSurfaces.mockReturnValue(undefined);
  makeBucket();
});

describe("a committed return checklist refreshes the authenticated surfaces", () => {
  it("revalidates exactly once on a successful insert", async () => {
    const { client } = makeClient({ error: null });
    createPublicClient.mockReturnValue(client);

    const { redirectedTo } = await run(baseForm());

    // The regression this file exists for.
    expect(revalidateSubmissionSurfaces).toHaveBeenCalledTimes(1);
    expect(redirectedTo).toContain("/forms/short1/return/thanks?ref=SUB-");
  });

  it("still schedules exactly one notification on a successful insert", async () => {
    const { client } = makeClient({ error: null });
    createPublicClient.mockReturnValue(client);

    await run(baseForm());

    // C6 behaviour is unchanged: scheduled once, with the values derived during the request.
    expect(scheduleSubmissionNotification).toHaveBeenCalledTimes(1);
    expect(scheduleSubmissionNotification.mock.calls[0][0]).toMatchObject({
      organizationId: "org1",
      assetId: "asset1",
      formType: "return_checklist",
    });
    // D1: identifiers only — the renter's contact details are never carried across the commit.
    expect(Object.keys(scheduleSubmissionNotification.mock.calls[0][0] as object).sort()).toEqual([
      "assetId",
      "formType",
      "organizationId",
      "reference",
      "submissionId",
    ]);
  });

  it("gives the renter the same confirmation URL and canonical reference", async () => {
    const { client } = makeClient({ error: null });
    createPublicClient.mockReturnValue(client);

    const { redirectedTo } = await run(baseForm());

    expect(redirectedTo).toMatch(/^\/forms\/short1\/return\/thanks\?ref=SUB-\d{4}-[0-9A-F]{6}$/);
  });

  /**
   * Revalidation must not be downstream of the email. `scheduleSubmissionNotification` only registers an
   * `after()` callback, so even a scheduler that did nothing at all cannot suppress the refresh.
   */
  it("does not make the refresh conditional on the notification", async () => {
    const { client } = makeClient({ error: null });
    createPublicClient.mockReturnValue(client);
    scheduleSubmissionNotification.mockImplementation(() => undefined);

    await run(baseForm());

    expect(revalidateSubmissionSurfaces).toHaveBeenCalledTimes(1);
  });
});

describe("a path that commits nothing neither announces nor invalidates", () => {
  it("duplicate submit (23505): no notification, no revalidation, renter still confirmed", async () => {
    const { client } = makeClient({ error: { code: "23505" } });
    createPublicClient.mockReturnValue(client);

    const { redirectedTo } = await run(baseForm());

    // The original submission already did both; doing them again would double-announce one return.
    expect(scheduleSubmissionNotification).not.toHaveBeenCalled();
    expect(revalidateSubmissionSurfaces).not.toHaveBeenCalled();
    expect(redirectedTo).toContain("/forms/short1/return/thanks?ref=SUB-");
  });

  it("insert failure: neither", async () => {
    const { client } = makeClient({ error: { code: "23503" } });
    createPublicClient.mockReturnValue(client);

    const { result } = await run(baseForm());

    expect(result?.error).toBeTruthy();
    expect(scheduleSubmissionNotification).not.toHaveBeenCalled();
    expect(revalidateSubmissionSurfaces).not.toHaveBeenCalled();
  });

  it("rate-limited request: neither, and nothing is uploaded or inserted", async () => {
    checkRateLimit.mockResolvedValue({ allowed: false, shortCodeHash: "hash" });
    const { upload } = makeBucket();
    const { client, insert } = makeClient({ error: null });
    createPublicClient.mockReturnValue(client);

    const { result } = await run(baseForm());

    expect(result?.error).toBe(RATE_LIMITED_MESSAGE);
    expect(upload).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
    expect(scheduleSubmissionNotification).not.toHaveBeenCalled();
    expect(revalidateSubmissionSurfaces).not.toHaveBeenCalled();
  });

  it("unavailable asset: neither", async () => {
    resolvePublicEquipment.mockResolvedValue(null);
    const { client } = makeClient({ error: null });
    createPublicClient.mockReturnValue(client);

    const { result } = await run(baseForm());

    expect(result?.error).toBeTruthy();
    expect(scheduleSubmissionNotification).not.toHaveBeenCalled();
    expect(revalidateSubmissionSurfaces).not.toHaveBeenCalled();
  });

  it("upload failure: neither, and no row is inserted", async () => {
    resolveReturnTemplate.mockReturnValue(PHOTO_TEMPLATE);
    makeBucket({}, /* uploadOk */ false);
    const { client, insert } = makeClient({ error: null });
    createPublicClient.mockReturnValue(client);

    const { result } = await run(formWithPhoto());

    expect(result?.error).toBeTruthy();
    expect(insert).not.toHaveBeenCalled();
    expect(scheduleSubmissionNotification).not.toHaveBeenCalled();
    expect(revalidateSubmissionSurfaces).not.toHaveBeenCalled();
  });

  it("validation failure: neither", async () => {
    const fd = baseForm();
    fd.set("email", "not-an-email");
    const { client, insert } = makeClient({ error: null });
    createPublicClient.mockReturnValue(client);

    const { result } = await run(fd);

    expect(result?.error).toBeTruthy();
    expect(insert).not.toHaveBeenCalled();
    expect(scheduleSubmissionNotification).not.toHaveBeenCalled();
    expect(revalidateSubmissionSurfaces).not.toHaveBeenCalled();
  });

  it("an unacknowledged photo omission removes the files this request uploaded (no orphan)", async () => {
    resolveReturnTemplate.mockReturnValue(PHOTO_TEMPLATE);
    const { upload, remove } = makeBucket();
    const { client, insert } = makeClient({ error: null });
    createPublicClient.mockReturnValue(client);
    const fd = formWithPhoto();
    fd.set("answer:damage_observed", "yes"); // damage without a damage photo, not acknowledged

    const { result } = await run(fd);

    expect(result?.error).toBe("Add photos, or confirm you want to submit the inspection without them.");
    expect(upload).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove.mock.calls[0][0]).toHaveLength(1);
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("direct uploads — claimed photos", () => {
  beforeEach(() => {
    resolveReturnTemplate.mockReturnValue(PHOTO_TEMPLATE);
    resolvePublicEquipment.mockResolvedValue({
      organizationId: ORG,
      assetId: ASSET,
      qrLinkId: "qr1",
      activeRentalSessionId: null,
      category: null,
      returnInspectionTemplateKey: null,
      returnInspectionTemplateId: null,
      asset: {},
      page: {},
      org: {},
    });
  });

  it("commits verified claims as slot photos without re-spending the rate limit", async () => {
    makeBucket({ [photoName(1)]: { size: 3_000_000, mimetype: "image/jpeg", head: JPEG_HEAD } });
    const { client, insert } = makeClient({ error: null });
    createPublicClient.mockReturnValue(client);

    const { redirectedTo } = await run(directForm([{ slotId: "overall", name: photoName(1) }]));

    expect(redirectedTo).toContain("/forms/short1/return/thanks?ref=SUB-");
    expect(checkRateLimit).not.toHaveBeenCalled();
    const row = insert.mock.calls[0][0] as { media_urls: string[]; submission_data_json: { answers: { photos: unknown } } };
    expect(row.media_urls).toEqual([`${PREFIX}/${photoName(1)}`]);
    expect(row.submission_data_json.answers.photos).toEqual({
      overall: [{ path: `${PREFIX}/${photoName(1)}`, caption: "Overall" }],
    });
  });

  it("refuses a claim for a slot the answers do not show", async () => {
    makeBucket({ [photoName(1)]: { size: 10, mimetype: "image/jpeg", head: JPEG_HEAD } });
    const { client, insert } = makeClient({ error: null });
    createPublicClient.mockReturnValue(client);

    const { result } = await run(directForm([{ slotId: "damage_photos", name: photoName(1) }]));

    expect(result?.error).toBe(MEDIA_VERIFY_FAILED_MESSAGE);
    expect(insert).not.toHaveBeenCalled();
  });

  it("refuses more claims than a slot allows", async () => {
    const names = [1, 2, 3, 4, 5].map(photoName);
    makeBucket(Object.fromEntries(names.map((name) => [name, { size: 10, mimetype: "image/jpeg", head: JPEG_HEAD }])));
    const { client, insert } = makeClient({ error: null });
    createPublicClient.mockReturnValue(client);

    const { result } = await run(directForm(names.map((name) => ({ slotId: "overall", name }))));

    expect(result?.error).toBe('"Overall" allows at most 4 photos.');
    expect(insert).not.toHaveBeenCalled();
  });

  it("an unacknowledged omission keeps directly uploaded photos for the acknowledged resubmit", async () => {
    const { remove } = makeBucket({ [photoName(1)]: { size: 10, mimetype: "image/jpeg", head: JPEG_HEAD } });
    const { client } = makeClient({ error: null });
    createPublicClient.mockReturnValue(client);
    const fd = directForm([{ slotId: "overall", name: photoName(1) }]);
    fd.set("answer:damage_observed", "yes");

    const { result } = await run(fd);

    expect(result?.error).toBe("Add photos, or confirm you want to submit the inspection without them.");
    expect(remove).not.toHaveBeenCalled();
  });
});
