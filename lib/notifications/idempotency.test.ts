import { describe, expect, it } from "vitest";

import {
  MAX_IDEMPOTENCY_KEY_LENGTH,
  notificationIdempotencyKey,
} from "@/lib/notifications/idempotency";

const RECIPIENT = "owner@yard.test";

describe("notificationIdempotencyKey", () => {
  it("is deterministic — the same event, record and recipient always give the same key", () => {
    const a = notificationIdempotencyKey({ event: "submission", reference: "sub-1", recipient: RECIPIENT });
    const b = notificationIdempotencyKey({ event: "submission", reference: "sub-1", recipient: RECIPIENT });
    expect(a).toBe(b);
  });

  it("separates the two event types so a submission can never dedupe against a tag update", () => {
    expect(
      notificationIdempotencyKey({ event: "submission", reference: "x", recipient: RECIPIENT })
    ).not.toBe(
      notificationIdempotencyKey({ event: "tag_status", reference: "x", recipient: RECIPIENT })
    );
  });

  it("separates different records of the same type", () => {
    expect(
      notificationIdempotencyKey({ event: "submission", reference: "sub-1", recipient: RECIPIENT })
    ).not.toBe(
      notificationIdempotencyKey({ event: "submission", reference: "sub-2", recipient: RECIPIENT })
    );
  });

  /**
   * The tag-request case that matters: a real status CHANGE must send, a replay of the same status
   * must not. The caller encodes the status into the reference; this asserts the key follows.
   */
  it("treats each tag-request status transition as its own notification", () => {
    const requested = notificationIdempotencyKey({
      event: "tag_status",
      reference: "tr-9:requested",
      recipient: RECIPIENT,
    });
    const delivered = notificationIdempotencyKey({
      event: "tag_status",
      reference: "tr-9:delivered",
      recipient: RECIPIENT,
    });
    expect(requested).not.toBe(delivered);
    // …and the same transition replayed is the same key, so Resend drops it.
    expect(
      notificationIdempotencyKey({ event: "tag_status", reference: "tr-9:delivered", recipient: RECIPIENT })
    ).toBe(delivered);
  });

  /**
   * Resend dedupes on the key ALONE. Without the recipient bound in, changing an org's notification
   * address inside the 24 h window would silently swallow the message to the new address.
   */
  it("changes when the recipient changes", () => {
    expect(
      notificationIdempotencyKey({ event: "submission", reference: "sub-1", recipient: "a@yard.test" })
    ).not.toBe(
      notificationIdempotencyKey({ event: "submission", reference: "sub-1", recipient: "b@yard.test" })
    );
  });

  it("is case- and whitespace-insensitive on the recipient (same mailbox, same key)", () => {
    expect(
      notificationIdempotencyKey({ event: "submission", reference: "sub-1", recipient: " Owner@Yard.TEST " })
    ).toBe(
      notificationIdempotencyKey({ event: "submission", reference: "sub-1", recipient: RECIPIENT })
    );
  });

  it("never contains the recipient address in the clear — it travels in a header and into logs", () => {
    const key = notificationIdempotencyKey({
      event: "submission",
      reference: "sub-1",
      recipient: RECIPIENT,
    });
    expect(key).not.toContain("owner@yard.test");
    expect(key).not.toContain("owner");
    expect(key).not.toContain("yard.test");
  });

  it("stays inside Resend's 256-character header limit even for an absurd reference", () => {
    const key = notificationIdempotencyKey({
      event: "submission",
      reference: "x".repeat(1000),
      recipient: RECIPIENT,
    });
    expect(key.length).toBeLessThanOrEqual(MAX_IDEMPOTENCY_KEY_LENGTH);
  });

  it("produces a header-safe token and degrades a blank reference rather than collapsing it", () => {
    expect(notificationIdempotencyKey({ event: "submission", reference: "a b/c", recipient: RECIPIENT }))
      .toMatch(/^mm\.submission\.[a-z0-9:_-]+\.[0-9a-f]{8}$/);
    expect(notificationIdempotencyKey({ event: "submission", reference: "   ", recipient: RECIPIENT }))
      .toContain(".unknown.");
  });
});
