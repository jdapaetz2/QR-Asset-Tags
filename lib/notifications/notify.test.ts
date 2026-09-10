import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ASSET_ID,
  CLEAN_FLAGS,
  ORG_ID,
  OTHER_ORG_ID,
  SUBMISSION_ID,
  cleanGeneratorValues,
  damageRow,
  mediaPath,
  returnRowV2,
  templateV2_20260702,
} from "./__fixtures__/rows";

// The notifier is submission-safety-critical: it must classify skip reasons, build the email from the COMMITTED
// row (Phase D1), refuse anything that does not match what was scheduled, pass through the send outcome, and NEVER
// throw — a notification failure can't break the submission that triggered it.

type SendArgs = [
  to: string,
  content: { subject: string; text: string; html: string },
  deps: Record<string, unknown>,
  options: { idempotencyKey?: string; replyTo?: string },
];

const { state, sendMock, logMock, timeMock } = vi.hoisted(() => ({
  state: {
    orgRow: null as Record<string, unknown> | null,
    submissionRow: null as Record<string, unknown> | null,
    submissionError: null as unknown,
    assetRow: null as Record<string, unknown> | null,
    queries: [] as { table: string; column: string; value: unknown }[],
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
  timeMock: vi.fn(async (_route: string, _phase: string, work: () => Promise<unknown>) => work()),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          state.queries.push({ table, column, value });
          return builder;
        },
        maybeSingle: async () => {
          if (table === "organizations") return { data: state.orgRow, error: null };
          if (table === "form_submissions") return { data: state.submissionRow, error: state.submissionError };
          return { data: state.assetRow, error: null };
        },
      };
      return builder;
    },
  }),
}));
vi.mock("@/lib/notifications/send", () => ({ sendNotificationEmail: sendMock }));
vi.mock("@/lib/notifications/log", () => ({ logNotificationEvent: logMock }));
vi.mock("@/lib/diagnostics/server-timing", () => ({ time: timeMock }));

import { notifySubmission, notifyTagRequestStatus } from "@/lib/notifications/notify";
import { notificationIdempotencyKey } from "@/lib/notifications/idempotency";

function orgWith(overrides: Record<string, unknown>) {
  return {
    name: "Northridge Rentals",
    notification_email: "owner@yard.test",
    notify_damage_reports: true,
    notify_support_requests: true,
    notify_return_checklists: true,
    notify_tag_request_updates: true,
    ...overrides,
  };
}

const baseInput = {
  organizationId: ORG_ID,
  assetId: ASSET_ID,
  submissionId: SUBMISSION_ID,
  reference: "SUB-2026-7C0A55",
  formType: "damage_report" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  state.orgRow = orgWith({});
  state.submissionRow = damageRow(
    { urgency: "high", description: "Hydraulic hose is weeping at the boom coupling." },
    { submitted_by_name: "Saved Name", media_urls: [mediaPath("damage-1")] }
  );
  state.submissionError = null;
  state.assetRow = { asset_code: "EXC-001", asset_name: "Mini Excavator", category: "Excavators" };
  state.queries = [];
  state.sendThrows = false;
  state.sendResult = { outcome: "dry_run", attempts: 0 };
  // notify.ts builds links from publicEnv.siteUrl; give it the canonical production host.
  process.env.NEXT_PUBLIC_SITE_URL = "https://mulemark.io";
  process.env.NOTIFICATION_REPLY_TO_EMAIL = "support@mulemark.io";
});

afterEach(() => {
  delete process.env.NOTIFICATION_REPLY_TO_EMAIL;
});

/** The 4th argument of sendNotificationEmail: { idempotencyKey, replyTo }. */
function sendOptions(call = 0) {
  return sendMock.mock.calls[call][3];
}

function sentContent(call = 0) {
  return sendMock.mock.calls[call][1];
}

function loggedFailure() {
  return logMock.mock.calls.map((call) => call[0]).find((fields) => fields.outcome === "failed_transient");
}

