import { beforeEach, describe, expect, it, vi } from "vitest";

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
 */

const {
  checkRateLimit,
  resolvePublicEquipment,
  createPublicClient,
  scheduleSubmissionNotification,
  revalidateSubmissionSurfaces,
  resolveReturnTemplate,
  logAbuseEvent,
  redirect,
} = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  resolvePublicEquipment: vi.fn(),
  createPublicClient: vi.fn(),
  scheduleSubmissionNotification: vi.fn(),
  revalidateSubmissionSurfaces: vi.fn(),
  resolveReturnTemplate: vi.fn(),
  logAbuseEvent: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("@/lib/ratelimit/limiter", () => ({ checkRateLimit }));
vi.mock("@/lib/ratelimit/log", () => ({ logAbuseEvent }));
vi.mock("@/lib/public/resolve", () => ({ resolvePublicEquipment }));
vi.mock("@/lib/supabase/public", () => ({ createPublicClient }));
vi.mock("@/lib/notifications/schedule", () => ({ scheduleSubmissionNotification }));
vi.mock("@/lib/submissions/revalidate", () => ({ revalidateSubmissionSurfaces }));
vi.mock("@/lib/inspections/resolve", () => ({ resolveReturnTemplate }));
vi.mock("next/navigation", () => ({ redirect }));

import { submitReturnInspectionCore } from "@/lib/inspections/submit";
import { RATE_LIMITED_MESSAGE } from "@/lib/ratelimit/policy";
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

/** A template WITH a photo slot, for the upload-failure path. */
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

function makeClient(insertResult: { error: { code?: string } | null }, uploadFails = false) {
  const remove = vi.fn(async (paths: string[]) => ({ data: paths.map((name) => ({ name })), error: null }));
  const upload = vi.fn(async () => (uploadFails ? { error: { message: "denied" } } : { error: null }));
  const insert = vi.fn(async () => insertResult);
  return {
    client: { storage: { from: () => ({ upload, remove }) }, from: () => ({ insert }) },
    remove,
    upload,
    insert,
  };
}

function baseForm(): FormData {
  const fd = new FormData();
  fd.set("name", "Renter Rita");
  fd.set("answer:damage_observed", "no");
  return fd;
}

function formWithPhoto(): FormData {
  const fd = baseForm();
  fd.append("photo:overall", new File([new Uint8Array([1, 2, 3])], "p.png", { type: "image/png" }));
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
    const { client, upload, insert } = makeClient({ error: null });
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
    const { client, insert } = makeClient({ error: null }, /* uploadFails */ true);
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
});
