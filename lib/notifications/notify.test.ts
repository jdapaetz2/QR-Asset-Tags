import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The notifier is submission-safety-critical: it must classify skip reasons, pass through the send
// outcome, and NEVER throw (a notification failure can't break the submission that triggered it).

type SendArgs = [
  to: string,
  content: { subject: string; text: string; html: string },
  deps: Record<string, unknown>,
  options: { idempotencyKey?: string; replyTo?: string },
];

const { state, sendMock, logMock } = vi.hoisted(() => ({
  state: {
    orgRow: null as Record<string, unknown> | null,
    sendResult: { outcome: "dry_run", attempts: 0 } as {
      outcome: string;
      attempts: number;
      providerId?: string;
      reason?: string;
    },
    sendThrows: false,
  },
  sendMock: vi.fn(async (..._args: SendArgs) => {
    if (state.sendThrows) throw new Error("boom");
    return state.sendResult;
  }),
  logMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data:
              table === "organizations"
                ? state.orgRow
                : { asset_code: "A-1", asset_name: "Asset", category: "Excavator" },
          }),
        }),
      }),
    }),
  }),
}));
vi.mock("@/lib/notifications/send", () => ({ sendNotificationEmail: sendMock }));
vi.mock("@/lib/notifications/log", () => ({ logNotificationEvent: logMock }));

import { notifySubmission, notifyTagRequestStatus } from "@/lib/notifications/notify";
import { notificationIdempotencyKey } from "@/lib/notifications/idempotency";

function orgWith(overrides: Record<string, unknown>) {
  return {
    name: "Org",
    notification_email: "owner@yard.test",
    notify_damage_reports: true,
    notify_support_requests: true,
    notify_return_checklists: true,
    notify_tag_request_updates: true,
    ...overrides,
  };
}

const baseInput = {
  organizationId: "org-1",
  formType: "damage_report" as const,
  assetId: "asset-1",
  submittedBy: { name: "R", email: null, phone: null },
  submissionId: "sub-1",
  reference: "SUB-2026-000001",
};

beforeEach(() => {
  vi.clearAllMocks();
  state.sendThrows = false;
  state.sendResult = { outcome: "dry_run", attempts: 0 };
  // notify.ts builds an admin URL from publicEnv.siteUrl; give it the canonical production host so
  // the link assertions below exercise the real B3 value rather than a localhost placeholder.
  process.env.NEXT_PUBLIC_SITE_URL = "https://mulemark.io";
  process.env.NOTIFICATION_REPLY_TO_EMAIL = "support@mulemark.io";
});

afterEach(() => {
  delete process.env.NOTIFICATION_REPLY_TO_EMAIL;
});

describe("notifySubmission skip classification", () => {
  it("logs skipped_no_recipient and does NOT send when no notification_email", async () => {
    state.orgRow = orgWith({ notification_email: null });
    await notifySubmission(baseInput);
    expect(sendMock).not.toHaveBeenCalled();
    expect(logMock).toHaveBeenCalledWith(expect.objectContaining({ outcome: "skipped_no_recipient" }));
  });

  it("logs skipped_disabled and does NOT send when the form-type flag is off", async () => {
    state.orgRow = orgWith({ notify_damage_reports: false });
    await notifySubmission(baseInput);
    expect(sendMock).not.toHaveBeenCalled();
    expect(logMock).toHaveBeenCalledWith(expect.objectContaining({ outcome: "skipped_disabled" }));
  });
});

describe("notifySubmission send passthrough", () => {
  it("passes the send outcome through to the log (dry_run)", async () => {
    state.orgRow = orgWith({});
    await notifySubmission(baseInput);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(logMock).toHaveBeenCalledWith(expect.objectContaining({ outcome: "dry_run" }));
  });

  it("records a sent outcome with the provider id", async () => {
    state.orgRow = orgWith({});
    state.sendResult = { outcome: "sent", attempts: 1, providerId: "resend-9" };
    await notifySubmission(baseInput);
    expect(logMock).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "sent", providerId: "resend-9" })
    );
  });
});

describe("submission-safety", () => {
  it("never throws even if the sender throws, and logs a failure", async () => {
    state.orgRow = orgWith({});
    state.sendThrows = true;
    await expect(notifySubmission(baseInput)).resolves.toBeUndefined();
    expect(logMock).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "failed_transient", failureClass: "exception" })
    );
  });
});

// ---------------------------------------------------------------------------
// Phase B4 — what the orchestrator hands the sender, and what reaches the log.
// ---------------------------------------------------------------------------

/** The 4th argument of sendNotificationEmail: { idempotencyKey, replyTo }. */
function sendOptions(call = 0) {
  return sendMock.mock.calls[call][3];
}

