import { beforeEach, describe, expect, it, vi } from "vitest";

import { JPEG_HEAD, PNG_HEAD } from "@/tests/setup/image-heads";

// Behavioral tests for the public submit core's Phase A4 guarantees, with the DB/storage/limiter mocked:
// no upload after a preflight reject; cleanup after insert failure; PK-conflict → cleanup + idempotent
// success; committed submission survives a notification step (media never deleted after commit).
//
// Phase C6 adds the transaction-boundary guarantee that deferral makes load-bearing: a notification is
// scheduled ONLY once a row is durably committed. Announcing a submission that does not exist would be
// worse than not announcing one that does.
//
// Direct uploads (lib/forms/upload-contract.ts) add the finalize rules: claimed objects are verified under this
// submission's own prefix, the rate limit is not spent twice, and nothing that could be committed evidence is deleted.

// Hoisted so the vi.mock factories (also hoisted) can safely reference these mocks.
const {
  checkRateLimit,
  hashToken,
  resolvePublicEquipment,
  createPublicClient,
  publicSubmissionBucket,
  scheduleSubmissionNotification,
  revalidateSubmissionSurfaces,
  redirect,
} =
  vi.hoisted(() => ({
    checkRateLimit: vi.fn(),
    hashToken: vi.fn(() => "sch"),
    resolvePublicEquipment: vi.fn(),
    createPublicClient: vi.fn(),
    publicSubmissionBucket: vi.fn(),
    // Phase C6: the core now SCHEDULES the notification instead of awaiting it.
    scheduleSubmissionNotification: vi.fn(),
    // Phase C6.1: asserted here so the damage/support paths are proved UNCHANGED by the return fix.
    revalidateSubmissionSurfaces: vi.fn(),
    redirect: vi.fn((url: string) => {
      throw new Error(`REDIRECT:${url}`);
    }),
  }));

vi.mock("@/lib/ratelimit/limiter", () => ({ checkRateLimit, hashToken }));
vi.mock("@/lib/public/resolve", () => ({ resolvePublicEquipment }));
vi.mock("@/lib/supabase/public", () => ({ createPublicClient }));
vi.mock("@/lib/forms/upload-intake", () => ({ publicSubmissionBucket }));
vi.mock("@/lib/notifications/schedule", () => ({ scheduleSubmissionNotification }));
vi.mock("@/lib/submissions/revalidate", () => ({ revalidateSubmissionSurfaces }));
vi.mock("next/navigation", () => ({ redirect }));

import { submitPublicForm, type PublicFormConfig } from "@/lib/forms/submit";
import { RATE_LIMITED_MESSAGE } from "@/lib/ratelimit/policy";
import { IDEMPOTENCY_FIELD } from "@/lib/forms/validate";
import { MEDIA_PATHS_FIELD, MEDIA_VERIFY_FAILED_MESSAGE } from "@/lib/forms/upload-contract";

const CONFIG: PublicFormConfig = {
  formType: "damage_report",
  thanksSlug: "damage",
  fieldError: null,
  submittedBy: { name: "R", email: null, phone: null },
  dataJson: {},
};

const ORG = "11111111-1111-4111-8111-111111111111";
const ASSET = "22222222-2222-4222-8222-222222222222";
const SUB = "33333333-3333-4333-8333-333333333333";
const OTHER_SUB = "55555555-5555-4555-8555-555555555555";
const PREFIX = `org/${ORG}/asset/${ASSET}/submission/${SUB}`;
const PHOTO_1 = "44444441-4444-4444-8444-444444444444.jpg";
const PHOTO_2 = "44444442-4444-4444-8444-444444444444.jpg";

type StoredObject = { size: number; mimetype: string; head: Uint8Array };

/** A fake submission-scoped bucket (lib/forms/media-verify.ts) standing in for the service-role handle. */
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
  const client = { from: () => ({ insert }) };
  return { client, insert };
}

function formWithPhoto(): FormData {
  const fd = new FormData();
  fd.set("name", "Renter");
  // A real PNG head: without JavaScript the server checks a photo's bytes before storing it.
  fd.append("media", new File([PNG_HEAD], "p.png", { type: "image/png" }));
  return fd;
}

function directForm(names: string[], submissionId = SUB): FormData {
  const fd = new FormData();
  fd.set("name", "Renter");
  fd.set(IDEMPOTENCY_FIELD, SUB);
  fd.set(
    MEDIA_PATHS_FIELD,
    JSON.stringify(
      names.map((name) => ({ slotId: null, path: `org/${ORG}/asset/${ASSET}/submission/${submissionId}/${name}` }))
    )
  );
  return fd;
}