describe("notifySubmission skip classification", () => {
  it("logs skipped_no_recipient, does NOT send, and does not load the submission", async () => {
    state.orgRow = orgWith({ notification_email: null });
    await notifySubmission(baseInput);
    expect(sendMock).not.toHaveBeenCalled();
    expect(logMock).toHaveBeenCalledWith(expect.objectContaining({ outcome: "skipped_no_recipient" }));
    expect(state.queries.some((query) => query.table === "form_submissions")).toBe(false);
  });

  it("logs skipped_disabled and does NOT send when the form-type flag is off", async () => {
    state.orgRow = orgWith({ notify_damage_reports: false });
    await notifySubmission(baseInput);
    expect(sendMock).not.toHaveBeenCalled();
    expect(logMock).toHaveBeenCalledWith(expect.objectContaining({ outcome: "skipped_disabled" }));
  });
});

describe("the email is built from the committed row (D1)", () => {
  it("uses the saved submitter and description, not anything carried in the scheduled payload", async () => {
    const untrusted = {
      ...baseInput,
      submittedBy: { name: "Browser Name", email: "browser@evil.test", phone: null },
      summary: "Browser summary",
    };
    await notifySubmission(untrusted as unknown as typeof baseInput);
    const { text, html } = sentContent();
    expect(text).toContain("Saved Name");
    expect(text).toContain("Hydraulic hose is weeping at the boom coupling.");
    for (const part of [text, html]) {
      expect(part).not.toContain("Browser Name");
      expect(part).not.toContain("browser@evil.test");
      expect(part).not.toContain("Browser summary");
    }
  });

  it("applies the deterministic priority to the subject", async () => {
    await notifySubmission(baseInput);
    expect(sentContent().subject).toBe("Follow up: EXC-001 — reported urgency: high");
  });

  it("loads the asset scoped to the scheduling organization", async () => {
    await notifySubmission(baseInput);
    expect(state.queries).toContainEqual({ table: "assets", column: "organization_id", value: ORG_ID });
    expect(state.queries).toContainEqual({ table: "form_submissions", column: "id", value: SUBMISSION_ID });
  });

  it("renders a renter return checklist from its saved answers", async () => {
    state.submissionRow = returnRowV2({
      template: templateV2_20260702(),
      values: { ...cleanGeneratorValues(), oil_level: "fail" },
      flags: CLEAN_FLAGS,
    });
    await notifySubmission({ ...baseInput, formType: "return_checklist" });
    expect(sentContent().subject).toBe("Follow up: EXC-001 — renter return checklist, 1 exception");
    expect(sentContent().text).toContain("- Failed check: Oil level");
  });

  it("times load, projection and send as separate phases", async () => {
    await notifySubmission(baseInput);
    expect(timeMock.mock.calls.map((call) => call[1])).toEqual(["notify.load", "notify.project", "notify.send"]);
  });
});

describe("fail closed on anything that does not match what was scheduled", () => {
  it.each([
    ["record_missing", () => (state.submissionRow = null)],
    ["organization_mismatch", () => (state.submissionRow = { ...state.submissionRow, organization_id: OTHER_ORG_ID })],
    ["asset_mismatch", () => (state.submissionRow = { ...state.submissionRow, asset_id: "a0000000-0000-4000-8000-0000000000ff" })],
    ["form_type_mismatch", () => (state.submissionRow = { ...state.submissionRow, form_type: "support_request" })],
    ["origin_mismatch", () => (state.submissionRow = { ...state.submissionRow, submission_origin: "staff" })],
    ["asset_missing", () => (state.assetRow = null)],
    ["load_error", () => (state.submissionError = { message: "connection reset" })],
  ])("%s → no send, one redacted failure line", async (failureClass, arrange) => {
    arrange();
    await notifySubmission(baseInput);
    expect(sendMock).not.toHaveBeenCalled();
    const logged = loggedFailure();
    expect(logged).toMatchObject({ event: "submission", outcome: "failed_transient", failureClass });
    // Only coarse classes and redacted metadata — never a value from the row.
    const serialized = JSON.stringify(logged);
    expect(serialized).not.toContain("Hydraulic");
    expect(serialized).not.toContain("Saved Name");
    expect(serialized).not.toContain("org/");
  });

  it("refuses a staff return scheduled as a renter return", async () => {
    state.submissionRow = returnRowV2({
      template: templateV2_20260702(),
      values: cleanGeneratorValues(),
      flags: CLEAN_FLAGS,
      overrides: { submission_origin: "staff" },
    });
    await notifySubmission({ ...baseInput, formType: "return_checklist" });
    expect(sendMock).not.toHaveBeenCalled();
    expect(loggedFailure()).toMatchObject({ failureClass: "origin_mismatch" });
  });
});

