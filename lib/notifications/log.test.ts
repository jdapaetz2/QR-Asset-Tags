import { afterEach, describe, expect, it, vi } from "vitest";

import { emailDomain, logNotificationEvent, redactEmail } from "@/lib/notifications/log";

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
