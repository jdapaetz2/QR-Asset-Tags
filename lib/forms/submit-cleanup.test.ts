import { beforeEach, describe, expect, it, vi } from "vitest";

// Behavioral tests for the public submit core's Phase A4 guarantees, with the DB/storage/limiter mocked:
// no upload after a preflight reject; cleanup after insert failure; PK-conflict → cleanup + idempotent
// success; committed submission survives a notification step (media never deleted after commit).
//
// Phase C6 adds the transaction-boundary guarantee that deferral makes load-bearing: a notification is
// scheduled ONLY once a row is durably committed. Announcing a submission that does not exist would be
// worse than not announcing one that does.

// Hoisted so the vi.mock factories (also hoisted) can safely reference these mocks.
const {
  checkRateLimit,
  resolvePublicEquipment,
  createPublicClient,
  scheduleSubmissionNotification,
  revalidateSubmissionSurfaces,
  redirect,
} =
  vi.hoisted(() => ({
    checkRateLimit: vi.fn(),
    resolvePublicEquipment: vi.fn(),
    createPublicClient: vi.fn(),
    // Phase C6: the core now SCHEDULES the notification instead of awaiting it.
    scheduleSubmissionNotification: vi.fn(),
    // Phase C6.1: asserted here so the damage/support paths are proved UNCHANGED by the return fix.
    revalidateSubmissionSurfaces: vi.fn(),
    redirect: vi.fn((url: string) => {
      throw new Error(`REDIRECT:${url}`);
    }),
  }));

vi.mock("@/lib/ratelimit/limiter", () => ({ checkRateLimit }));
vi.mock("@/lib/public/resolve", () => ({ resolvePublicEquipment }));
vi.mock("@/lib/supabase/public", () => ({ createPublicClient }));
vi.mock("@/lib/notifications/schedule", () => ({ scheduleSubmissionNotification }));
vi.mock("@/lib/submissions/revalidate", () => ({ revalidateSubmissionSurfaces }));
vi.mock("next/navigation", () => ({ redirect }));

import { submitPublicForm, type PublicFormConfig } from "@/lib/forms/submit";
import { RATE_LIMITED_MESSAGE } from "@/lib/ratelimit/policy";

const CONFIG: PublicFormConfig = {
  formType: "damage_report",
  thanksSlug: "damage",
  fieldError: null,
  submittedBy: { name: "R", email: null, phone: null },
  dataJson: {},
};

function makeClient(insertResult: { error: { code?: string } | null }) {
  const remove = vi.fn(async (paths: string[]) => ({ data: paths.map((name) => ({ name })), error: null }));
  const upload = vi.fn(async () => ({ error: null }));
  const insert = vi.fn(async () => insertResult);
  const client = { storage: { from: () => ({ upload, remove }) }, from: () => ({ insert }) };
  return { client, remove, upload, insert };
}

function formWithPhoto(): FormData {
  const fd = new FormData();
  fd.set("name", "Renter");
  fd.append("media", new File([new Uint8Array([1, 2, 3])], "p.png", { type: "image/png" }));
  return fd;
}

async function run(fd: FormData): Promise<{ result?: { error?: string }; redirectedTo?: string }> {
  try {
    const result = await submitPublicForm("short1", fd, CONFIG);
    return { result };
  } catch (err) {
    const m = (err as Error).message;
    if (m.startsWith("REDIRECT:")) return { redirectedTo: m.slice("REDIRECT:".length) };
    throw err;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimit.mockResolvedValue({ allowed: true, retryAfter: 0, shortCodeHash: "sch" });
  resolvePublicEquipment.mockResolvedValue({ organizationId: "org1", assetId: "asset1" });
  scheduleSubmissionNotification.mockReturnValue(undefined);
});

describe("preflight rate limit", () => {
  it("a limited request does NOT resolve, upload, or insert — generic message, no cost", async () => {
    checkRateLimit.mockResolvedValue({ allowed: false, retryAfter: 30, shortCodeHash: "sch" });
    const { client, upload, insert } = makeClient({ error: null });
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
    const { client, remove, upload } = makeClient({ error: { code: "23503" } });
    createPublicClient.mockReturnValue(client);

    const { result } = await run(formWithPhoto());
    expect(upload).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
    // Removed exactly this request's uploaded path (one object).
    expect(remove.mock.calls[0][0]).toHaveLength(1);
    expect(result?.error).toBeTruthy();
  });

  it("a duplicate submit (PK 23505) cleans this call's re-uploads and redirects (idempotent success)", async () => {
    const { client, remove } = makeClient({ error: { code: "23505" } });
    createPublicClient.mockReturnValue(client);

    const { redirectedTo, result } = await run(formWithPhoto());
    expect(remove).toHaveBeenCalledTimes(1);
    expect(result?.error).toBeUndefined();
    expect(redirectedTo).toContain("/forms/short1/damage/thanks");
  });
});

describe("committed submission survives notification", () => {
  it("does NOT delete media after a successful insert (media stays even as notify runs)", async () => {
    const { client, remove } = makeClient({ error: null });
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