async function run(
  fd: FormData,
  config: PublicFormConfig = CONFIG
): Promise<{ result?: { error?: string }; redirectedTo?: string }> {
  try {
    const result = await submitPublicForm("short1", fd, config);
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
  checkRateLimit.mockResolvedValue({ allowed: true, retryAfter: 0, shortCodeHash: "sch" });
  resolvePublicEquipment.mockResolvedValue({ organizationId: "org1", assetId: "asset1" });
  scheduleSubmissionNotification.mockReturnValue(undefined);
  makeBucket();
});

describe("preflight rate limit", () => {
  it("a limited request does NOT resolve, upload, or insert — generic message, no cost", async () => {
    checkRateLimit.mockResolvedValue({ allowed: false, retryAfter: 30, shortCodeHash: "sch" });
    const { upload } = makeBucket();
    const { client, insert } = makeClient({ error: null });
    createPublicClient.mockReturnValue(client);

    const { result } = await run(formWithPhoto());
    expect(result?.error).toBe(RATE_LIMITED_MESSAGE);
    expect(resolvePublicEquipment).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("cleanup on finalization failure", () => {
  it("cleans up uploaded media when the insert fails", async () => {
    const { remove, upload } = makeBucket();
    const { client } = makeClient({ error: { code: "23503" } });
    createPublicClient.mockReturnValue(client);

    const { result } = await run(formWithPhoto());
    expect(upload).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
    // Removed exactly this request's uploaded path (one object).
    expect(remove.mock.calls[0][0]).toHaveLength(1);
    expect(result?.error).toBeTruthy();
  });

  it("a duplicate submit (PK 23505) cleans this call's re-uploads and redirects (idempotent success)", async () => {
    const { remove } = makeBucket();
    const { client } = makeClient({ error: { code: "23505" } });
    createPublicClient.mockReturnValue(client);

    const { redirectedTo, result } = await run(formWithPhoto());
    expect(remove).toHaveBeenCalledTimes(1);
    expect(result?.error).toBeUndefined();
    expect(redirectedTo).toContain("/forms/short1/damage/thanks");
  });

  it("an upload failure removes what this request already uploaded and inserts nothing", async () => {
    const { remove } = makeBucket({}, false);
    const { client, insert } = makeClient({ error: null });
    createPublicClient.mockReturnValue(client);

    const { result } = await run(formWithPhoto());
    expect(result?.error).toBe("Could not upload your files. Please try again.");
    expect(insert).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled(); // nothing had been uploaded yet
  });
});

describe("committed submission survives notification", () => {
  it("does NOT delete media after a successful insert (media stays even as notify runs)", async () => {
    const { remove } = makeBucket();
    const { client } = makeClient({ error: null });
    createPublicClient.mockReturnValue(client);

    const { redirectedTo } = await run(formWithPhoto());
    expect(redirectedTo).toContain("/forms/short1/damage/thanks");
    expect(remove).not.toHaveBeenCalled();
    // C6: the notification is now scheduled rather than awaited. The guarantee under test is unchanged —
    // committed media is never deleted on account of the notification step.
    expect(scheduleSubmissionNotification).toHaveBeenCalledTimes(1);
  });
});

describe("C6 — a notification is scheduled only after a durable commit", () => {
  /**
   * The transaction boundary, asserted from the outside. Each of these paths ends without a committed
   * row, so each must announce nothing: an email naming a submission the admin cannot open is a support
   * call, and on the duplicate path a second email for one logical submission is a duplicate to a real
   * customer.
   */
  it("schedules on a successful insert", async () => {
    const { client } = makeClient({ error: null });
    createPublicClient.mockReturnValue(client);
    const { redirectedTo } = await run(formWithPhoto());

    expect(redirectedTo).toContain("/thanks?ref=SUB-");
    // D2: no call-now flag unless the validated answers ask for it.
    expect(redirectedTo).not.toContain("call=1");
    expect(scheduleSubmissionNotification).toHaveBeenCalledTimes(1);
    // Exactly the immutable values derived during the request — no client, no FormData, no request handle.
    const arg = scheduleSubmissionNotification.mock.calls[0][0] as Record<string, unknown>;
    expect(arg).toMatchObject({ organizationId: "org1", assetId: "asset1", formType: "damage_report" });
    expect(String(arg.reference)).toMatch(/^SUB-\d{4}-[0-9A-F]{6}$/);
    // D1: identifiers only — the browser's contact details are never carried across the commit.
    expect(Object.keys(arg).sort()).toEqual(["assetId", "formType", "organizationId", "reference", "submissionId"]);
  });

  it("does NOT schedule when the insert fails", async () => {
    const { client } = makeClient({ error: { code: "23503" } });
    createPublicClient.mockReturnValue(client);
    const { result } = await run(formWithPhoto());

    expect(result?.error).toBeTruthy();
    expect(scheduleSubmissionNotification).not.toHaveBeenCalled();
  });

  it("does NOT schedule on a duplicate submit — one submission, one logical email", async () => {
    const { client } = makeClient({ error: { code: "23505" } });
    createPublicClient.mockReturnValue(client);
    const { redirectedTo } = await run(formWithPhoto());

    // The renter still gets their confirmation; the original submission already announced itself.
    expect(redirectedTo).toContain("/thanks?ref=SUB-");
    expect(scheduleSubmissionNotification).not.toHaveBeenCalled();
  });

  it("does NOT schedule when the rate limiter rejects the request", async () => {
    checkRateLimit.mockResolvedValue({ allowed: false, shortCodeHash: "h" });
    const { result } = await run(formWithPhoto());

    expect(result?.error).toBe(RATE_LIMITED_MESSAGE);
    expect(scheduleSubmissionNotification).not.toHaveBeenCalled();
  });

  it("does NOT schedule when the asset is not publicly resolvable", async () => {
    resolvePublicEquipment.mockResolvedValue(null);
    const { result } = await run(formWithPhoto());

    expect(result?.error).toBeTruthy();
    expect(scheduleSubmissionNotification).not.toHaveBeenCalled();
  });
});

describe("D2 — the display-only call-now flag on the confirmation redirect", () => {
  it("appends call=1 when the validated answers need immediate attention", async () => {
    const { client, insert } = makeClient({ error: null });
    createPublicClient.mockReturnValue(client);
    const { redirectedTo } = await run(formWithPhoto(), { ...CONFIG, callNow: true });
    expect(redirectedTo).toMatch(/^\/forms\/short1\/damage\/thanks\?ref=SUB-\d{4}-[0-9A-F]{6}&call=1$/);
    // Everything else about the commit is unchanged: one insert, one scheduled notification.
    expect(insert).toHaveBeenCalledTimes(1);
    expect(scheduleSubmissionNotification).toHaveBeenCalledTimes(1);
  });

  it("keeps the flag on the duplicate-submit redirect", async () => {
    const { client } = makeClient({ error: { code: "23505" } });
    createPublicClient.mockReturnValue(client);
    const { redirectedTo } = await run(formWithPhoto(), { ...CONFIG, callNow: true });
    expect(redirectedTo).toContain("&call=1");
    expect(scheduleSubmissionNotification).not.toHaveBeenCalled();
  });

  it("a rate-limited request still returns the generic error, flag or not", async () => {
    checkRateLimit.mockResolvedValue({ allowed: false, shortCodeHash: "h" });
    const { result, redirectedTo } = await run(formWithPhoto(), { ...CONFIG, callNow: true });
    expect(result?.error).toBe(RATE_LIMITED_MESSAGE);
    expect(redirectedTo).toBeUndefined();
  });
});

describe("C6.1 — damage/support revalidation behaviour is unchanged", () => {
  /**
   * The return-checklist fix must not have altered the paths that were already correct. These mirror the
   * assertions in lib/inspections/submit.test.ts so the two public submission cores are held to one rule.
   */
  it("revalidates exactly once on a successful insert", async () => {
    const { client } = makeClient({ error: null });
    createPublicClient.mockReturnValue(client);

    const { redirectedTo } = await run(formWithPhoto());

    expect(revalidateSubmissionSurfaces).toHaveBeenCalledTimes(1);
    expect(redirectedTo).toContain("/thanks?ref=SUB-");
  });

  it("does not revalidate on a duplicate submit", async () => {
    const { client } = makeClient({ error: { code: "23505" } });
    createPublicClient.mockReturnValue(client);

    await run(formWithPhoto());

    expect(revalidateSubmissionSurfaces).not.toHaveBeenCalled();
  });

  it("does not revalidate on an insert failure", async () => {
    const { client } = makeClient({ error: { code: "23503" } });
    createPublicClient.mockReturnValue(client);

    await run(formWithPhoto());

    expect(revalidateSubmissionSurfaces).not.toHaveBeenCalled();
  });

  it("does not revalidate when rate limited", async () => {
    checkRateLimit.mockResolvedValue({ allowed: false, shortCodeHash: "h" });

    await run(formWithPhoto());

    expect(revalidateSubmissionSurfaces).not.toHaveBeenCalled();
  });

  it("does not revalidate when the asset is unavailable", async () => {
    resolvePublicEquipment.mockResolvedValue(null);

    await run(formWithPhoto());

    expect(revalidateSubmissionSurfaces).not.toHaveBeenCalled();
  });
});

describe("direct uploads — finalize with verified claims", () => {
  beforeEach(() => {
    resolvePublicEquipment.mockResolvedValue({ organizationId: ORG, assetId: ASSET });
  });

  it("commits verified claims without re-spending the rate limit, then removes a superseded upload", async () => {
    const { remove, upload } = makeBucket({
      [PHOTO_1]: { size: 2_000_000, mimetype: "image/jpeg", head: JPEG_HEAD },
      [PHOTO_2]: { size: 1_000_000, mimetype: "image/jpeg", head: JPEG_HEAD }, // an earlier attempt's upload
    });
    const { client, insert } = makeClient({ error: null });
    createPublicClient.mockReturnValue(client);

    const { redirectedTo } = await run(directForm([PHOTO_1]));

    expect(redirectedTo).toContain("/forms/short1/damage/thanks?ref=SUB-");
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    expect(insert.mock.calls[0][0]).toMatchObject({ id: SUB, media_urls: [`${PREFIX}/${PHOTO_1}`] });
    expect(remove).toHaveBeenCalledWith([`${PREFIX}/${PHOTO_2}`]);
    expect(scheduleSubmissionNotification).toHaveBeenCalledTimes(1);
  });

  it("refuses a no-JavaScript photo whose bytes are not the declared image, before storing anything", async () => {
    const { upload } = makeBucket();
    const { client, insert } = makeClient({ error: null });
    createPublicClient.mockReturnValue(client);
    const fd = new FormData();
    fd.set("name", "Renter");
    fd.append("media", new File([new Uint8Array([1, 2, 3])], "p.png", { type: "image/png" }));

    const { result } = await run(fd);
    expect(result?.error).toBe("Without JavaScript, photos must be JPG, PNG or WebP images up to 40 megapixels.");
    expect(upload).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("refuses claims sent alongside files, before any work", async () => {
    const fd = directForm([PHOTO_1]);
    fd.append("media", new File([new Uint8Array([1])], "p.png", { type: "image/png" }));
    const { client, insert } = makeClient({ error: null });
    createPublicClient.mockReturnValue(client);

    const { result } = await run(fd);
    expect(result?.error).toBe(MEDIA_VERIFY_FAILED_MESSAGE);
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("refuses malformed claims", async () => {
    const fd = directForm([]);
    fd.set(MEDIA_PATHS_FIELD, "{not json");
    const { result } = await run(fd);
    expect(result?.error).toBe(MEDIA_VERIFY_FAILED_MESSAGE);
  });

  it("refuses a claim on another submission's object and deletes nothing", async () => {
    const { remove } = makeBucket({ [PHOTO_1]: { size: 10, mimetype: "image/jpeg", head: JPEG_HEAD } });
    const { client, insert } = makeClient({ error: null });
    createPublicClient.mockReturnValue(client);

    const { result } = await run(directForm([PHOTO_1], OTHER_SUB));
    expect(result?.error).toBe(MEDIA_VERIFY_FAILED_MESSAGE);
    expect(insert).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("deletes and refuses an object whose bytes are not its declared image type", async () => {
    const { remove } = makeBucket({ [PHOTO_1]: { size: 10, mimetype: "image/jpeg", head: PNG_HEAD } });
    const { client, insert } = makeClient({ error: null });
    createPublicClient.mockReturnValue(client);

    const { result } = await run(directForm([PHOTO_1]));
    expect(result?.error).toBe(MEDIA_VERIFY_FAILED_MESSAGE);
    expect(remove).toHaveBeenCalledWith([`${PREFIX}/${PHOTO_1}`]);
    expect(insert).not.toHaveBeenCalled();
  });

  it("refuses a missing object without deleting anything", async () => {
    const { remove } = makeBucket({});
    const { client, insert } = makeClient({ error: null });
    createPublicClient.mockReturnValue(client);

    const { result } = await run(directForm([PHOTO_1]));
    expect(result?.error).toBe(MEDIA_VERIFY_FAILED_MESSAGE);
    expect(remove).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("a duplicate direct submit deletes nothing — the claims may be the committed submission's media", async () => {
    const { remove } = makeBucket({ [PHOTO_1]: { size: 10, mimetype: "image/jpeg", head: JPEG_HEAD } });
    const { client } = makeClient({ error: { code: "23505" } });
    createPublicClient.mockReturnValue(client);

    const { redirectedTo } = await run(directForm([PHOTO_1]));
    expect(redirectedTo).toContain("/thanks?ref=SUB-");
    expect(remove).not.toHaveBeenCalled();
    expect(scheduleSubmissionNotification).not.toHaveBeenCalled();
  });

  it("a failed direct insert keeps the uploads for a retry", async () => {
    const { remove } = makeBucket({ [PHOTO_1]: { size: 10, mimetype: "image/jpeg", head: JPEG_HEAD } });
    const { client } = makeClient({ error: { code: "23503" } });
    createPublicClient.mockReturnValue(client);

    const { result } = await run(directForm([PHOTO_1]));
    expect(result?.error).toBe("Could not submit the form. Please try again.");
    expect(remove).not.toHaveBeenCalled();
  });
});
