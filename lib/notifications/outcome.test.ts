import { describe, expect, it } from "vitest";

import { classifyStatus, isDelivered, isFailure, isRetryable } from "@/lib/notifications/outcome";

describe("classifyStatus", () => {
  it("maps 2xx to sent", () => {
    expect(classifyStatus(200)).toBe("sent");
    expect(classifyStatus(202)).toBe("sent");
  });
  it("maps 429 and 5xx to transient", () => {
    expect(classifyStatus(429)).toBe("failed_transient");
    expect(classifyStatus(500)).toBe("failed_transient");
    expect(classifyStatus(503)).toBe("failed_transient");
  });
  it("maps other 4xx to permanent", () => {
    for (const s of [400, 401, 403, 422]) expect(classifyStatus(s)).toBe("failed_permanent");
  });
});

describe("outcome predicates", () => {
  it("only 'sent' counts as delivered (dry_run is NOT sent)", () => {
    expect(isDelivered("sent")).toBe(true);
    expect(isDelivered("dry_run")).toBe(false);
    expect(isDelivered("failed_transient")).toBe(false);
  });
  it("failures are the failed_* outcomes only", () => {
    expect(isFailure("failed_configuration")).toBe(true);
    expect(isFailure("failed_permanent")).toBe(true);
    expect(isFailure("failed_transient")).toBe(true);
    for (const o of ["sent", "dry_run", "skipped_disabled", "skipped_no_recipient"] as const) {
      expect(isFailure(o)).toBe(false);
    }
  });
  it("only transient failures are retryable", () => {
    expect(isRetryable("failed_transient")).toBe(true);
    expect(isRetryable("failed_permanent")).toBe(false);
    expect(isRetryable("failed_configuration")).toBe(false);
  });
});