describe("notifySubmission send passthrough", () => {
  it("passes the send outcome through to the log (dry_run)", async () => {
    await notifySubmission(baseInput);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(logMock).toHaveBeenCalledWith(expect.objectContaining({ outcome: "dry_run" }));
  });

  it("records a sent outcome with the provider id and the row-derived reference", async () => {
    state.sendResult = { outcome: "sent", attempts: 1, providerId: "resend-9" };
    await notifySubmission({ ...baseInput, reference: "SUB-0000-STALE0" });
    expect(logMock).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "sent", providerId: "resend-9", reference: "SUB-2026-7C0A55" })
    );
  });

  it("records the dry-run reason so an operator can see WHY nothing was sent (Preview stays dry-run)", async () => {
    state.sendResult = { outcome: "dry_run", attempts: 0, reason: "preview_environment" };
    await notifySubmission(baseInput);
    expect(logMock).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "dry_run", reason: "preview_environment" })
    );
  });
});

describe("submission-safety", () => {
  it("never throws even if the sender throws, and logs a failure", async () => {
    state.sendThrows = true;
    await expect(notifySubmission(baseInput)).resolves.toBeUndefined();
    expect(logMock).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "failed_transient", failureClass: "exception" })
    );
  });
});

describe("notifySubmission — provider options (B4, unchanged by D1)", () => {
  it("derives the idempotency key from the submission id and the recipient", async () => {
    await notifySubmission(baseInput);
    expect(sendOptions().idempotencyKey).toBe(
      notificationIdempotencyKey({ event: "submission", reference: SUBMISSION_ID, recipient: "owner@yard.test" })
    );
    expect(sendOptions().idempotencyKey).toMatch(/^mm\.submission\.7c0a55e1-2222-4222-8222-222222222222\.[0-9a-f]{8}$/);
  });

  it("produces an identical key on a replay of the same submission", async () => {
    await notifySubmission(baseInput);
    await notifySubmission(baseInput);
    expect(sendOptions(0).idempotencyKey).toBe(sendOptions(1).idempotencyKey);
  });

  it("produces a different key for a different submission", async () => {
    await notifySubmission(baseInput);
    const otherId = "7c0a55e1-3333-4333-8333-333333333333";
    state.submissionRow = { ...state.submissionRow, id: otherId };
    await notifySubmission({ ...baseInput, submissionId: otherId });
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
    expect(text).toContain(`https://mulemark.io/dashboard/submissions/${SUBMISSION_ID}`);
    expect(text).toContain("https://mulemark.io/dashboard/settings");
    expect(text).not.toContain("vercel.app");
    expect(text).not.toContain("localhost");
  });

  it("carries no private media path or signed URL into the message", async () => {
    await notifySubmission(baseInput);
    const { text, html } = sentContent();
    for (const banned of ["/storage/v1/", "signedurl", "token=", "supabase.co", "org/", ".jpg"]) {
      expect(text.toLowerCase()).not.toContain(banned);
      expect(html.toLowerCase()).not.toContain(banned);
    }
  });
});

describe("notifyTagRequestStatus (B4)", () => {
  const tagInput = { organizationId: ORG_ID, tagRequestId: "tr-9", status: "in_production" };

  it("sends, and logs the tag request id as the canonical reference", async () => {
    await notifyTagRequestStatus(tagInput);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(logMock).toHaveBeenCalledWith(expect.objectContaining({ event: "tag_status", reference: "tr-9" }));
  });

  it("links to the tag request's own page and renders the actual status", async () => {
    await notifyTagRequestStatus(tagInput);
    const { text } = sentContent();
    expect(text).toContain("View tag request: https://mulemark.io/dashboard/tag-requests/tr-9");
    expect(text).toContain("Status: In production");
  });

  /** A real status CHANGE must send, a replay of the same status must not. */
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
    expect(logMock).toHaveBeenCalledWith(expect.objectContaining({ outcome: "skipped_disabled", reference: "tr-9" }));
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
