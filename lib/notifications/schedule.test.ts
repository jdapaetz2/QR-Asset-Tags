import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Captures what `scheduleSubmissionNotification` hands to `after()`, so it can be run deliberately. */
const scheduled: (() => unknown)[] = [];
vi.mock("next/server", () => ({
  after: (fn: () => unknown) => {
    scheduled.push(fn);
  },
}));

const notifySubmission = vi.fn(async () => {});
vi.mock("@/lib/notifications/notify", () => ({
  notifySubmission: (...args: unknown[]) => notifySubmission(...(args as [])),
}));

const INPUT = {
  organizationId: "org-1",
  formType: "damage_report" as const,
  assetId: "asset-1",
  submittedBy: { name: "Rita", email: "rita@example.test", phone: null },
  submissionId: "11111111-1111-4111-8111-111111111111",
  reference: "SUB-2026-ABC123",
};

/**
 * Source with comments stripped — the doc comments deliberately discuss `headers()`/`cookies()` to
 * explain why they are absent, so a raw text match would fail on the prose documenting the rule.
 */
function codeOf(url: string): string {
  return readFileSync(fileURLToPath(new URL(url, import.meta.url)), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

beforeEach(() => {
  scheduled.length = 0;
  notifySubmission.mockClear();
});
afterEach(() => vi.restoreAllMocks());

describe("scheduleSubmissionNotification", () => {
  it("does not send during the request — it schedules for after the response", async () => {
    const { scheduleSubmissionNotification } = await import("./schedule");
    scheduleSubmissionNotification(INPUT);

    // The whole point: nothing has contacted the provider by the time the renter is redirected.
    expect(notifySubmission).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);
  });

  it("runs the notification with the values captured at request time", async () => {
    const { scheduleSubmissionNotification } = await import("./schedule");
    scheduleSubmissionNotification(INPUT);

    await scheduled[0]();

    expect(notifySubmission).toHaveBeenCalledTimes(1);
    expect(notifySubmission).toHaveBeenCalledWith(INPUT);
  });

  it("schedules exactly one notification per call", async () => {
    const { scheduleSubmissionNotification } = await import("./schedule");
    scheduleSubmissionNotification(INPUT);
    expect(scheduled).toHaveLength(1);
  });

  /** `notifySubmission` swallows everything; this proves the wrapper adds no new throw of its own. */
  it("never lets a notification failure surface", async () => {
    notifySubmission.mockRejectedValueOnce(new Error("provider exploded") as never);
    const { scheduleSubmissionNotification } = await import("./schedule");

    expect(() => scheduleSubmissionNotification(INPUT)).not.toThrow();
    // The callback rejecting would become an unhandled rejection in the runtime after the response.
    await expect(Promise.resolve(scheduled[0]()).catch(() => "caught")).resolves.toBeDefined();
  });
});

describe("the scheduler holds no request API", () => {
  const source = codeOf("./schedule.ts");

  it("does not import next/headers or next/navigation", () => {
    expect(source).not.toContain("next/headers");
  });

  it("does not call headers() or cookies() in the deferred callback", () => {
    expect(source).not.toMatch(/\bheaders\(\)/);
    expect(source).not.toMatch(/\bcookies\(\)/);
  });
});
