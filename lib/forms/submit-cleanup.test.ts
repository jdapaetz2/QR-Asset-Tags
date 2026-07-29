import { beforeEach, describe, expect, it, vi } from "vitest";

// Behavioral tests for the public submit core's Phase A4 guarantees, with the DB/storage/limiter mocked:
// no upload after a preflight reject; cleanup after insert failure; PK-conflict → cleanup + idempotent
// success; committed submission survives a notification step (media never deleted after commit).

// Hoisted so the vi.mock factories (also hoisted) can safely reference these mocks.
const { checkRateLimit, resolvePublicEquipment, createPublicClient, notifySubmission, redirect } =
  vi.hoisted(() => ({
    checkRateLimit: vi.fn(),
    resolvePublicEquipment: vi.fn(),
    createPublicClient: vi.fn(),
    notifySubmission: vi.fn(),
    redirect: vi.fn((url: string) => {
      throw new Error(`REDIRECT:${url}`);
    }),
  }));

vi.mock("@/lib/ratelimit/limiter", () => ({ checkRateLimit }));
vi.mock("@/lib/public/resolve", () => ({ resolvePublicEquipment }));
vi.mock("@/lib/supabase/public", () => ({ createPublicClient }));
vi.mock("@/lib/notifications/notify", () => ({ notifySubmission }));
vi.mock("@/lib/submissions/revalidate", () => ({ revalidateSubmissionSurfaces: vi.fn() }));
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
  notifySubmission.mockResolvedValue(undefined);
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
    expect(notifySubmission).toHaveBeenCalledTimes(1);
  });
});
