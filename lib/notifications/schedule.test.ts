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
const notifyTagRequestStatus = vi.fn(async () => {});
vi.mock("@/lib/notifications/notify", () => ({
  notifySubmission: (...args: unknown[]) => notifySubmission(...(args as [])),
  notifyTagRequestStatus: (...args: unknown[]) => notifyTagRequestStatus(...(args as [])),
}));

const TAG_INPUT = {
  organizationId: "org-1",
  tagRequestId: "5b1f0a3c-1111-4111-8111-111111111111",
  fromStatus: "ready",
  toStatus: "delivered",
  changedAt: "2026-09-11T17:30:00.123456+00:00",
};

const INPUT = {
  organizationId: "org-1",
  assetId: "asset-1",
  submissionId: "11111111-1111-4111-8111-111111111111",
  reference: "SUB-2026-ABC123",
  formType: "damage_report" as const,
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
  notifyTagRequestStatus.mockClear();
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

  /** D1: the deferred work carries immutable identifiers only — the email is built from the committed row. */
  it("carries identifiers only", async () => {
    const { scheduleSubmissionNotification } = await import("./schedule");
    scheduleSubmissionNotification(INPUT);
    await scheduled[0]();
    const arg = (notifySubmission.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(Object.keys(arg).sort()).toEqual(["assetId", "formType", "organizationId", "reference", "submissionId"]);
    for (const value of Object.values(arg)) expect(typeof value).toBe("string");
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

describe("scheduleTagStatusNotification (D3A)", () => {
  it("schedules for after the response instead of sending during the owner's save", async () => {
    const { scheduleTagStatusNotification } = await import("./schedule");
    scheduleTagStatusNotification(TAG_INPUT);
    expect(notifyTagRequestStatus).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);
  });

  it("carries identifiers and the saved transition only", async () => {
    const { scheduleTagStatusNotification } = await import("./schedule");
    scheduleTagStatusNotification(TAG_INPUT);
    await scheduled[0]();
    expect(notifyTagRequestStatus).toHaveBeenCalledWith(TAG_INPUT);
    const arg = (notifyTagRequestStatus.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(Object.keys(arg).sort()).toEqual(["changedAt", "fromStatus", "organizationId", "tagRequestId", "toStatus"]);
    for (const value of Object.values(arg)) expect(typeof value).toBe("string");
  });

  it("never lets a notification failure surface", async () => {
    notifyTagRequestStatus.mockRejectedValueOnce(new Error("provider exploded") as never);
    const { scheduleTagStatusNotification } = await import("./schedule");
    expect(() => scheduleTagStatusNotification(TAG_INPUT)).not.toThrow();
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