function sentContent(call = 0) {
  return sendMock.mock.calls[call][1];
}

describe("notifySubmission — provider options (B4)", () => {
  beforeEach(() => {
    state.orgRow = orgWith({});
  });

  it("derives the idempotency key from the submission id and the recipient", async () => {
    await notifySubmission(baseInput);
    expect(sendOptions().idempotencyKey).toBe(
      notificationIdempotencyKey({ event: "submission", reference: "sub-1", recipient: "owner@yard.test" })
    );
  });

  /**
   * A submission notifies exactly once, ever. A replayed server action must therefore produce the
   * SAME key, so the provider drops the second message rather than emailing the yard twice.
   */
  it("produces an identical key on a replay of the same submission", async () => {
    await notifySubmission(baseInput);
    await notifySubmission(baseInput);
    expect(sendOptions(0).idempotencyKey).toBe(sendOptions(1).idempotencyKey);
  });

  it("produces a different key for a different submission", async () => {
    await notifySubmission(baseInput);
    await notifySubmission({ ...baseInput, submissionId: "sub-2" });
    expect(sendOptions(0).idempotencyKey).not.toBe(sendOptions(1).idempotencyKey);
  });

  it("passes the configured Reply-To through to the sender", async () => {
    await notifySubmission(baseInput);
    expect(sendOptions().replyTo).toBe("support@mulemark.io");
  });

  it("passes an empty Reply-To when unset — the sender then omits the field", async () => {
    delete process.env.NOTIFICATION_REPLY_TO_EMAIL;
    await notifySubmission(baseInput);
    expect(sendOptions().replyTo).toBe("");
  });

  it("builds every link on the canonical production host", async () => {
    await notifySubmission(baseInput);
    const { text } = sentContent();
    expect(text).toContain("https://mulemark.io/dashboard/submissions/sub-1");
    expect(text).toContain("https://mulemark.io/dashboard/settings");
    expect(text).not.toContain("vercel.app");
    expect(text).not.toContain("localhost");
  });

  it("carries no private media or signed URL into the message", async () => {
    await notifySubmission(baseInput);
    const { text, html } = sentContent();
    for (const banned of ["/storage/v1/", "signedurl", "token=", "supabase.co"]) {
      expect(text.toLowerCase()).not.toContain(banned);
      expect(html.toLowerCase()).not.toContain(banned);
    }
  });

  it("records the dry-run reason so an operator can see WHY nothing was sent", async () => {
    state.sendResult = { outcome: "dry_run", attempts: 0, reason: "preview_environment" };
    await notifySubmission(baseInput);
    expect(logMock).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "dry_run", reason: "preview_environment" })
    );
  });
});

describe("notifyTagRequestStatus (B4)", () => {
  const tagInput = { organizationId: "org-1", tagRequestId: "tr-9", status: "in_production" };

  beforeEach(() => {
    state.orgRow = orgWith({});
  });

  it("sends, and logs the tag request id as the canonical reference", async () => {
    await notifyTagRequestStatus(tagInput);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(logMock).toHaveBeenCalledWith(
      expect.objectContaining({ event: "tag_status", reference: "tr-9" })
    );
  });

  /**
   * The distinction that makes tag mail correct: a real status CHANGE must send, a replay of the same
   * status must not.
   */
  it("keys on the request AND its status", async () => {
    await notifyTagRequestStatus(tagInput);
    await notifyTagRequestStatus(tagInput);
    await notifyTagRequestStatus({ ...tagInput, status: "delivered" });
    expect(sendOptions(0).idempotencyKey).toBe(sendOptions(1).idempotencyKey);
    expect(sendOptions(2).idempotencyKey).not.toBe(sendOptions(0).idempotencyKey);
  });

  it("skips a disabled org and still records the reference", async () => {
    state.orgRow = orgWith({ notify_tag_request_updates: false });
    await notifyTagRequestStatus(tagInput);
    expect(sendMock).not.toHaveBeenCalled();
    expect(logMock).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "skipped_disabled", reference: "tr-9" })
    );
  });

  it("skips an org with no recipient", async () => {
    state.orgRow = orgWith({ notification_email: null });
    await notifyTagRequestStatus(tagInput);
    expect(sendMock).not.toHaveBeenCalled();
    expect(logMock).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "skipped_no_recipient", reference: "tr-9" })
    );
  });

  it("never throws when the sender throws — a status update must survive a mail failure", async () => {
    state.sendThrows = true;
    await expect(notifyTagRequestStatus(tagInput)).resolves.toBeUndefined();
    expect(logMock).toHaveBeenCalledWith(
      expect.objectContaining({ event: "tag_status", failureClass: "exception", reference: "tr-9" })
    );
  });
});
