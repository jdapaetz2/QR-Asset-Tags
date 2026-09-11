import { afterEach, describe, expect, it, vi } from "vitest";

import { emailDomain, logDigestRun, logNotificationEvent, redactEmail } from "@/lib/notifications/log";

afterEach(() => vi.restoreAllMocks());

describe("emailDomain", () => {
  it("extracts the domain, lowercased", () => {
    expect(emailDomain("Owner@Yard.TEST")).toBe("yard.test");
  });
  it("returns 'unknown' for junk/empty", () => {
    expect(emailDomain(null)).toBe("unknown");
    expect(emailDomain("noat")).toBe("unknown");
  });
});

describe("redactEmail", () => {
  it("keeps only the first char + domain", () => {
    expect(redactEmail("owner@yard.test")).toBe("o***@yard.test");
  });
  it("never returns the full local part", () => {
    expect(redactEmail("jsmith@big.co")).not.toContain("jsmith");
  });
  it("handles missing/garbage safely", () => {
    expect(redactEmail(null)).toBe("none");
    expect(redactEmail("@x")).toBe("redacted");
  });
});

describe("logNotificationEvent", () => {
  it("emits a redacted line (outcome + redacted recipient), never the full address or a secret", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    logNotificationEvent({
      event: "submission",
      outcome: "dry_run",
      organizationId: "org-1",
      reference: "SUB-2026-000001",
      recipient: "owner@yard.test",
    });
    expect(info).toHaveBeenCalledTimes(1);
    const line = info.mock.calls[0].join(" ");
    expect(line).toContain('"outcome":"dry_run"');
    expect(line).toContain('"recipientRedacted":"o***@yard.test"');
    expect(line).toContain('"recipientDomain":"yard.test"');
    expect(line).not.toContain("owner@yard.test"); // full address never logged
  });

  it("routes genuine failures to console.error, dry-run/skips to console.info", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    logNotificationEvent({ event: "submission", outcome: "skipped_disabled", organizationId: "o" });
    logNotificationEvent({ event: "submission", outcome: "failed_transient", organizationId: "o", failureClass: "http_500" });
    expect(info).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0].join(" ")).toContain('"outcome":"failed_transient"');
  });

  it("dry-run is never labeled sent", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    logNotificationEvent({ event: "tag_status", outcome: "dry_run", organizationId: "o" });
    expect(info.mock.calls[0].join(" ")).not.toContain('"outcome":"sent"');
  });
});

describe("routing metadata (D3A)", () => {
  function payloadOf(spy: { mock: { calls: unknown[][] } }, call = 0): Record<string, unknown> {
    return JSON.parse(String(spy.mock.calls[call][1]));
  }

  it("records the route and preview counts, keeping every existing field", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    logNotificationEvent({
      event: "submission",
      outcome: "dry_run",
      organizationId: "o",
      reference: "SUB-2026-000001",
      recipient: "oncall@yard.test",
      recipientRoute: "urgent",
      previewRequestedCount: 2,
      previewAttachedCount: 0,
    });
    const payload = payloadOf(info);
    expect(payload).toMatchObject({
      recipientRoute: "urgent",
      previewRequestedCount: 2,
      previewAttachedCount: 0,
      digestItemCount: null,
    });
    for (const key of [
      "tag", "event", "outcome", "organizationId", "reference", "recipientDomain", "recipientRedacted",
      "providerId", "providerStatus", "attempts", "failureClass", "reason", "deploymentContext",
    ]) {
      expect(payload, `existing field ${key}`).toHaveProperty(key);
    }
  });

  it("is null for events without routing metadata", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    logNotificationEvent({ event: "tag_status", outcome: "skipped_disabled", organizationId: "o" });
    expect(payloadOf(info)).toMatchObject({
      recipientRoute: null,
      previewRequestedCount: null,
      previewAttachedCount: null,
      digestItemCount: null,
    });
  });

  it("accepts only the bounded route enum", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    for (const route of ["main", "urgent", "main_and_urgent", "digest"] as const) {
      logNotificationEvent({ event: "submission", outcome: "dry_run", organizationId: "o", recipientRoute: route });
    }
    logNotificationEvent({
      event: "submission",
      outcome: "dry_run",
      organizationId: "o",
      recipientRoute: "oncall@yard.test" as never,
    });
    expect(info.mock.calls.map((_, i) => payloadOf(info, i).recipientRoute)).toEqual([
      "main", "urgent", "main_and_urgent", "digest", null,
    ]);
    expect(info.mock.calls[4].join(" ")).not.toContain("oncall@yard.test");
  });

  it("clamps counts to bounded non-negative integers", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    logNotificationEvent({
      event: "submission",
      outcome: "dry_run",
      organizationId: "o",
      previewRequestedCount: 999,
      previewAttachedCount: -4,
      digestItemCount: 12.7,
    });
    expect(payloadOf(info)).toMatchObject({ previewRequestedCount: 10, previewAttachedCount: 0, digestItemCount: 12 });
  });

  it("never logs the full recipient on either route", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    logNotificationEvent({
      event: "submission",
      outcome: "sent",
      organizationId: "o",
      recipient: "oncall.team@yard.test",
      recipientRoute: "main_and_urgent",
      previewRequestedCount: 3,
      previewAttachedCount: 0,
    });
    const line = info.mock.calls[0].join(" ");
    expect(line).not.toContain("oncall.team@yard.test");
    expect(line).not.toContain("oncall.team");
  });
});

describe("daily summary run line (D3B)", () => {
  const run = {
    outcome: "completed" as const,
    pacificDate: "2026-07-15",
    pacificHour: 6,
    organizations: 4,
    sent: 2,
    quiet: 1,
    failed: 0,
    skipped: 1,
  };

  it("logs counts and the Pacific date/hour only", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    logDigestRun(run);
    const payload = JSON.parse(String(info.mock.calls[0][1]));
    expect(payload).toMatchObject({ tag: "notifications", event: "return_digest_run", ...run });
    expect(Object.keys(payload).sort()).toEqual(
      ["deploymentContext", "event", "failed", "organizations", "outcome", "pacificDate", "pacificHour", "quiet", "sent", "skipped", "tag"].sort()
    );
  });

  it("bounds every field and sends an incomplete run to the error stream", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    logDigestRun({ ...run, outcome: "incomplete", pacificDate: "not a date <script>", pacificHour: 99, sent: -3 });
    const payload = JSON.parse(String(error.mock.calls[0][1]));
    expect(payload).toMatchObject({ outcome: "incomplete", pacificDate: null, pacificHour: 23, sent: 0 });
  });
});

describe("dry-run reason (B4)", () => {
  it("records WHY a send was dry — the preview rule vs missing configuration", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    logNotificationEvent({
      event: "submission",
      outcome: "dry_run",
      organizationId: "o",
      reason: "preview_environment",
    });
    logNotificationEvent({
      event: "submission",
      outcome: "dry_run",
      organizationId: "o",
      reason: "unconfigured",
    });
    expect(info.mock.calls[0].join(" ")).toContain('"reason":"preview_environment"');
    expect(info.mock.calls[1].join(" ")).toContain('"reason":"unconfigured"');
  });

  it("is null for outcomes that have no reason, rather than absent", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    logNotificationEvent({ event: "submission", outcome: "sent", organizationId: "o", providerId: "p" });
    expect(info.mock.calls[0].join(" ")).toContain('"reason":null');
  });

  /**
   * The redaction contract has to hold for every field, not just the ones A5 shipped. A new field is
   * exactly how a full address or a key leaks into logs.
   */
  it("still leaks nothing when every optional field is populated", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    logNotificationEvent({
      event: "tag_status",
      outcome: "failed_permanent",
      organizationId: "org-1",
      reference: "tr-9",
      recipient: "owner@yard.test",
      providerId: "resend-1",
      providerStatus: 422,
      attempts: 1,
      failureClass: "http_422",
      reason: null,
    });
    const line = error.mock.calls[0].join(" ");
    expect(line).not.toContain("owner@yard.test");
    expect(line).not.toMatch(/re_[A-Za-z0-9]/);
    expect(line).toContain('"reference":"tr-9"');
  });
});
